import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/index";
import { anomalyFlags } from "../db/schema/anomaly_flags";
import { auditLogs } from "../db/schema/audit_logs";
import { NotFound } from "../lib/errors";
import { logger } from "../lib/logger";
import type {
  AnomalyFlag,
  AnomalyKind,
  AnomalyScanResult,
  AnomalySeverity,
  AnomalyUpdate,
} from "@indus/shared";

/**
 * Spend-integrity scan. Detects four classic procurement red flags from the
 * tenant's own data and stores them as advisory `anomaly_flags`:
 *
 *   price_spike       — a unit price jumped sharply vs the item's last purchase
 *   split_po          — several sub-threshold POs to one vendor in a short window
 *   duplicate_invoice — same vendor + invoice number + amount seen twice
 *   round_amount      — totals just under the approval limit or suspiciously round
 *
 * A re-scan soft-deletes the prior `open` flags and inserts fresh ones, but
 * never re-surfaces a flag the user has `dismissed` (matched by fingerprint).
 * Nothing here blocks a transaction — it only points humans at things to check.
 */

interface ActorContext {
  tenantId: string;
  userId: string;
  isTenantAdmin: boolean;
  ipAddress?: string;
  userAgent?: string;
}

/** Default approval ceiling used by the split-PO / round-amount heuristics
 *  (₹1,00,000 in paise). Kept constant for predictable behaviour. */
const APPROVAL_THRESHOLD_PAISE = 10_000_000;
const PRICE_SPIKE_PCT = 0.25; // ≥25% jump vs last purchase
const SPLIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const LOOKBACK_MS = 180 * 24 * 60 * 60 * 1000;
const PER_KIND_CAP = 60;

const FINAL_PO_STATUSES = ["approved", "sent_to_vendor", "partially_received", "received", "closed"];
const ACTIVE_PO_STATUSES = ["pending_approval", ...FINAL_PO_STATUSES];

type Candidate = {
  kind: AnomalyKind;
  severity: AnomalySeverity;
  title: string;
  detail: Record<string, unknown>;
  resourceType: string | null;
  resourceId: string | null;
  fingerprint: string;
};

const SEVERITY_RANK: Record<AnomalySeverity, number> = { high: 3, medium: 2, low: 1 };

// ---------------------------------------------------------------------------
// Detectors — each returns candidate flags; scan() persists them.
// ---------------------------------------------------------------------------

async function detectPriceSpikes(tenantId: string, since: Date): Promise<Candidate[]> {
  const rows = await db.execute<{
    po_id: string;
    po_number: string | null;
    item_name: string;
    unit_price_paise: string;
    created_at: string;
    vendor_name: string | null;
  }>(sql`
    SELECT po.id AS po_id, po.po_number, pi.item_name, pi.unit_price_paise,
           po.created_at::text AS created_at, v.name AS vendor_name
    FROM po_items pi
    JOIN purchase_orders po ON po.id = pi.po_id
    LEFT JOIN vendors v ON v.id = po.vendor_id
    WHERE po.tenant_id = ${tenantId}
      AND po.deleted_at IS NULL
      AND po.status IN (${sql.join(FINAL_PO_STATUSES.map((s) => sql`${s}`), sql`, `)})
    ORDER BY pi.item_name ASC, po.created_at ASC`);

  const out: Candidate[] = [];
  const prev = new Map<string, { price: number; poNumber: string | null }>();
  for (const r of rows.rows) {
    const price = Number(r.unit_price_paise);
    if (!Number.isFinite(price) || price <= 0) continue;
    const last = prev.get(r.item_name);
    if (last && price > last.price * (1 + PRICE_SPIKE_PCT)) {
      const createdAt = new Date(r.created_at);
      if (createdAt.getTime() >= since.getTime()) {
        const pct = Math.round(((price - last.price) / last.price) * 100);
        const severity: AnomalySeverity = pct >= 100 ? "high" : pct >= 50 ? "medium" : "low";
        out.push({
          kind: "price_spike",
          severity,
          title: `Price of "${r.item_name}" rose ${pct}% vs last purchase`,
          detail: {
            itemName: r.item_name,
            vendorName: r.vendor_name,
            previousUnitPricePaise: String(last.price),
            currentUnitPricePaise: String(price),
            pctIncrease: pct,
            previousPoNumber: last.poNumber,
            poNumber: r.po_number,
          },
          resourceType: "po",
          resourceId: r.po_id,
          fingerprint: `price_spike:${r.po_id}:${r.item_name}:${price}`,
        });
      }
    }
    prev.set(r.item_name, { price, poNumber: r.po_number });
  }
  return out;
}

