import { eq, and, isNull, desc, sql, inArray, ilike } from "drizzle-orm";
import { db } from "../db/index";
import {
  salesInvoices,
  salesInvoiceItems,
  salesReceipts,
  salesReceiptAllocations,
} from "../db/schema/sales_invoices";
import { salesOrders, salesOrderItems } from "../db/schema/sales_orders";
import { customers } from "../db/schema/customers";
import { users } from "../db/schema/users";
import { companies } from "../db/schema/companies";
import { units } from "../db/schema/units";
import { auditLogs } from "../db/schema/audit_logs";
import { NotFound, BadRequest } from "../lib/errors";
import { computeLine, computeHeaderTotals } from "../lib/po-math";
import { notifyUsers } from "./notification.service";
import type {
  SalesInvoiceCreateInput,
  SalesInvoiceItemInput,
  SalesReceiptCreateInput,
} from "@indus/shared";

interface ListOpts {
  page?: number;
  pageSize?: number;
  status?: string;
  customerId?: string;
  soId?: string;
  search?: string;
}

interface ActorContext {
  tenantId: string;
  userId: string;
  isTenantAdmin: boolean;
  ipAddress?: string;
  userAgent?: string;
}

const DAY = 24 * 60 * 60 * 1000;

async function nextInvoiceNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(salesInvoices)
    .where(and(eq(salesInvoices.tenantId, tenantId), sql`${salesInvoices.createdAt} >= ${yearStart}`));
  const count = result[0]?.count ?? 0;
  return `SI-${year}-${String(count + 1).padStart(5, "0")}`;
}

async function nextReceiptNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(salesReceipts)
    .where(and(eq(salesReceipts.tenantId, tenantId), sql`${salesReceipts.createdAt} >= ${yearStart}`));
  const count = result[0]?.count ?? 0;
  return `RCPT-${year}-${String(count + 1).padStart(5, "0")}`;
}

/** Compute per-line outward GST + header totals for a set of input lines. */
function buildLines(items: SalesInvoiceItemInput[], isInterstate: boolean) {
  const computed = items.map((it) =>
    computeLine(
      { quantity: it.quantity, unitPrice: it.unitPrice, discountPercent: it.discountPercent ?? 0, taxRate: it.taxRate },
      isInterstate,
    ),
  );
  const rows = items.map((it, idx) => {
    const l = computed[idx]!;
    return {
      soItemId: it.soItemId ?? null,
      itemId: it.itemId ?? null,
      itemName: it.itemName,
      hsnCode: it.hsnCode ?? null,
      uom: it.uom,
      qtyScaled: l.qtyScaled,
      unitPricePaise: l.unitPaise.toString(),
      discountPercent: Math.round(it.discountPercent ?? 0),
      discountAmountPaise: l.discountPaise.toString(),
      taxRate: l.taxRate,
      cgstRate: l.cgstRate,
      sgstRate: l.sgstRate,
      igstRate: l.igstRate,
      subtotalPaise: l.subtotalPaise.toString(),
      taxableAmountPaise: l.taxableAmountPaise.toString(),
      cgstPaise: l.cgstPaise.toString(),
      sgstPaise: l.sgstPaise.toString(),
      igstPaise: l.igstPaise.toString(),
      taxPaise: l.taxPaise.toString(),
      totalPaise: l.totalPaise.toString(),
      sortOrder: idx,
    };
  });
  return { rows, computed };
}

