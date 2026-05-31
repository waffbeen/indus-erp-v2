import { eq, and, isNull, ne, sql, desc } from "drizzle-orm";
import { db } from "../db/index";
import { gstReturns } from "../db/schema/gst_returns";
import { vendorInvoices } from "../db/schema/vendor_invoices";
import { vendors } from "../db/schema/vendors";
import type {
  Gstr1Summary,
  Gstr3bSummary,
  GstReturnsSummaryResponse,
  GstTaxBucket,
  Reconcile2bResult,
  Reconcile2bLine,
  VendorGstRow,
} from "@indus/shared";

interface ActorContext {
  tenantId: string;
  userId: string;
  isTenantAdmin: boolean;
  ipAddress?: string;
  userAgent?: string;
}

const ZERO_BUCKET: GstTaxBucket = {
  count: 0,
  taxablePaise: "0",
  igstPaise: "0",
  cgstPaise: "0",
  sgstPaise: "0",
  totalPaise: "0",
};

/** Normalise an invoice number for matching: upper, trimmed, internal spaces removed. */
function normInv(n: string): string {
  return n.trim().toUpperCase().replace(/\s+/g, "");
}

/** Persist (upsert by tenant+period+type) a computed return summary. Best-effort. */
async function saveReturn(
  tenantId: string,
  period: string,
  type: "gstr1" | "gstr3b" | "gstr2b",
  summary: Record<string, unknown>,
  userId: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: gstReturns.id })
    .from(gstReturns)
    .where(
      and(
        eq(gstReturns.tenantId, tenantId),
        eq(gstReturns.period, period),
        eq(gstReturns.type, type),
        isNull(gstReturns.deletedAt),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(gstReturns)
      .set({ summaryJson: summary, status: "generated", generatedAt: new Date(), updatedAt: new Date() })
      .where(eq(gstReturns.id, existing.id));
  } else {
    await db.insert(gstReturns).values({
      tenantId,
      period,
      type,
      status: "generated",
      summaryJson: summary,
      createdByUserId: userId,
    });
  }
}

/**
 * GSTR-1 (outward supplies). The sell-side / sales-invoice module isn't wired
 * into compliance yet, so outward supplies report as nil with a note. Once a
 * sales-invoice source exists this is where it gets aggregated.
 */
export async function gstr1Summary(_tenantId: string, period: string): Promise<Gstr1Summary> {
  return {
    period,
    type: "gstr1",
    outward: { ...ZERO_BUCKET },
    note: "No sales / outward-supply source is connected yet — outward supplies show as nil.",
  };
}

/**
 * GSTR-3B summary. Outward liability is nil (no sales source), inward ITC is
 * computed from this tenant's vendor invoices for the period (taxable = sum of
 * subtotals, ITC tax = total − taxable). Net cash payable = outward − ITC,
 * floored at 0.
 */
export async function gstr3bSummary(tenantId: string, period: string): Promise<Gstr3bSummary> {
  const [agg] = await db
    .select({
      count: sql<number>`count(*)::int`,
      taxable: sql<string>`COALESCE(SUM(${vendorInvoices.subtotalPaise}::numeric), 0)::text`,
      total: sql<string>`COALESCE(SUM(${vendorInvoices.totalPaise}::numeric), 0)::text`,
      tax: sql<string>`COALESCE(SUM(${vendorInvoices.taxPaise}::numeric), 0)::text`,
    })
    .from(vendorInvoices)
    .where(
      and(
        eq(vendorInvoices.tenantId, tenantId),
        ne(vendorInvoices.status, "cancelled"),
        isNull(vendorInvoices.deletedAt),
        sql`to_char(${vendorInvoices.invoiceDate}, 'YYYY-MM') = ${period}`,
      ),
    );

  const taxable = agg?.taxable ?? "0";
  const total = agg?.total ?? "0";
  const itcTax = agg?.tax ?? "0";

  const inwardItc: GstTaxBucket = {
    count: agg?.count ?? 0,
    taxablePaise: taxable,
    // Split is not stored on vendor invoices; the recoverable ITC is total − taxable (= tax).
    igstPaise: "0",
    cgstPaise: "0",
    sgstPaise: "0",
    totalPaise: total,
  };

  return {
    period,
    type: "gstr3b",
    outwardLiability: { ...ZERO_BUCKET },
    inwardItc,
    // Outward tax is 0, so net payable is 0 (full ITC of ₹{itcTax/100} carries forward).
    netTaxPayablePaise: "0",
    note: `Inward ITC = ₹${(Number(itcTax) / 100).toLocaleString("en-IN")} claimable from ${inwardItc.count} vendor invoice(s). Outward liability is nil until a sales source is connected.`,
  };
}

/** Both summaries for a period (also persisted). */
export async function getReturnsSummary(tenantId: string, period: string, ctx?: ActorContext): Promise<GstReturnsSummaryResponse> {
  const [gstr1, gstr3b] = await Promise.all([gstr1Summary(tenantId, period), gstr3bSummary(tenantId, period)]);
  if (ctx) {
    await Promise.all([
      saveReturn(tenantId, period, "gstr1", gstr1 as unknown as Record<string, unknown>, ctx.userId),
      saveReturn(tenantId, period, "gstr3b", gstr3b as unknown as Record<string, unknown>, ctx.userId),
    ]).catch(() => {/* persistence is best-effort */});
  }
  return { period, gstr1, gstr3b };
}