async function detectSplitPos(tenantId: string, since: Date): Promise<Candidate[]> {
  const rows = await db.execute<{
    id: string;
    po_number: string | null;
    vendor_id: string;
    vendor_name: string | null;
    total_paise: string;
    created_at: string;
  }>(sql`
    SELECT po.id, po.po_number, po.vendor_id, v.name AS vendor_name,
           po.total_paise, po.created_at::text AS created_at
    FROM purchase_orders po
    LEFT JOIN vendors v ON v.id = po.vendor_id
    WHERE po.tenant_id = ${tenantId}
      AND po.deleted_at IS NULL
      AND po.status IN (${sql.join(ACTIVE_PO_STATUSES.map((s) => sql`${s}`), sql`, `)})
      AND po.created_at >= ${since}
    ORDER BY po.vendor_id ASC, po.created_at ASC`);

  // group by vendor
  const byVendor = new Map<string, typeof rows.rows>();
  for (const r of rows.rows) {
    const arr = byVendor.get(r.vendor_id) ?? [];
    arr.push(r);
    byVendor.set(r.vendor_id, arr);
  }

  const out: Candidate[] = [];
  for (const [vendorId, pos] of byVendor) {
    let i = 0;
    while (i < pos.length) {
      const startTime = new Date(pos[i]!.created_at).getTime();
      const group: typeof pos = [];
      let sum = 0;
      let anyOverThreshold = false;
      let j = i;
      while (j < pos.length && new Date(pos[j]!.created_at).getTime() - startTime <= SPLIT_WINDOW_MS) {
        const total = Number(pos[j]!.total_paise);
        if (total >= APPROVAL_THRESHOLD_PAISE) anyOverThreshold = true;
        sum += total;
        group.push(pos[j]!);
        j++;
      }
      if (group.length >= 2 && !anyOverThreshold && sum >= APPROVAL_THRESHOLD_PAISE) {
        const vendorName = group[0]!.vendor_name;
        const poNumbers = group.map((g) => g.po_number).filter(Boolean);
        out.push({
          kind: "split_po",
          severity: sum >= APPROVAL_THRESHOLD_PAISE * 1.5 ? "high" : "medium",
          title: `${group.length} POs to ${vendorName ?? "a vendor"} in 7 days total over the approval limit`,
          detail: {
            vendorName,
            poNumbers,
            poCount: group.length,
            combinedTotalPaise: String(sum),
            approvalThresholdPaise: String(APPROVAL_THRESHOLD_PAISE),
            windowDays: 7,
          },
          resourceType: "vendor",
          resourceId: vendorId,
          fingerprint: `split_po:${vendorId}:${group.map((g) => g.id).sort().join(",")}`,
        });
        i = j; // skip the whole cluster
      } else {
        i++;
      }
    }
  }
  return out;
}