/** Recompute an invoice's paid amount + payment/lifecycle status from its posted receipts. */
async function recalcInvoicePaymentStatus(tenantId: string, invoiceId: string) {
  const [inv] = await db
    .select({ id: salesInvoices.id, totalPaise: salesInvoices.totalPaise, status: salesInvoices.status })
    .from(salesInvoices)
    .where(and(eq(salesInvoices.id, invoiceId), eq(salesInvoices.tenantId, tenantId)))
    .limit(1);
  if (!inv) return;

  const [paidRow] = await db
    .select({
      paid: sql<number>`COALESCE(SUM(CAST(${salesReceiptAllocations.allocatedPaise} AS BIGINT)), 0)::bigint`.as("paid"),
    })
    .from(salesReceiptAllocations)
    .innerJoin(salesReceipts, eq(salesReceiptAllocations.receiptId, salesReceipts.id))
    .where(
      and(
        eq(salesReceiptAllocations.salesInvoiceId, invoiceId),
        eq(salesReceipts.status, "posted"),
        isNull(salesReceipts.deletedAt),
      ),
    );

  const paid = Number(paidRow?.paid ?? 0);
  const total = Number(inv.totalPaise);
  const paymentStatus = paid <= 0 ? "unpaid" : paid >= total ? "paid" : "partial";

  // Keep the lifecycle status coherent for issued invoices; leave draft/cancelled alone.
  let status = inv.status;
  if (inv.status !== "draft" && inv.status !== "cancelled") {
    status = paid <= 0 ? "issued" : paid >= total ? "paid" : "partially_paid";
  }

  await db
    .update(salesInvoices)
    .set({ amountPaidPaise: paid.toString(), paymentStatus, status, updatedAt: new Date() })
    .where(eq(salesInvoices.id, invoiceId));
}

export async function listSalesInvoices(tenantId: string, opts: ListOpts = {}) {
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 25, 100);
  const offset = (page - 1) * pageSize;

  const conds = [eq(salesInvoices.tenantId, tenantId), isNull(salesInvoices.deletedAt)];
  if (opts.status) conds.push(eq(salesInvoices.status, opts.status as "draft"));
  if (opts.customerId) conds.push(eq(salesInvoices.customerId, opts.customerId));
  if (opts.soId) conds.push(eq(salesInvoices.soId, opts.soId));
  if (opts.search?.trim()) conds.push(ilike(salesInvoices.invoiceNumber, `%${opts.search.trim()}%`));

  const [rows, totalRow] = await Promise.all([
    db
      .select({ inv: salesInvoices, customerName: customers.name, soNumber: salesOrders.soNumber })
      .from(salesInvoices)
      .leftJoin(customers, eq(salesInvoices.customerId, customers.id))
      .leftJoin(salesOrders, eq(salesInvoices.soId, salesOrders.id))
      .where(and(...conds))
      .orderBy(desc(salesInvoices.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(salesInvoices).where(and(...conds)),
  ]);

  const ids = rows.map((r) => r.inv.id);
  const counts = ids.length
    ? await db
        .select({ iid: salesInvoiceItems.invoiceId, count: sql<number>`count(*)::int` })
        .from(salesInvoiceItems)
        .where(inArray(salesInvoiceItems.invoiceId, ids))
        .groupBy(salesInvoiceItems.invoiceId)
    : [];
  const countMap = new Map(counts.map((c) => [c.iid, c.count]));

  return {
    items: rows.map((r) => ({
      id: r.inv.id,
      invoiceNumber: r.inv.invoiceNumber,
      status: r.inv.status,
      paymentStatus: r.inv.paymentStatus,
      customerId: r.inv.customerId,
      customerName: r.customerName,
      soId: r.inv.soId,
      soNumber: r.soNumber,
      invoiceDate: r.inv.invoiceDate.toISOString(),
      dueDate: r.inv.dueDate ? r.inv.dueDate.toISOString() : null,
      totalPaise: r.inv.totalPaise,
      amountPaidPaise: r.inv.amountPaidPaise,
      itemsCount: countMap.get(r.inv.id) ?? 0,
      createdAt: r.inv.createdAt.toISOString(),
    })),
    total: totalRow[0]?.count ?? 0,
    page,
    pageSize,
  };
}

export async function getSalesInvoice(tenantId: string, id: string) {
  const inv = await getInvoiceRaw(tenantId, id);

  const [lines, customer, so, [createdBy], allocations] = await Promise.all([
    db.select().from(salesInvoiceItems).where(eq(salesInvoiceItems.invoiceId, id)).orderBy(salesInvoiceItems.sortOrder),
    db.select().from(customers).where(eq(customers.id, inv.customerId)).limit(1).then((r) => r[0]),
    inv.soId
      ? db
          .select({ id: salesOrders.id, soNumber: salesOrders.soNumber, title: salesOrders.title, status: salesOrders.status })
          .from(salesOrders)
          .where(eq(salesOrders.id, inv.soId))
          .limit(1)
          .then((r) => r[0])
      : Promise.resolve(undefined),
    db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users).where(eq(users.id, inv.createdByUserId)).limit(1),
    db
      .select({
        alloc: salesReceiptAllocations,
        receiptNumber: salesReceipts.receiptNumber,
        receiptDate: salesReceipts.receiptDate,
        method: salesReceipts.method,
        receiptStatus: salesReceipts.status,
      })
      .from(salesReceiptAllocations)
      .innerJoin(salesReceipts, eq(salesReceiptAllocations.receiptId, salesReceipts.id))
      .where(and(eq(salesReceiptAllocations.salesInvoiceId, id), isNull(salesReceipts.deletedAt)))
      .orderBy(desc(salesReceipts.receiptDate)),
  ]);

  const outstandingPaise = (Number(inv.totalPaise) - Number(inv.amountPaidPaise)).toString();

  return {
    ...inv,
    invoiceDate: inv.invoiceDate.toISOString(),
    dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
    issuedAt: inv.issuedAt ? inv.issuedAt.toISOString() : null,
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
    outstandingPaise,
    items: lines.map((it) => ({ ...it, createdAt: it.createdAt.toISOString() })),
    customer,
    so,
    createdBy,
    receipts: allocations
      .filter((a) => a.receiptStatus !== "cancelled")
      .map((a) => ({
        id: a.alloc.id,
        receiptId: a.alloc.receiptId,
        receiptNumber: a.receiptNumber,
        receiptDate: a.receiptDate.toISOString(),
        method: a.method,
        allocatedPaise: a.alloc.allocatedPaise,
      })),
  };
}

