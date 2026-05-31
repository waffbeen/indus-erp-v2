import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/index";
import { vendors } from "../db/schema/vendors";
import { vendorScorecards } from "../db/schema/vendor_scorecards";
import { logger } from "../lib/logger";
import type { VendorScorecard, VendorScorecardsResult } from "@indus/shared";

/**
 * Vendor scorecards — supplier performance distilled from PO + GRN history.
 * Computed LIVE so the numbers are always current; each run also best-effort
 * snapshots into `vendor_scorecards` for trend history (failures there never
 * break the live response — e.g. before the table is migrated).
 *
 * Metrics:
 *   - onTimePct        GRNs received on/before the PO's committed delivery date
 *   - qualityPct       accepted qty ÷ received qty across GRNs
 *   - priceIndex       vendor's prices vs cross-vendor item average (100 = market)
 *   - responsivenessPct PO acknowledge latency mapped to a 0–100 score
 *   - avgLeadTimeDays  order date → goods-received date
 *
 * Everything is tenant-scoped; only finalised POs feed the spend/quality math.
 */

const FINAL_PO_STATUSES = ["approved", "sent_to_vendor", "partially_received", "received", "closed"] as const;

type PoAgg = {
  vendor_id: string;
  po_count: number;
  total_paise: string;
  avg_ack_hours: number | null;
};
type GrnAgg = {
  vendor_id: string;
  grn_count: number;
  on_time_count: number;
  datable_count: number;
  avg_lead_days: number | null;
};
type QualityAgg = {
  vendor_id: string;
  recv: number;
  acc: number;
};
type PriceRow = {
  vendor_id: string;
  item_name: string;
  unit_price_paise: string;
  quantity_scaled: number;
};

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.min(Math.max(n, lo), hi);
}

/** Map PO-acknowledge latency (hours) to a 0–100 responsiveness score. */
function ackScore(hours: number | null): number | null {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return null;
  if (hours <= 12) return 100;
  if (hours <= 24) return 90;
  if (hours <= 48) return 75;
  if (hours <= 72) return 60;
  if (hours <= 120) return 45;
  return 25;
}

function gradeFor(score: number): "A" | "B" | "C" | "D" {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  return "D";
}