async function detectDuplicateInvoices(tenantId: string): Promise<Candidate[]> {
  const out: Candidate[] = [];

  // Vendor invoices (AP bills) — strongest duplicate-payment signal.
  const invRows = await db.execute<{
    vendor_id: string;
    vendor_name: string | null;
    invoice_number: string;
    total_paise: string;
    cnt: number;
    ids: string[];
  }>(sql`
    SELECT vi.vendor_id, v.name AS vendor_name, vi.invoice_number, vi.total_paise,
           COUNT(*)::int AS cnt, array_agg(vi.id) AS ids
    FROM vendor_invoices vi
    LEFT JOIN vendors v ON v.id = vi.vendor_id
    WHERE vi.tenant_id = ${tenantId}
      AND vi.deleted_at IS NULL
      AND vi.invoice_number IS NOT NULL
      AND vi.invoice_number <> ''
    GROUP BY vi.vendor_id, v.name, vi.invoice_number, vi.total_paise
    HAVING COUNT(*) > 1`);

  for (const r of invRows.rows) {
    const ids = r.ids ?? [];
    out.push({
      kind: "duplicate_invoice",
      severity: "high",
      title: `Invoice ${r.invoice_number} from ${r.vendor_name ?? "vendor"} recorded ${r.cnt} times`,
      detail: {
        vendorName: r.vendor_name,
        invoiceNumber: r.invoice_number,
        amountPaise: r.total_paise,
        occurrences: r.cnt,
        source: "vendor_invoice",
        invoiceIds: ids,
      },
      resourceType: "vendor_invoice",
      resourceId: ids[0] ?? null,
      fingerprint: `duplicate_invoice:vi:${r.vendor_id}:${r.invoice_number}:${r.total_paise}`,
    });
  }

  // GRN-captured invoice numbers — secondary signal (goods booked twice).
  const grnRows = await db.execute<{
    vendor_id: string;
    vendor_name: string | null;
    invoice_number: string;
    amount: string | null;
    cnt: number;
    ids: string[];
  }>(sql`
    SELECT g.vendor_id, v.name AS vendor_name, g.invoice_number,
           g.invoice_amount_paise AS amount, COUNT(*)::int AS cnt, array_agg(g.id) AS ids
    FROM grns g
    LEFT JOIN vendors v ON v.id = g.vendor_id
    WHERE g.tenant_id = ${tenantId}
      AND g.deleted_at IS NULL
      AND g.status <> 'cancelled'
      AND g.invoice_number IS NOT NULL
      AND g.invoice_number <> ''
    GROUP BY g.vendor_id, v.name, g.invoice_number, g.invoice_amount_paise
    HAVING COUNT(*) > 1`);

  for (const r of grnRows.rows) {
    const ids = r.ids ?? [];
    out.push({
      kind: "duplicate_invoice",
      severity: "medium",
      title: `Invoice ${r.invoice_number} from ${r.vendor_name ?? "vendor"} used on ${r.cnt} receipts`,
      detail: {
        vendorName: r.vendor_name,
        invoiceNumber: r.invoice_number,
        amountPaise: r.amount,
        occurrences: r.cnt,
        source: "grn",
        grnIds: ids,
      },
      resourceType: "grn",
      resourceId: ids[0] ?? null,
      fingerprint: `duplicate_invoice:grn:${r.vendor_id}:${r.invoice_number}:${r.amount ?? ""}`,
    });
  }

  return out;
}

