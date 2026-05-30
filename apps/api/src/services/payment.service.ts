import { eq, and, isNull, desc, sql, inArray, ilike } from "drizzle-orm";
import { db } from "../db/index";
import { payments, paymentAllocations } from "../db/schema/payments";
import { vendorInvoices } from "../db/schema/vendor_invoices";
import { vendors } from "../db/schema/vendors";
import { auditLogs } from "../db/schema/audit_logs";
import { NotFound, BadRequest } from "../lib/errors";
import type { PaymentCreateInput } from "@indus/shared";

interface ListOpts {
  page?: number;
  pageSize?: number;
  status?: string;
  vendorId?: string;
  method?: string;
  search?: string;
}

interface ActorContext {
  tenantId: string;
  userId: string;
  isTenantAdmin: boolean;
  ipAddress?: string;
  userAgent?: string;
}

async function nextPaymentNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), sql`${payments.createdAt} >= ${yearStart}`));
  const count = result[0]?.count ?? 0;
  return `PAY-${year}-${String(count + 1).padStart(5, "0")}`;
}

/**
 * Recompute one invoice's paid amount + payment status from its posted (non
 * cancelled) allocations. Idempotent — safe to call after any payment change.
 */
async function recalcInvoicePaymentStatus(tenantId: string, invoiceId: string) {
  const [inv] = await db
    .select({ id: vendorInvoices.id, totalPaise: vendorInvoices.totalPaise })
    .from(vendorInvoices)
    .where(and(eq(vendorInvoices.id, invoiceId), eq(vendorInvoices.tenantId, tenantId)))
    .limit(1);
  if (!inv) return;

  const [paidRow] = await db
    .select({
      paid: sql<number>`COALESCE(SUM(CAST(${paymentAllocations.allocatedPaise} AS BIGINT)), 0)::bigint`.as("paid"),
    })
    .from(paymentAllocations)
    .innerJoin(payments, eq(paymentAllocations.paymentId, payments.id))
    .where(
      and(
        eq(paymentAllocations.vendorInvoiceId, invoiceId),
        eq(payments.status, "posted"),
        isNull(payments.deletedAt),
      ),
    );

  const paid = Number(paidRow?.paid ?? 0);
  const total = Number(inv.totalPaise);
  const paymentStatus = paid <= 0 ? "unpaid" : paid >= total ? "paid" : "partial";

  await db
    .update(vendorInvoices)
    .set({ amountPaidPaise: paid.toString(), paymentStatus, updatedAt: new Date() })
    .where(eq(vendorInvoices.id, invoiceId));
}

export async function listPayments(tenantId: string, opts: ListOpts = {}) {
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 25, 100);
  const offset = (page - 1) * pageSize;

  const conds = [eq(payments.tenantId, tenantId), isNull(payments.deletedAt)];
  if (opts.status) conds.push(eq(payments.status, opts.status as "posted"));
  if (opts.vendorId) conds.push(eq(payments.vendorId, opts.vendorId));
  if (opts.method) conds.push(eq(payments.method, opts.method as "neft"));
  if (opts.search?.trim()) {
    conds.push(ilike(payments.paymentNumber, `%${opts.search.trim()}%`));
  }

  const [rows, totalRow] = await Promise.all([
    db
      .select({ pay: payments, vendorName: vendors.name })
      .from(payments)
      .leftJoin(vendors, eq(payments.vendorId, vendors.id))
      .where(and(...conds))
      .orderBy(desc(payments.paymentDate), desc(payments.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(payments).where(and(...conds)),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.pay.id,
      paymentNumber: r.pay.paymentNumber,
      vendorId: r.pay.vendorId,
      vendorName: r.vendorName,
      paymentDate: r.pay.paymentDate.toISOString(),
      method: r.pay.method,
      amountPaise: r.pay.amountPaise,
      allocatedPaise: r.pay.allocatedPaise,
      status: r.pay.status,
      reference: r.pay.reference,
      createdAt: r.pay.createdAt.toISOString(),
    })),
    total: totalRow[0]?.count ?? 0,
    page,
    pageSize,
  };
}