/** Pre-fill a sales invoice from an SO — one line per SO line at the ordered price. */
export async function getInvoiceDraftFromSo(tenantId: string, soId: string) {
  const [so] = await db
    .select()
    .from(salesOrders)
    .where(and(eq(salesOrders.id, soId), eq(salesOrders.tenantId, tenantId), isNull(salesOrders.deletedAt)))
    .limit(1);
  if (!so) throw NotFound("sales_order_not_found", "Source sales order not found");

  const lines = await db.select().from(salesOrderItems).where(eq(salesOrderItems.soId, soId)).orderBy(salesOrderItems.sortOrder);

  return {
    source: { soId: so.id, soNumber: so.soNumber },
    header: {
      companyId: so.companyId,
      unitId: so.unitId,
      customerId: so.customerId,
      soId: so.id,
      isInterstate: so.isInterstate,
      placeOfSupply: so.placeOfSupply,
    },
    items: lines.map((it) => ({
      soItemId: it.id,
      itemId: it.itemId,
      itemName: it.itemName,
      hsnCode: it.hsnCode,
      uom: it.uom,
      quantity: it.quantityScaled / 1000,
      unitPrice: Number(it.unitPricePaise) / 100,
      discountPercent: it.discountPercent,
      taxRate: it.taxRate,
    })),
  };
}