async function detectRoundAmounts(tenantId: string, since: Date): Promise<Candidate[]> {
  const rows = await db.execute<{
    id: string;
    po_number: string | null;
    total_paise: string;
    vendor_name: string | null;
  }>(sql`
    SELECT po.id, po.po_number, po.total_paise, v.name AS vendor_name
    FROM purchase_orders po
    LEFT JOIN vendors v ON v.id = po.vendor_id
    WHERE po.tenant_id = ${tenantId}
      AND po.deleted_at IS NULL
      AND po.status IN (${sql.join(ACTIVE_PO_STATUSES.map((s) => sql`${s}`), sql`, `)})
      AND po.created_at >= ${since}`);

  const out: Candidate[] = [];
  for (const r of rows.rows) {
    const total = Number(r.total_paise);
    if (!Number.isFinite(total) || total <= 0) continue;

    // Just under the approval limit (90–99.9%).
    if (total >= APPROVAL_THRESHOLD_PAISE * 0.9 && total < APPROVAL_THRESHOLD_PAISE) {
      out.push({
        kind: "round_amount",
        severity: "medium",
        title: `PO ${r.po_number ?? ""} sits just under the approval limit`.trim(),
        detail: {
          vendorName: r.vendor_name,
          poNumber: r.po_number,
          totalPaise: r.total_paise,
          approvalThresholdPaise: String(APPROVAL_THRESHOLD_PAISE),
          pctOfThreshold: Math.round((total / APPROVAL_THRESHOLD_PAISE) * 100),
          subKind: "just_under_limit",
        },
        resourceType: "po",
        resourceId: r.id,
        fingerprint: `round_amount:just_under:${r.id}`,
      });
      continue; // don't double-flag as "round"
    }

    // Suspiciously round (exact ₹10,000 multiple, ≥ ₹50,000).
    if (total % 1_000_000 === 0 && total >= 5_000_000) {
      out.push({
        kind: "round_amount",
        severity: "low",
        title: `PO ${r.po_number ?? ""} has a suspiciously round total`.trim(),
        detail: {
          vendorName: r.vendor_name,
          poNumber: r.po_number,
          totalPaise: r.total_paise,
          subKind: "round_total",
        },
        resourceType: "po",
        resourceId: r.id,
        fingerprint: `round_amount:round:${r.id}`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function scan(ctx: ActorContext): Promise<AnomalyScanResult> {
  const { tenantId } = ctx;
  const since = new Date(Date.now() - LOOKBACK_MS);

  const [spikes, splits, dupes, rounds] = await Promise.all([
    detectPriceSpikes(tenantId, since),
    detectSplitPos(tenantId, since),
    detectDuplicateInvoices(tenantId),
    detectRoundAmounts(tenantId, since),
  ]);

  // Cap each kind (most severe first) so a noisy dataset can't flood the feed.
  const capKind = (cands: Candidate[]): Candidate[] => {
    const sorted = cands.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
    if (sorted.length > PER_KIND_CAP) {
      logger.info(
        { tenantId, kind: sorted[0]?.kind, found: sorted.length, kept: PER_KIND_CAP },
        "anomaly_kind_capped",
      );
    }
    return sorted.slice(0, PER_KIND_CAP);
  };
  const candidates = [...capKind(spikes), ...capKind(splits), ...capKind(dupes), ...capKind(rounds)];

  // Preserve user judgement: never re-surface a dismissed fingerprint.
  const dismissed = await db
    .select({ fingerprint: anomalyFlags.fingerprint })
    .from(anomalyFlags)
    .where(
      and(
        eq(anomalyFlags.tenantId, tenantId),
        eq(anomalyFlags.status, "dismissed"),
        isNull(anomalyFlags.deletedAt),
      ),
    );
  const dismissedSet = new Set(dismissed.map((d) => d.fingerprint).filter(Boolean) as string[]);
  const fresh = candidates.filter((c) => !dismissedSet.has(c.fingerprint));

  await db.transaction(async (tx) => {
    // Retire the previous open flags (a scan replaces them).
    await tx
      .update(anomalyFlags)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(anomalyFlags.tenantId, tenantId),
          eq(anomalyFlags.status, "open"),
          isNull(anomalyFlags.deletedAt),
        ),
      );

    if (fresh.length) {
      await tx.insert(anomalyFlags).values(
        fresh.map((c) => ({
          tenantId,
          kind: c.kind,
          severity: c.severity,
          status: "open" as const,
          title: c.title,
          detail: c.detail,
          resourceType: c.resourceType,
          resourceId: c.resourceId,
          fingerprint: c.fingerprint,
        })),
      );
    }

    await tx.insert(auditLogs).values({
      tenantId,
      actorUserId: ctx.userId,
      action: "anomaly_scan",
      resourceType: "anomaly",
      resourceId: null,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: { flagged: fresh.length } as Record<string, unknown>,
    });
  });

  return getFlagsResult(tenantId);
}

/** The open feed plus a by-kind summary. */
async function getFlagsResult(tenantId: string): Promise<AnomalyScanResult> {
  const flags = await getFlags(tenantId);
  const countsByKind: Record<string, number> = {};
  for (const f of flags) countsByKind[f.kind] = (countsByKind[f.kind] ?? 0) + 1;
  return { flags, countsByKind, scannedAt: new Date().toISOString() };
}

export async function getFlags(tenantId: string): Promise<AnomalyFlag[]> {
  const rows = await db
    .select()
    .from(anomalyFlags)
    .where(
      and(
        eq(anomalyFlags.tenantId, tenantId),
        eq(anomalyFlags.status, "open"),
        isNull(anomalyFlags.deletedAt),
      ),
    )
    .orderBy(
      sql`CASE ${anomalyFlags.severity} WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC`,
      desc(anomalyFlags.createdAt),
    );

  return rows.map(toView);
}

/** Scan result for the GET feed (no fresh scan). */
export async function getFlagsWithSummary(tenantId: string): Promise<AnomalyScanResult> {
  return getFlagsResult(tenantId);
}

export async function updateFlag(
  id: string,
  input: AnomalyUpdate,
  ctx: ActorContext,
): Promise<AnomalyFlag> {
  const [existing] = await db
    .select()
    .from(anomalyFlags)
    .where(and(eq(anomalyFlags.id, id), eq(anomalyFlags.tenantId, ctx.tenantId), isNull(anomalyFlags.deletedAt)))
    .limit(1);
  if (!existing) throw NotFound("flag_not_found", "Anomaly flag not found");

  const [updated] = await db
    .update(anomalyFlags)
    .set({ status: input.status, updatedAt: new Date() })
    .where(and(eq(anomalyFlags.id, id), eq(anomalyFlags.tenantId, ctx.tenantId)))
    .returning();

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: input.status === "dismissed" ? "anomaly_dismiss" : "anomaly_reopen",
    resourceType: "anomaly",
    resourceId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return toView(updated!);
}

function toView(row: typeof anomalyFlags.$inferSelect): AnomalyFlag {
  return {
    id: row.id,
    kind: row.kind as AnomalyKind,
    severity: row.severity as AnomalySeverity,
    status: row.status as AnomalyFlag["status"],
    title: row.title,
    detail: row.detail ?? {},
    resourceType: row.resourceType ?? null,
    resourceId: row.resourceId ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