export async function getScorecards(tenantId: string): Promise<VendorScorecardsResult> {
  const finalList = sql.join(
    FINAL_PO_STATUSES.map((s) => sql`${s}`),
    sql`, `,
  );

  const [poAgg, grnAgg, qualityAgg, priceRows, vendorRows] = await Promise.all([
    db.execute<PoAgg>(sql`
      SELECT vendor_id,
             COUNT(*)::int AS po_count,
             COALESCE(SUM(total_paise::bigint), 0)::text AS total_paise,
             AVG(EXTRACT(EPOCH FROM (acknowledged_at - sent_to_vendor_at)) / 3600)
               FILTER (WHERE acknowledged_at IS NOT NULL AND sent_to_vendor_at IS NOT NULL) AS avg_ack_hours
      FROM purchase_orders
      WHERE tenant_id = ${tenantId}
        AND deleted_at IS NULL
        AND status IN (${finalList})
      GROUP BY vendor_id`),

    db.execute<GrnAgg>(sql`
      SELECT g.vendor_id,
             COUNT(*)::int AS grn_count,
             COUNT(*) FILTER (WHERE po.delivery_date IS NOT NULL AND g.received_date <= po.delivery_date)::int AS on_time_count,
             COUNT(*) FILTER (WHERE po.delivery_date IS NOT NULL)::int AS datable_count,
             AVG(EXTRACT(EPOCH FROM (g.received_date - po.created_at)) / 86400)
               FILTER (WHERE g.received_date IS NOT NULL) AS avg_lead_days
      FROM grns g
      JOIN purchase_orders po ON po.id = g.po_id
      WHERE g.tenant_id = ${tenantId}
        AND g.deleted_at IS NULL
        AND g.status <> 'cancelled'
      GROUP BY g.vendor_id`),

    db.execute<QualityAgg>(sql`
      SELECT g.vendor_id,
             COALESCE(SUM(gi.received_quantity_scaled), 0)::int AS recv,
             COALESCE(SUM(gi.accepted_quantity_scaled), 0)::int AS acc
      FROM grn_items gi
      JOIN grns g ON g.id = gi.grn_id
      WHERE g.tenant_id = ${tenantId}
        AND g.deleted_at IS NULL
        AND g.status <> 'cancelled'
      GROUP BY g.vendor_id`),

    db.execute<PriceRow>(sql`
      SELECT po.vendor_id,
             pi.item_name,
             pi.unit_price_paise,
             pi.quantity_scaled
      FROM po_items pi
      JOIN purchase_orders po ON po.id = pi.po_id
      WHERE po.tenant_id = ${tenantId}
        AND po.deleted_at IS NULL
        AND po.status IN (${finalList})`),

    db
      .select({
        id: vendors.id,
        name: vendors.name,
        code: vendors.code,
        ratingScaled: vendors.ratingScaled,
        ratingCount: vendors.ratingCount,
      })
      .from(vendors)
      .where(and(eq(vendors.tenantId, tenantId), isNull(vendors.deletedAt))),
  ]);

  // --- price index: each vendor's weighted price vs the cross-vendor mean ----
  const itemPrices = new Map<string, number[]>();
  for (const r of priceRows.rows) {
    const price = Number(r.unit_price_paise);
    if (!Number.isFinite(price) || price <= 0) continue;
    const arr = itemPrices.get(r.item_name) ?? [];
    arr.push(price);
    itemPrices.set(r.item_name, arr);
  }
  const itemAvg = new Map<string, number>();
  for (const [name, prices] of itemPrices) {
    itemAvg.set(name, prices.reduce((s, p) => s + p, 0) / prices.length);
  }
  // Per-vendor qty-weighted ratio accumulator.
  const vendorPrice = new Map<string, { weightedRatio: number; weight: number }>();
  for (const r of priceRows.rows) {
    const price = Number(r.unit_price_paise);
    const avg = itemAvg.get(r.item_name);
    const qty = Number(r.quantity_scaled);
    if (!avg || avg <= 0 || !Number.isFinite(price) || price <= 0 || !Number.isFinite(qty) || qty <= 0) continue;
    const acc = vendorPrice.get(r.vendor_id) ?? { weightedRatio: 0, weight: 0 };
    acc.weightedRatio += (price / avg) * qty;
    acc.weight += qty;
    vendorPrice.set(r.vendor_id, acc);
  }

  const poByVendor = new Map(poAgg.rows.map((r) => [r.vendor_id, r]));
  const grnByVendor = new Map(grnAgg.rows.map((r) => [r.vendor_id, r]));
  const qualByVendor = new Map(qualityAgg.rows.map((r) => [r.vendor_id, r]));

  const scorecards: VendorScorecard[] = [];
  for (const v of vendorRows) {
    const po = poByVendor.get(v.id);
    if (!po || po.po_count === 0) continue; // only vendors we've actually ordered from
    const grn = grnByVendor.get(v.id);
    const qual = qualByVendor.get(v.id);

    const onTimePct =
      grn && grn.datable_count > 0 ? Math.round((grn.on_time_count / grn.datable_count) * 100) : null;
    const qualityPct = qual && qual.recv > 0 ? Math.round((qual.acc / qual.recv) * 100) : null;

    const priceAcc = vendorPrice.get(v.id);
    const priceIndex =
      priceAcc && priceAcc.weight > 0 ? Math.round((priceAcc.weightedRatio / priceAcc.weight) * 100) : null;

    const responsivenessPct = ackScore(po.avg_ack_hours);
    const avgLeadTimeDays =
      grn && grn.avg_lead_days !== null && grn.avg_lead_days !== undefined
        ? Math.round(grn.avg_lead_days * 10) / 10
        : null;

    // Blended overall score (neutral defaults when a dimension has no data).
    const onTimeScore = onTimePct ?? 70;
    const qualityScore = qualityPct ?? 90;
    const priceScore = priceIndex === null ? 70 : clamp(100 - (priceIndex - 100));
    const respScore = responsivenessPct ?? 60;
    const overallScore = Math.round(
      onTimeScore * 0.35 + qualityScore * 0.3 + priceScore * 0.25 + respScore * 0.1,
    );

    scorecards.push({
      vendorId: v.id,
      vendorName: v.name,
      vendorCode: v.code ?? null,
      poCount: po.po_count,
      grnCount: grn?.grn_count ?? 0,
      totalOrderedPaise: po.total_paise,
      onTimePct,
      qualityPct,
      priceIndex,
      responsivenessPct,
      avgLeadTimeDays,
      manualRating: v.ratingCount > 0 ? Math.round((v.ratingScaled / 100) * 10) / 10 : null,
      overallScore,
      grade: gradeFor(overallScore),
    });
  }

  scorecards.sort((a, b) => b.overallScore - a.overallScore);

  // Best-effort snapshot (never blocks the response).
  void persistSnapshot(tenantId, scorecards);

  return { scorecards, generatedAt: new Date().toISOString() };
}

export async function getVendorScore(tenantId: string, vendorId: string): Promise<VendorScorecard | null> {
  const { scorecards } = await getScorecards(tenantId);
  return scorecards.find((s) => s.vendorId === vendorId) ?? null;
}

/** Replace the tenant's snapshot rows with the freshly computed set. */
async function persistSnapshot(tenantId: string, cards: VendorScorecard[]): Promise<void> {
  if (!cards.length) return;
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(vendorScorecards)
        .set({ deletedAt: new Date() })
        .where(and(eq(vendorScorecards.tenantId, tenantId), isNull(vendorScorecards.deletedAt)));
      await tx.insert(vendorScorecards).values(
        cards.map((c) => ({
          tenantId,
          vendorId: c.vendorId,
          poCount: c.poCount,
          grnCount: c.grnCount,
          totalOrderedPaise: c.totalOrderedPaise,
          onTimePct: c.onTimePct,
          qualityPct: c.qualityPct,
          priceIndex: c.priceIndex,
          responsivenessPct: c.responsivenessPct,
          avgLeadTimeDays: c.avgLeadTimeDays === null ? null : Math.round(c.avgLeadTimeDays),
          overallScore: c.overallScore,
          grade: c.grade,
        })),
      );
    });
  } catch (err) {
    logger.warn({ err, tenantId }, "vendor_scorecard_snapshot_skipped");
  }
}