export async function getPayment(tenantId: string, id: string) {
  const [pay] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, id), eq(payments.tenantId, tenantId), isNull(payments.deletedAt)))
    .limit(1);
  if (!pay) throw NotFound("payment_not_found", "Payment not found");

  const [vendor, allocations] = await Promise.all([
    db.select().from(vendors).where(eq(vendors.id, pay.vendorId)).limit(1).then((r) => r[0]),
    db
      .select({
        alloc: paymentAllocations,
        invoiceNumber: vendorInvoices.invoiceNumber,
        invoiceTotalPaise: vendorInvoices.totalPaise,
      })
      .from(paymentAllocations)
      .leftJoin(vendorInvoices, eq(paymentAllocations.vendorInvoiceId, vendorInvoices.id))
      .where(eq(paymentAllocations.paymentId, id)),
  ]);

  const advancePaise = (Number(pay.amountPaise) - Number(pay.allocatedPaise)).toString();

  return {
    ...pay,
    paymentDate: pay.paymentDate.toISOString(),
    createdAt: pay.createdAt.toISOString(),
    updatedAt: pay.updatedAt.toISOString(),
    advancePaise,
    vendor,
    allocations: allocations.map((a) => ({
      id: a.alloc.id,
      vendorInvoiceId: a.alloc.vendorInvoiceId,
      invoiceNumber: a.invoiceNumber,
      poId: a.alloc.poId,
      allocatedPaise: a.alloc.allocatedPaise,
      kind: a.alloc.vendorInvoiceId ? "invoice" : a.alloc.poId ? "po_advance" : "on_account",
    })),
  };
}

/** Open invoices for a vendor with their outstanding balance — feeds the allocator. */
export async function getOutstandingInvoices(tenantId: string, vendorId: string) {
  const rows = await db
    .select({
      id: vendorInvoices.id,
      invoiceNumber: vendorInvoices.invoiceNumber,
      invoiceDate: vendorInvoices.invoiceDate,
      totalPaise: vendorInvoices.totalPaise,
      amountPaidPaise: vendorInvoices.amountPaidPaise,
      status: vendorInvoices.status,
      poId: vendorInvoices.poId,
    })
    .from(vendorInvoices)
    .where(
      and(
        eq(vendorInvoices.tenantId, tenantId),
        eq(vendorInvoices.vendorId, vendorId),
        isNull(vendorInvoices.deletedAt),
        sql`${vendorInvoices.status} NOT IN ('draft', 'cancelled')`,
        sql`CAST(${vendorInvoices.totalPaise} AS BIGINT) > CAST(${vendorInvoices.amountPaidPaise} AS BIGINT)`,
      ),
    )
    .orderBy(vendorInvoices.invoiceDate);

  return rows.map((r) => ({
    id: r.id,
    invoiceNumber: r.invoiceNumber,
    invoiceDate: r.invoiceDate.toISOString(),
    totalPaise: r.totalPaise,
    amountPaidPaise: r.amountPaidPaise,
    outstandingPaise: (Number(r.totalPaise) - Number(r.amountPaidPaise)).toString(),
    status: r.status,
    poId: r.poId,
  }));
}

