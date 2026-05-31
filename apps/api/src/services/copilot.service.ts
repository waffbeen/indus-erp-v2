import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/index";
import { purchaseRequisitions, prItems } from "../db/schema/pr";
import { items as itemsTable } from "../db/schema/items";
import { NotFound, BadRequest } from "../lib/errors";
import { logger } from "../lib/logger";
import { aiComplete, AiNotConfiguredError, getAiStatus } from "./ai.service";
import type {
  RecommendVendorsRequest,
  RecommendVendorsResult,
  VendorRecommendation,
  SuggestedPo,
  SuggestedPoLine,
} from "@indus/shared";

/**
 * AI Procurement Copilot — advisory only. Nothing here writes to the database.
 *
 *  - recommendVendors: ranks suppliers for an item/PR from PO + GRN history
 *    (pure data — works with or without an AI key).
 *  - draftPoFromPr: assembles a SUGGESTED purchase order from an approved PR +
 *    vendor history; an AI model (when configured) adds the narrative/terms,
 *    otherwise a transparent heuristic fills them in. The user reviews and
 *    raises the real PO themselves.
 */

const FINAL_PO_STATUSES = ["approved", "sent_to_vendor", "partially_received", "received", "closed"];

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.min(Math.max(n, lo), hi);
}

function finalStatusFragment() {
  return sql.join(FINAL_PO_STATUSES.map((s) => sql`${s}`), sql`, `);
}

// ---------------------------------------------------------------------------
// Vendor recommendations
// ---------------------------------------------------------------------------

type VendorPriceRow = {
  vendor_id: string;
  vendor_name: string | null;
  po_count: number;
  avg_unit_price_paise: string;
};
type VendorPerfRow = {
  vendor_id: string;
  grn_count: number;
  on_time_count: number;
  datable_count: number;
  recv: number;
  acc: number;
  avg_lead_days: number | null;
};

/** Resolve the target item names a recommendation should consider. */
async function resolveScope(tenantId: string, req: RecommendVendorsRequest): Promise<string[]> {
  if (req.itemId) {
    const [item] = await db
      .select({ name: itemsTable.name })
      .from(itemsTable)
      .where(and(eq(itemsTable.id, req.itemId), eq(itemsTable.tenantId, tenantId), isNull(itemsTable.deletedAt)))
      .limit(1);
    if (!item) throw NotFound("item_not_found", "Item not found");
    return [item.name];
  }
  // prId
  const [pr] = await db
    .select({ id: purchaseRequisitions.id })
    .from(purchaseRequisitions)
    .where(
      and(
        eq(purchaseRequisitions.id, req.prId!),
        eq(purchaseRequisitions.tenantId, tenantId),
        isNull(purchaseRequisitions.deletedAt),
      ),
    )
    .limit(1);
  if (!pr) throw NotFound("pr_not_found", "Requisition not found");
  const lines = await db
    .select({ itemName: prItems.itemName })
    .from(prItems)
    .where(eq(prItems.prId, req.prId!));
  return Array.from(new Set(lines.map((l) => l.itemName)));
}