/**
 * Reconcile imported GSTR-2B (vendor-side / portal) data against this tenant's
 * vendor invoices for the period. Matches on supplier GSTIN + invoice number,
 * then compares the total value (within ₹1 tolerance).
 *
 *  - matched         : on both sides, amounts agree
 *  - mismatched      : on both sides, amounts differ
 *  - missingInBooks  : in the portal but not in our vendor invoices
 *  - missingInPortal : in our vendor invoices but not in the portal data
 */
export async function reconcile2b(
  tenantId: string,
  period: string,
  vendorGstData: VendorGstRow[],
  ctx?: ActorContext,
): Promise<Reconcile2bResult> {
  // Load this tenant's vendor invoices for the period, with the supplier GSTIN.
  const bookRows = await db
    .select({
      invoiceNumber: vendorInvoices.invoiceNumber,
      totalPaise: vendorInvoices.totalPaise,
      gstin: vendors.gstin,
      vendorName: vendors.name,
    })
    .from(vendorInvoices)
    .leftJoin(vendors, eq(vendorInvoices.vendorId, vendors.id))
    .where(
      and(
        eq(vendorInvoices.tenantId, tenantId),
        ne(vendorInvoices.status, "cancelled"),
        isNull(vendorInvoices.deletedAt),
        sql`to_char(${vendorInvoices.invoiceDate}, 'YYYY-MM') = ${period}`,
      ),
    );

  type BookEntry = { key: string; gstin: string; invoiceNumber: string; vendorName: string | null; totalPaise: number };
  const bookByKey = new Map<string, BookEntry>();
  for (const r of bookRows) {
    const gstin = (r.gstin ?? "").toUpperCase();
    const key = `${gstin}|${normInv(r.invoiceNumber)}`;
    bookByKey.set(key, {
      key,
      gstin,
      invoiceNumber: r.invoiceNumber,
      vendorName: r.vendorName ?? null,
      totalPaise: Number(r.totalPaise) || 0,
    });
  }

  const TOLERANCE_PAISE = 100; // ₹1
  const matched: Reconcile2bLine[] = [];
  const mismatched: Reconcile2bLine[] = [];
  const missingInBooks: Reconcile2bLine[] = [];
  const consumed = new Set<string>();

  for (const row of vendorGstData) {
    const gstin = row.gstin.toUpperCase();
    const key = `${gstin}|${normInv(row.invoiceNumber)}`;
    const portalRupees =
      row.totalValue ?? ((row.taxableValue ?? 0) + (row.taxAmount ?? 0));
    const portalPaise = Math.round(portalRupees * 100);

    const book = bookByKey.get(key);
    if (!book) {
      missingInBooks.push({
        gstin,
        invoiceNumber: row.invoiceNumber,
        vendorName: null,
        bookTotalPaise: null,
        portalTotalPaise: String(portalPaise),
        diffPaise: null,
      });
      continue;
    }

    consumed.add(key);
    const diff = Math.abs(book.totalPaise - portalPaise);
    const line: Reconcile2bLine = {
      gstin,
      invoiceNumber: book.invoiceNumber,
      vendorName: book.vendorName,
      bookTotalPaise: String(book.totalPaise),
      portalTotalPaise: String(portalPaise),
      diffPaise: String(diff),
    };
    if (diff <= TOLERANCE_PAISE) matched.push(line);
    else mismatched.push(line);
  }

  const missingInPortal: Reconcile2bLine[] = [];
  for (const [key, book] of bookByKey) {
    if (consumed.has(key)) continue;
    missingInPortal.push({
      gstin: book.gstin,
      invoiceNumber: book.invoiceNumber,
      vendorName: book.vendorName,
      bookTotalPaise: String(book.totalPaise),
      portalTotalPaise: null,
      diffPaise: null,
    });
  }

  const result: Reconcile2bResult = {
    period,
    matched,
    mismatched,
    missingInBooks,
    missingInPortal,
    counts: {
      matched: matched.length,
      mismatched: mismatched.length,
      missingInBooks: missingInBooks.length,
      missingInPortal: missingInPortal.length,
    },
  };

  if (ctx) {
    await saveReturn(tenantId, period, "gstr2b", result as unknown as Record<string, unknown>, ctx.userId).catch(() => {});
  }
  return result;
}

/** List saved return snapshots for a tenant (most recent first). */
export async function listGstReturns(tenantId: string, opts: { period?: string; type?: string } = {}) {
  const conds = [eq(gstReturns.tenantId, tenantId), isNull(gstReturns.deletedAt)];
  if (opts.period) conds.push(eq(gstReturns.period, opts.period));
  if (opts.type) conds.push(eq(gstReturns.type, opts.type as "gstr1"));
  const rows = await db.select().from(gstReturns).where(and(...conds)).orderBy(desc(gstReturns.generatedAt)).limit(100);
  return {
    items: rows.map((r) => ({
      id: r.id,
      period: r.period,
      type: r.type,
      status: r.status,
      summaryJson: r.summaryJson ?? null,
      generatedAt: r.generatedAt.toISOString(),
    })),
    total: rows.length,
  };
}