export async function recordPayment(input: PaymentCreateInput, ctx: ActorContext) {
  const amountPaise = Math.round(input.amount * 100);
  if (amountPaise <= 0) throw BadRequest("invalid_amount", "Payment amount must be greater than zero");

  const allocs = input.allocations ?? [];
  const allocPaise = allocs.map((a) => Math.round(a.amount * 100));
  const allocatedTotal = allocPaise.reduce((s, p) => s + p, 0);
  if (allocatedTotal > amountPaise) {
    throw BadRequest("over_allocated", "Allocations exceed the payment amount");
  }

  // Validate invoice allocations belong to this tenant + vendor and don't
  // over-pay the outstanding balance.
  const invoiceIds = allocs.map((a) => a.vendorInvoiceId).filter((x): x is string => !!x);
  if (invoiceIds.length) {
    const invRows = await db
      .select({
        id: vendorInvoices.id,
        vendorId: vendorInvoices.vendorId,
        status: vendorInvoices.status,
        totalPaise: vendorInvoices.totalPaise,
        amountPaidPaise: vendorInvoices.amountPaidPaise,
      })
      .from(vendorInvoices)
      .where(
        and(
          eq(vendorInvoices.tenantId, ctx.tenantId),
          inArray(vendorInvoices.id, invoiceIds),
          isNull(vendorInvoices.deletedAt),
        ),
      );
    const invMap = new Map(invRows.map((r) => [r.id, r]));
    for (let i = 0; i < allocs.length; i++) {
      const a = allocs[i]!;
      if (!a.vendorInvoiceId) continue;
      const inv = invMap.get(a.vendorInvoiceId);
      if (!inv) throw BadRequest("invoice_not_found", "An allocated invoice does not exist");
      if (inv.vendorId !== input.vendorId) throw BadRequest("vendor_mismatch", "Invoice belongs to a different vendor");
      if (inv.status === "cancelled") throw BadRequest("invoice_cancelled", "Cannot pay a cancelled invoice");
      const outstanding = Number(inv.totalPaise) - Number(inv.amountPaidPaise);
      if (allocPaise[i]! > outstanding) {
        throw BadRequest("over_payment", `Allocation exceeds the ₹${(outstanding / 100).toFixed(2)} outstanding on an invoice`);
      }
    }
  }

  const number = await nextPaymentNumber(ctx.tenantId);

  const paymentId = await db.transaction(async (tx) => {
    const [pay] = await tx
      .insert(payments)
      .values({
        tenantId: ctx.tenantId,
        companyId: input.companyId ?? null,
        unitId: input.unitId ?? null,
        vendorId: input.vendorId,
        createdByUserId: ctx.userId,
        paymentNumber: number,
        paymentDate: new Date(input.paymentDate),
        method: input.method,
        amountPaise: amountPaise.toString(),
        allocatedPaise: allocatedTotal.toString(),
        reference: input.reference?.trim() || null,
        status: "posted",
        remarks: input.remarks?.trim() || null,
      })
      .returning({ id: payments.id });

    if (!pay) throw new Error("Failed to record payment");

    if (allocs.length) {
      await tx.insert(paymentAllocations).values(
        allocs.map((a, i) => ({
          paymentId: pay.id,
          vendorInvoiceId: a.vendorInvoiceId ?? null,
          poId: a.poId ?? null,
          allocatedPaise: allocPaise[i]!.toString(),
        })),
      );
    }

    return pay.id;
  });

  // Roll the new allocations up to each affected invoice's payment status.
  for (const invoiceId of invoiceIds) {
    await recalcInvoicePaymentStatus(ctx.tenantId, invoiceId);
  }

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "create",
    resourceType: "payment",
    resourceId: paymentId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    after: { number, amount: amountPaise, allocations: allocs.length } as Record<string, unknown>,
  });

  const [created] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  return created;
}

export async function cancelPayment(id: string, ctx: ActorContext) {
  const [pay] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, id), eq(payments.tenantId, ctx.tenantId), isNull(payments.deletedAt)))
    .limit(1);
  if (!pay) throw NotFound("payment_not_found", "Payment not found");
  if (pay.status === "cancelled") return;

  // Which invoices were touched, so we can re-roll their paid status after.
  const touched = await db
    .select({ vendorInvoiceId: paymentAllocations.vendorInvoiceId })
    .from(paymentAllocations)
    .where(eq(paymentAllocations.paymentId, id));

  await db.update(payments).set({ status: "cancelled", updatedAt: new Date() }).where(eq(payments.id, id));

  for (const t of touched) {
    if (t.vendorInvoiceId) await recalcInvoicePaymentStatus(ctx.tenantId, t.vendorInvoiceId);
  }

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "cancel",
    resourceType: "payment",
    resourceId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