export async function recommendVendors(
  tenantId: string,
  req: RecommendVendorsRequest,
): Promise<RecommendVendorsResult> {
  const scope = await resolveScope(tenantId, req);
  if (scope.length === 0) return { scope, recommendations: [] };

  const nameList = sql.join(scope.map((n) => sql`${n}`), sql`, `);

  // Item-scoped price + frequency per vendor.
  const priceRows = await db.execute<VendorPriceRow>(sql`
    SELECT po.vendor_id, v.name AS vendor_name,
           COUNT(DISTINCT po.id)::int AS po_count,
           CASE WHEN SUM(pi.quantity_scaled) > 0
                THEN (SUM(pi.unit_price_paise::bigint * pi.quantity_scaled) / SUM(pi.quantity_scaled))::text
                ELSE '0' END AS avg_unit_price_paise
    FROM po_items pi
    JOIN purchase_orders po ON po.id = pi.po_id
    LEFT JOIN vendors v ON v.id = po.vendor_id
    WHERE po.tenant_id = ${tenantId}
      AND po.deleted_at IS NULL
      AND po.status IN (${finalStatusFragment()})
      AND pi.item_name IN (${nameList})
    GROUP BY po.vendor_id, v.name`);

  if (priceRows.rows.length === 0) return { scope, recommendations: [] };

  const vendorIds = priceRows.rows.map((r) => r.vendor_id);
  const vendorIdList = sql.join(vendorIds.map((id) => sql`${id}`), sql`, `);

  // Overall delivery/quality performance for the candidate vendors.
  const perfRows = await db.execute<VendorPerfRow>(sql`
    SELECT g.vendor_id,
           COUNT(*)::int AS grn_count,
           COUNT(*) FILTER (WHERE po.delivery_date IS NOT NULL AND g.received_date <= po.delivery_date)::int AS on_time_count,
           COUNT(*) FILTER (WHERE po.delivery_date IS NOT NULL)::int AS datable_count,
           COALESCE(SUM(gi.received_quantity_scaled), 0)::int AS recv,
           COALESCE(SUM(gi.accepted_quantity_scaled), 0)::int AS acc,
           AVG(EXTRACT(EPOCH FROM (g.received_date - po.created_at)) / 86400) AS avg_lead_days
    FROM grns g
    JOIN purchase_orders po ON po.id = g.po_id
    LEFT JOIN grn_items gi ON gi.grn_id = g.id
    WHERE g.tenant_id = ${tenantId}
      AND g.deleted_at IS NULL
      AND g.status <> 'cancelled'
      AND g.vendor_id IN (${vendorIdList})
    GROUP BY g.vendor_id`);
  const perfByVendor = new Map(perfRows.rows.map((r) => [r.vendor_id, r]));

  // Cheapest candidate sets the price-score baseline.
  const prices = priceRows.rows
    .map((r) => Number(r.avg_unit_price_paise))
    .filter((p) => Number.isFinite(p) && p > 0);
  const minPrice = prices.length ? Math.min(...prices) : 0;

  const recs: Omit<VendorRecommendation, "rank">[] = priceRows.rows.map((r) => {
    const perf = perfByVendor.get(r.vendor_id);
    const avgPrice = Number(r.avg_unit_price_paise);
    const onTimePct = perf && perf.datable_count > 0 ? Math.round((perf.on_time_count / perf.datable_count) * 100) : null;
    const qualityPct = perf && perf.recv > 0 ? Math.round((perf.acc / perf.recv) * 100) : null;
    const avgLeadTimeDays =
      perf && perf.avg_lead_days !== null && perf.avg_lead_days !== undefined
        ? Math.round(perf.avg_lead_days * 10) / 10
        : null;

    const priceScore = avgPrice > 0 && minPrice > 0 ? clamp((minPrice / avgPrice) * 100) : 60;
    const qualityScore = qualityPct ?? 85;
    const onTimeScore = onTimePct ?? 70;
    const leadScore = avgLeadTimeDays !== null ? clamp(100 - avgLeadTimeDays * 2) : 60;
    const score = Math.round(priceScore * 0.4 + qualityScore * 0.25 + onTimeScore * 0.25 + leadScore * 0.1);

    const reasons: string[] = [];
    if (avgPrice > 0) {
      if (minPrice > 0 && avgPrice === minPrice) reasons.push("Lowest average price among past suppliers");
      reasons.push(`Avg rate ₹${(avgPrice / 100).toLocaleString("en-IN")}/unit across history`);
    }
    if (onTimePct !== null) reasons.push(`${onTimePct}% on-time delivery`);
    if (qualityPct !== null) reasons.push(`${qualityPct}% of received qty accepted`);
    if (avgLeadTimeDays !== null) reasons.push(`Avg lead time ~${avgLeadTimeDays} days`);
    reasons.push(`Supplied these item(s) on ${r.po_count} order(s)`);

    return {
      vendorId: r.vendor_id,
      vendorName: r.vendor_name ?? "Unknown vendor",
      score,
      avgUnitPricePaise: avgPrice > 0 ? r.avg_unit_price_paise : null,
      onTimePct,
      qualityPct,
      avgLeadTimeDays,
      poCount: r.po_count,
      reasons,
    };
  });

  recs.sort((a, b) => b.score - a.score);
  const recommendations: VendorRecommendation[] = recs.map((r, i) => ({ ...r, rank: i + 1 }));
  return { scope, recommendations };
}

// ---------------------------------------------------------------------------
// Draft PO from a PR
// ---------------------------------------------------------------------------