export async function createSalesInvoice(input: SalesInvoiceCreateInput, ctx: ActorContext) {
  if (!input.items.length) throw BadRequest("no_items", "Add at least one line");

  const isInterstate = input.isInterstate ?? false;
  const { rows, computed } = buildLines(input.items, isInterstate);
  const totals = computeHeaderTotals(computed, input.freightCharges ?? 0, input.otherCharges ?? 0, input.roundOff ?? 0);

  // Due date: explicit, else invoiceDate + customer credit days.
  const invoiceDate = new Date(input.invoiceDate);
  let dueDate: Date | null = input.dueDate ? new Date(input.dueDate) : null;
  if (!dueDate) {
    const [cust] = await db
      .select({ creditDays: customers.creditDays })
      .from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (cust && cust.creditDays > 0) dueDate = new Date(invoiceDate.getTime() + cust.creditDays * DAY);
  }

  const invoiceNumber = await nextInvoiceNumber(ctx.tenantId);

  const invId = await db.transaction(async (tx) => {
    const [inv] = await tx
      .insert(salesInvoices)
      .values({
        tenantId: ctx.tenantId,
        companyId: input.companyId,
        unitId: input.unitId,
        customerId: input.customerId,
        soId: input.soId ?? null,
        createdByUserId: ctx.userId,
        invoiceNumber,
        invoiceDate,
        dueDate,
        isInterstate,
        placeOfSupply: input.placeOfSupply ?? null,
        subtotalPaise: totals.subtotal.toString(),
        discountTotalPaise: totals.discount.toString(),
        taxableAmountPaise: totals.taxable.toString(),
        cgstTotalPaise: totals.cgst.toString(),
        sgstTotalPaise: totals.sgst.toString(),
        igstTotalPaise: totals.igst.toString(),
        taxPaise: totals.tax.toString(),
        roundOffPaise: totals.roundOff.toString(),
        totalPaise: totals.total.toString(),
        status: "draft",
        remarks: input.remarks || null,
      })
      .returning({ id: salesInvoices.id });
    if (!inv) throw new Error("Failed to create sales invoice");

    await tx.insert(salesInvoiceItems).values(rows.map((l) => ({ invoiceId: inv.id, ...l })));
    return inv.id;
  });

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "create",
    resourceType: "sales_invoice",
    resourceId: invId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    after: { invoiceNumber, total: totals.total.toString() } as Record<string, unknown>,
  });

  const [created] = await db.select().from(salesInvoices).where(eq(salesInvoices.id, invId)).limit(1);
  return created;
}

/** Issue a draft invoice — locks it and starts the AR clock. */
export async function issueSalesInvoice(id: string, ctx: ActorContext) {
  const inv = await getInvoiceRaw(ctx.tenantId, id);
  if (inv.status === "cancelled") throw BadRequest("invoice_cancelled", "Cancelled invoices cannot be issued");
  if (inv.status !== "draft") return inv;

  await db
    .update(salesInvoices)
    .set({ status: "issued", approvedByUserId: ctx.userId, issuedAt: new Date(), updatedAt: new Date() })
    .where(eq(salesInvoices.id, id));

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "issue",
    resourceType: "sales_invoice",
    resourceId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  if (inv.createdByUserId !== ctx.userId) {
    await notifyUsers({
      tenantId: ctx.tenantId,
      userIds: [inv.createdByUserId],
      kind: "sales_invoice_issued",
      title: `Invoice ${inv.invoiceNumber ?? ""} issued`.trim(),
      body: "Sales invoice issued to the customer.",
      resourceType: "sales_invoice",
      resourceId: id,
    });
  }

  const [updated] = await db.select().from(salesInvoices).where(eq(salesInvoices.id, id)).limit(1);
  return updated;
}