/**
 * AP ageing — outstanding payables per vendor, bucketed by how long the bill has
 * been open (measured from the invoice date). Only non-draft, non-cancelled
 * invoices with a positive balance are counted.
 */
export async function getApAging(tenantId: string, opts: { asOf?: string } = {}) {
  const asOf = opts.asOf ? new Date(opts.asOf) : new Date();

  const rows = await db
    .select({
      vendorId: vendorInvoices.vendorId,
      vendorName: vendors.name,
      invoiceDate: vendorInvoices.invoiceDate,
      totalPaise: vendorInvoices.totalPaise,
      amountPaidPaise: vendorInvoices.amountPaidPaise,
    })
    .from(vendorInvoices)
    .leftJoin(vendors, eq(vendorInvoices.vendorId, vendors.id))
    .where(
      and(
        eq(vendorInvoices.tenantId, tenantId),
        isNull(vendorInvoices.deletedAt),
        sql`${vendorInvoices.status} NOT IN ('draft', 'cancelled')`,
        sql`CAST(${vendorInvoices.totalPaise} AS BIGINT) > CAST(${vendorInvoices.amountPaidPaise} AS BIGINT)`,
      ),
    );

  interface Bucket {
    vendorId: string;
    vendorName: string | null;
    b0: number;
    b30: number;
    b60: number;
    b90: number;
    invoiceCount: number;
  }
  const byVendor = new Map<string, Bucket>();
  const DAY = 24 * 60 * 60 * 1000;

  for (const r of rows) {
    const outstanding = Number(r.totalPaise) - Number(r.amountPaidPaise);
    if (outstanding <= 0) continue;
    const ageDays = Math.max(0, Math.floor((asOf.getTime() - r.invoiceDate.getTime()) / DAY));

    let bucket = byVendor.get(r.vendorId);
    if (!bucket) {
      bucket = { vendorId: r.vendorId, vendorName: r.vendorName, b0: 0, b30: 0, b60: 0, b90: 0, invoiceCount: 0 };
      byVendor.set(r.vendorId, bucket);
    }
    if (ageDays <= 30) bucket.b0 += outstanding;
    else if (ageDays <= 60) bucket.b30 += outstanding;
    else if (ageDays <= 90) bucket.b60 += outstanding;
    else bucket.b90 += outstanding;
    bucket.invoiceCount += 1;
  }

  const vendorRows = Array.from(byVendor.values())
    .map((b) => ({
      vendorId: b.vendorId,
      vendorName: b.vendorName,
      bucket0to30Paise: b.b0.toString(),
      bucket31to60Paise: b.b30.toString(),
      bucket61to90Paise: b.b60.toString(),
      bucket90PlusPaise: b.b90.toString(),
      totalOutstandingPaise: (b.b0 + b.b30 + b.b60 + b.b90).toString(),
      invoiceCount: b.invoiceCount,
    }))
    .sort((a, b) => Number(b.totalOutstandingPaise) - Number(a.totalOutstandingPaise));

  const totals = vendorRows.reduce(
    (acc, r) => {
      acc.b0 += Number(r.bucket0to30Paise);
      acc.b30 += Number(r.bucket31to60Paise);
      acc.b60 += Number(r.bucket61to90Paise);
      acc.b90 += Number(r.bucket90PlusPaise);
      acc.total += Number(r.totalOutstandingPaise);
      return acc;
    },
    { b0: 0, b30: 0, b60: 0, b90: 0, total: 0 },
  );

  return {
    asOf: asOf.toISOString(),
    rows: vendorRows,
    totals: {
      bucket0to30Paise: totals.b0.toString(),
      bucket31to60Paise: totals.b30.toString(),
      bucket61to90Paise: totals.b60.toString(),
      bucket90PlusPaise: totals.b90.toString(),
      totalOutstandingPaise: totals.total.toString(),
    },
  };
}