const DRAFT_PO_SYSTEM = `You are a procurement assistant helping a buyer turn an approved purchase requisition into a draft purchase order for an Indian business.
You are given the requisition lines, a recommended vendor, and that vendor's historical prices.
Return ONLY JSON with this exact shape:
{
  "vendorReason": string,           // one sentence: why this vendor is a sensible default
  "paymentTerms": string,           // e.g. "Net 30", "50% advance, balance on delivery"
  "deliveryTerms": string,          // e.g. "FOR site, Mumbai"
  "notes": string,                  // a short internal note for the buyer reviewing the draft
  "lineReasons": { "<prItemId>": string }   // brief note per line (e.g. price basis / a caution)
}
Be concise and practical. Never invent prices or vendor names beyond what is provided. Money is in Indian Rupees.`;

interface AiDraftExtras {
  vendorReason?: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  notes?: string;
  lineReasons?: Record<string, string>;
}

export async function draftPoFromPr(tenantId: string, prId: string): Promise<SuggestedPo> {
  const [pr] = await db
    .select()
    .from(purchaseRequisitions)
    .where(
      and(
        eq(purchaseRequisitions.id, prId),
        eq(purchaseRequisitions.tenantId, tenantId),
        isNull(purchaseRequisitions.deletedAt),
      ),
    )
    .limit(1);
  if (!pr) throw NotFound("pr_not_found", "Requisition not found");
  if (["cancelled", "rejected"].includes(pr.status)) {
    throw BadRequest("pr_not_eligible", "This requisition was cancelled or rejected — nothing to draft");
  }

  const lines = await db.select().from(prItems).where(eq(prItems.prId, prId)).orderBy(prItems.sortOrder);
  if (lines.length === 0) throw BadRequest("pr_empty", "This requisition has no line items");

  // 1) Recommend a vendor from history.
  const { recommendations } = await recommendVendors(tenantId, { prId });
  const topVendor = recommendations[0] ?? null;

  // 2) Pull the top vendor's most recent price per item, for line pricing.
  const vendorPriceByItem = new Map<string, string>();
  if (topVendor) {
    const names = Array.from(new Set(lines.map((l) => l.itemName)));
    const nameList = sql.join(names.map((n) => sql`${n}`), sql`, `);
    const priceRows = await db.execute<{ item_name: string; unit_price_paise: string }>(sql`
      SELECT DISTINCT ON (pi.item_name) pi.item_name, pi.unit_price_paise
      FROM po_items pi
      JOIN purchase_orders po ON po.id = pi.po_id
      WHERE po.tenant_id = ${tenantId}
        AND po.vendor_id = ${topVendor.vendorId}
        AND po.deleted_at IS NULL
        AND po.status IN (${finalStatusFragment()})
        AND pi.item_name IN (${nameList})
      ORDER BY pi.item_name, po.created_at DESC`);
    for (const r of priceRows.rows) vendorPriceByItem.set(r.item_name, r.unit_price_paise);
  }

  // Pull item-master fallback prices for lines lacking a PR estimate.
  const itemIds = lines.map((l) => l.itemId).filter((x): x is string => Boolean(x));
  const masterPrice = new Map<string, string | null>();
  if (itemIds.length) {
    const masterRows = await db
      .select({ id: itemsTable.id, last: itemsTable.lastPurchasePricePaise })
      .from(itemsTable)
      .where(and(eq(itemsTable.tenantId, tenantId), inArrayIds(itemIds)));
    for (const m of masterRows) masterPrice.set(m.id, m.last ?? null);
  }

  // 3) Build the suggested lines with a transparent price basis.
  const caveats: string[] = [];
  const suggestedLines: SuggestedPoLine[] = lines.map((l) => {
    const qty = l.quantityScaled / 1000;
    let unitPaise = "0";
    let basis: SuggestedPoLine["priceBasis"] = "none";

    const vendorPrice = vendorPriceByItem.get(l.itemName);
    if (vendorPrice && Number(vendorPrice) > 0) {
      unitPaise = vendorPrice;
      basis = "vendor_history";
    } else if (l.estimatedUnitPricePaise && Number(l.estimatedUnitPricePaise) > 0) {
      unitPaise = l.estimatedUnitPricePaise;
      basis = "pr_estimate";
    } else if (l.lastPurchaseRatePaise && Number(l.lastPurchaseRatePaise) > 0) {
      unitPaise = l.lastPurchaseRatePaise;
      basis = "last_purchase";
    } else if (l.itemId && masterPrice.get(l.itemId) && Number(masterPrice.get(l.itemId)) > 0) {
      unitPaise = masterPrice.get(l.itemId)!;
      basis = "last_purchase";
    }

    if (basis === "none") caveats.push(`No price history for "${l.itemName}" — enter a rate manually.`);

    // line total = (qtyScaled / 1000) × unitPaise, kept in integer paise.
    const lineTotal = (BigInt(l.quantityScaled) * BigInt(Number(unitPaise) || 0)) / 1000n;
    return {
      prItemId: l.id,
      itemId: l.itemId ?? null,
      itemName: l.itemName,
      uom: l.uom,
      quantity: qty,
      suggestedUnitPricePaise: unitPaise,
      priceBasis: basis,
      lineTotalPaise: lineTotal.toString(),
      reason: null,
    };
  });

  const estimatedTotal = suggestedLines.reduce((s, l) => s + BigInt(l.lineTotalPaise), 0n);

  // 4) Heuristic defaults; AI enriches when a key is available.
  let vendorReason = topVendor
    ? `${topVendor.vendorName} ranks #1 on price & reliability for these items (${topVendor.reasons[0] ?? "history"}).`
    : null;
  let paymentTerms: string | null = pr.referenceNo ? null : "Net 30";
  let deliveryTerms: string | null = null;
  let notes: string | null = "Auto-drafted from the requisition — review prices, vendor and terms before raising the PO.";
  let aiGenerated = false;

  const status = await getAiStatus(tenantId);
  const aiConfigured = status.configured;

  if (aiConfigured && topVendor) {
    try {
      const payload = {
        requisition: { prNumber: pr.prNumber, title: pr.title, priority: pr.priority, prType: pr.prType },
        recommendedVendor: {
          name: topVendor.vendorName,
          onTimePct: topVendor.onTimePct,
          qualityPct: topVendor.qualityPct,
          avgLeadTimeDays: topVendor.avgLeadTimeDays,
        },
        lines: suggestedLines.map((l) => ({
          prItemId: l.prItemId,
          itemName: l.itemName,
          quantity: l.quantity,
          uom: l.uom,
          suggestedUnitRupees: Number(l.suggestedUnitPricePaise) / 100,
          priceBasis: l.priceBasis,
        })),
      };
      const result = await aiComplete({
        tenantId,
        system: DRAFT_PO_SYSTEM,
        messages: [{ role: "user", content: JSON.stringify(payload) }],
        json: true,
        maxTokens: 1200,
      });
      const extras = (result.json ?? {}) as AiDraftExtras;
      if (extras.vendorReason) vendorReason = extras.vendorReason;
      if (extras.paymentTerms) paymentTerms = extras.paymentTerms;
      if (extras.deliveryTerms) deliveryTerms = extras.deliveryTerms;
      if (extras.notes) notes = extras.notes;
      if (extras.lineReasons) {
        for (const line of suggestedLines) {
          const reason = extras.lineReasons[line.prItemId ?? ""];
          if (reason) line.reason = reason;
        }
      }
      aiGenerated = true;
    } catch (err) {
      if (!(err instanceof AiNotConfiguredError)) {
        logger.warn({ err, tenantId, prId }, "copilot_draft_ai_failed_using_heuristic");
      }
    }
  }

  return {
    prId: pr.id,
    prNumber: pr.prNumber,
    prTitle: pr.title,
    companyId: pr.companyId,
    unitId: pr.unitId,
    vendorId: topVendor?.vendorId ?? null,
    vendorName: topVendor?.vendorName ?? null,
    vendorReason,
    paymentTerms,
    deliveryTerms,
    notes,
    lines: suggestedLines,
    estimatedTotalPaise: estimatedTotal.toString(),
    aiGenerated,
    aiConfigured,
    caveats: Array.from(new Set(caveats)),
  };
}

/** Small local helper to keep the drizzle `inArray` import out of this file's
 *  hot path while still scoping item-master lookups by id. */
function inArrayIds(ids: string[]) {
  return sql`${itemsTable.id} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`;
}