export async function cancelSalesInvoice(id: string, ctx: ActorContext) {
  const inv = await getInvoiceRaw(ctx.tenantId, id);
  if (inv.status === "cancelled") return;
  if (Number(inv.amountPaidPaise) > 0) {
    throw BadRequest("invoice_has_receipts", "Cancel or reverse the receipts allocated to this invoice first");
  }

  await db.update(salesInvoices).set({ status: "cancelled", updatedAt: new Date() }).where(eq(salesInvoices.id, id));

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "cancel",
    resourceType: "sales_invoice",
    resourceId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

/** Open invoices for a customer with their outstanding balance — feeds the receipt allocator. */
export async function getOutstandingInvoices(tenantId: string, customerId: string) {
  const rows = await db
    .select({
      id: salesInvoices.id,
      invoiceNumber: salesInvoices.invoiceNumber,
      invoiceDate: salesInvoices.invoiceDate,
      dueDate: salesInvoices.dueDate,
      totalPaise: salesInvoices.totalPaise,
      amountPaidPaise: salesInvoices.amountPaidPaise,
      status: salesInvoices.status,
      soId: salesInvoices.soId,
    })
    .from(salesInvoices)
    .where(
      and(
        eq(salesInvoices.tenantId, tenantId),
        eq(salesInvoices.customerId, customerId),
        isNull(salesInvoices.deletedAt),
        sql`${salesInvoices.status} NOT IN ('draft', 'cancelled')`,
        sql`CAST(${salesInvoices.totalPaise} AS BIGINT) > CAST(${salesInvoices.amountPaidPaise} AS BIGINT)`,
      ),
    )
    .orderBy(salesInvoices.invoiceDate);

  return rows.map((r) => ({
    id: r.id,
    invoiceNumber: r.invoiceNumber,
    invoiceDate: r.invoiceDate.toISOString(),
    dueDate: r.dueDate ? r.dueDate.toISOString() : null,
    totalPaise: r.totalPaise,
    amountPaidPaise: r.amountPaidPaise,
    outstandingPaise: (Number(r.totalPaise) - Number(r.amountPaidPaise)).toString(),
    status: r.status,
    soId: r.soId,
  }));
}

/**
 * Record a customer receipt (money in). Mirrors the vendor payment flow: one
 * receipt can settle many invoices via allocations; the remainder is an advance.
 */
export async function recordReceipt(input: SalesReceiptCreateInput, ctx: ActorContext) {
  const amountPaise = Math.round(input.amount * 100);
  if (amountPaise <= 0) throw BadRequest("invalid_amount", "Receipt amount must be greater than zero");

  const allocs = input.allocations ?? [];
  const allocPaise = allocs.map((a) => Math.round(a.amount * 100));
  const allocatedTotal = allocPaise.reduce((s, p) => s + p, 0);
  if (allocatedTotal > amountPaise) {
    throw BadRequest("over_allocated", "Allocations exceed the receipt amount");
  }

  // Validate invoice allocations belong to this tenant + customer and don't over-collect.
  const invoiceIds = allocs.map((a) => a.salesInvoiceId).filter((x): x is string => !!x);
  if (invoiceIds.length) {
    const invRows = await db
      .select({
        id: salesInvoices.id,
        customerId: salesInvoices.customerId,
        status: salesInvoices.status,
        totalPaise: salesInvoices.totalPaise,
        amountPaidPaise: salesInvoices.amountPaidPaise,
      })
      .from(salesInvoices)
      .where(
        and(
          eq(salesInvoices.tenantId, ctx.tenantId),
          inArray(salesInvoices.id, invoiceIds),
          isNull(salesInvoices.deletedAt),
        ),
      );
    const invMap = new Map(invRows.map((r) => [r.id, r]));
    for (let i = 0; i < allocs.length; i++) {
      const a = allocs[i]!;
      if (!a.salesInvoiceId) continue;
      const inv = invMap.get(a.salesInvoiceId);
      if (!inv) throw BadRequest("invoice_not_found", "An allocated invoice does not exist");
      if (inv.customerId !== input.customerId) throw BadRequest("customer_mismatch", "Invoice belongs to a different customer");
      if (inv.status === "cancelled") throw BadRequest("invoice_cancelled", "Cannot collect against a cancelled invoice");
      const outstanding = Number(inv.totalPaise) - Number(inv.amountPaidPaise);
      if (allocPaise[i]! > outstanding) {
        throw BadRequest("over_collection", `Allocation exceeds the ₹${(outstanding / 100).toFixed(2)} outstanding on an invoice`);
      }
    }
  }

  const number = await nextReceiptNumber(ctx.tenantId);

  const receiptId = await db.transaction(async (tx) => {
    const [rec] = await tx
      .insert(salesReceipts)
      .values({
        tenantId: ctx.tenantId,
        companyId: input.companyId ?? null,
        unitId: input.unitId ?? null,
        customerId: input.customerId,
        createdByUserId: ctx.userId,
        receiptNumber: number,
        receiptDate: new Date(input.receiptDate),
        method: input.method,
        amountPaise: amountPaise.toString(),
        allocatedPaise: allocatedTotal.toString(),
        reference: input.reference?.trim() || null,
        status: "posted",
        remarks: input.remarks?.trim() || null,
      })
      .returning({ id: salesReceipts.id });
    if (!rec) throw new Error("Failed to record receipt");

    if (allocs.length) {
      await tx.insert(salesReceiptAllocations).values(
        allocs.map((a, i) => ({
          receiptId: rec.id,
          salesInvoiceId: a.salesInvoiceId ?? null,
          soId: a.soId ?? null,
          allocatedPaise: allocPaise[i]!.toString(),
        })),
      );
    }
    return rec.id;
  });

  for (const invoiceId of invoiceIds) {
    await recalcInvoicePaymentStatus(ctx.tenantId, invoiceId);
  }

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "create",
    resourceType: "sales_receipt",
    resourceId: receiptId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    after: { number, amount: amountPaise, allocations: allocs.length } as Record<string, unknown>,
  });

  const [created] = await db.select().from(salesReceipts).where(eq(salesReceipts.id, receiptId)).limit(1);
  return created;
}

/**
 * AR ageing — outstanding receivables per customer, bucketed by how long the
 * bill has been open (measured from invoice date). Only non-draft, non-cancelled
 * invoices with a positive balance are counted.
 */
export async function getArAging(tenantId: string, opts: { asOf?: string } = {}) {
  const asOf = opts.asOf ? new Date(opts.asOf) : new Date();

  const rows = await db
    .select({
      customerId: salesInvoices.customerId,
      customerName: customers.name,
      invoiceDate: salesInvoices.invoiceDate,
      totalPaise: salesInvoices.totalPaise,
      amountPaidPaise: salesInvoices.amountPaidPaise,
    })
    .from(salesInvoices)
    .leftJoin(customers, eq(salesInvoices.customerId, customers.id))
    .where(
      and(
        eq(salesInvoices.tenantId, tenantId),
        isNull(salesInvoices.deletedAt),
        sql`${salesInvoices.status} NOT IN ('draft', 'cancelled')`,
        sql`CAST(${salesInvoices.totalPaise} AS BIGINT) > CAST(${salesInvoices.amountPaidPaise} AS BIGINT)`,
      ),
    );

  interface Bucket {
    customerId: string;
    customerName: string | null;
    b0: number;
    b30: number;
    b60: number;
    b90: number;
    invoiceCount: number;
  }
  const byCustomer = new Map<string, Bucket>();

  for (const r of rows) {
    const outstanding = Number(r.totalPaise) - Number(r.amountPaidPaise);
    if (outstanding <= 0) continue;
    const ageDays = Math.max(0, Math.floor((asOf.getTime() - r.invoiceDate.getTime()) / DAY));

    let bucket = byCustomer.get(r.customerId);
    if (!bucket) {
      bucket = { customerId: r.customerId, customerName: r.customerName, b0: 0, b30: 0, b60: 0, b90: 0, invoiceCount: 0 };
      byCustomer.set(r.customerId, bucket);
    }
    if (ageDays <= 30) bucket.b0 += outstanding;
    else if (ageDays <= 60) bucket.b30 += outstanding;
    else if (ageDays <= 90) bucket.b60 += outstanding;
    else bucket.b90 += outstanding;
    bucket.invoiceCount += 1;
  }

  const customerRows = Array.from(byCustomer.values())
    .map((b) => ({
      customerId: b.customerId,
      customerName: b.customerName,
      bucket0to30Paise: b.b0.toString(),
      bucket31to60Paise: b.b30.toString(),
      bucket61to90Paise: b.b60.toString(),
      bucket90PlusPaise: b.b90.toString(),
      totalOutstandingPaise: (b.b0 + b.b30 + b.b60 + b.b90).toString(),
      invoiceCount: b.invoiceCount,
    }))
    .sort((a, b) => Number(b.totalOutstandingPaise) - Number(a.totalOutstandingPaise));

  const totals = customerRows.reduce(
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
    rows: customerRows,
    totals: {
      bucket0to30Paise: totals.b0.toString(),
      bucket31to60Paise: totals.b30.toString(),
      bucket61to90Paise: totals.b60.toString(),
      bucket90PlusPaise: totals.b90.toString(),
      totalOutstandingPaise: totals.total.toString(),
    },
  };
}

async function getInvoiceRaw(tenantId: string, id: string) {
  const [inv] = await db
    .select()
    .from(salesInvoices)
    .where(and(eq(salesInvoices.id, id), eq(salesInvoices.tenantId, tenantId), isNull(salesInvoices.deletedAt)))
    .limit(1);
  if (!inv) throw NotFound("sales_invoice_not_found", "Sales invoice not found");
  return inv;
}
