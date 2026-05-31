import { eq, and, isNull, ilike, desc, sql, inArray } from "drizzle-orm";
import { db } from "../db/index";
import { salesOrders, salesOrderItems } from "../db/schema/sales_orders";
import { customers } from "../db/schema/customers";
import { users } from "../db/schema/users";
import { companies } from "../db/schema/companies";
import { units } from "../db/schema/units";
import { auditLogs } from "../db/schema/audit_logs";
import { BadRequest, Forbidden, NotFound } from "../lib/errors";
import { computeLine, computeHeaderTotals } from "../lib/po-math";
import { notifyTenantAdmins, notifyUsers } from "./notification.service";
import type { SalesOrderCreateInput, SalesOrderFulfilInput } from "@indus/shared";

interface ListOpts {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  customerId?: string;
}

interface ActorContext {
  tenantId: string;
  userId: string;
  isTenantAdmin: boolean;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Audit-log helper. The SO timeline is built from `audit_logs` rather than the
 * `approval_actions` table because that table's resourceType enum is scoped to
 * the buy-side (pr/po/grn/capex). Comments ride along in `metadata`.
 */
async function audit(
  ctx: ActorContext,
  action: string,
  resourceId: string,
  extra: { comment?: string | null; after?: Record<string, unknown> } = {},
) {
  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action,
    resourceType: "sales_order",
    resourceId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    after: extra.after,
    metadata: extra.comment ? { comment: extra.comment } : undefined,
  });
}

async function nextSoNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(salesOrders)
    .where(and(eq(salesOrders.tenantId, tenantId), sql`${salesOrders.createdAt} >= ${yearStart}`));
  const count = result[0]?.count ?? 0;
  return `SO-${year}-${String(count + 1).padStart(5, "0")}`;
}

/** Map a SalesOrderItemInput into the persisted column shape (with GST split). */
function buildItemRow(it: SalesOrderCreateInput["items"][number], isInterstate: boolean, idx: number) {
  const l = computeLine(it, isInterstate);
  return {
    itemId: it.itemId ?? null,
    itemName: it.itemName,
    description: it.description ?? null,
    itemGroupName: it.itemGroupName ?? null,
    itemSubGroupName: it.itemSubGroupName ?? null,
    hsnCode: it.hsnCode ?? null,
    quantityScaled: l.qtyScaled,
    uom: it.uom,
    unitPricePaise: l.unitPaise.toString(),
    discountPercent: Math.round(it.discountPercent ?? 0),
    discountAmountPaise: l.discountPaise.toString(),
    taxRate: l.taxRate,
    cgstRate: l.cgstRate,
    sgstRate: l.sgstRate,
    igstRate: l.igstRate,
    subtotalPaise: l.subtotalPaise.toString(),
    taxableAmountPaise: l.taxableAmountPaise.toString(),
    taxPaise: l.taxPaise.toString(),
    cgstPaise: l.cgstPaise.toString(),
    sgstPaise: l.sgstPaise.toString(),
    igstPaise: l.igstPaise.toString(),
    totalPaise: l.totalPaise.toString(),
    committedDeliveryDate: it.committedDeliveryDate ? new Date(it.committedDeliveryDate) : null,
    itemNarration: it.itemNarration ?? null,
    notes: it.notes ?? null,
    specifications: (it.specifications as Record<string, unknown>) ?? {},
    sortOrder: idx,
  };
}

/** Roll header totals from the input lines + charges (mirrors po.service). */
function headerTotalsFor(input: SalesOrderCreateInput) {
  const isInterstate = input.isInterstate ?? false;
  const lines = input.items.map((it) => computeLine(it, isInterstate));
  return computeHeaderTotals(lines, input.freightCharges ?? 0, input.otherCharges ?? 0, input.roundOff ?? 0);
}

export async function listSalesOrders(tenantId: string, opts: ListOpts = {}) {
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 25, 100);
  const offset = (page - 1) * pageSize;

  const conds = [eq(salesOrders.tenantId, tenantId), isNull(salesOrders.deletedAt)];
  if (opts.status) conds.push(eq(salesOrders.status, opts.status as "draft"));
  if (opts.customerId) conds.push(eq(salesOrders.customerId, opts.customerId));
  if (opts.search?.trim()) conds.push(ilike(salesOrders.title, `%${opts.search.trim()}%`));

  const [rows, totalRow] = await Promise.all([
    db
      .select({ so: salesOrders, customerName: customers.name })
      .from(salesOrders)
      .leftJoin(customers, eq(salesOrders.customerId, customers.id))
      .where(and(...conds))
      .orderBy(desc(salesOrders.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(salesOrders).where(and(...conds)),
  ]);

  const ids = rows.map((r) => r.so.id);
  const counts = ids.length
    ? await db
        .select({ soId: salesOrderItems.soId, count: sql<number>`count(*)::int` })
        .from(salesOrderItems)
        .where(inArray(salesOrderItems.soId, ids))
        .groupBy(salesOrderItems.soId)
    : [];
  const countMap = new Map(counts.map((c) => [c.soId, c.count]));

  return {
    items: rows.map((r) => ({
      id: r.so.id,
      soNumber: r.so.soNumber,
      title: r.so.title,
      status: r.so.status,
      customerId: r.so.customerId,
      customerName: r.customerName ?? "Unknown",
      totalPaise: r.so.totalPaise,
      currency: r.so.currency,
      itemsCount: countMap.get(r.so.id) ?? 0,
      createdAt: r.so.createdAt.toISOString(),
      expectedShipDate: r.so.expectedShipDate ? r.so.expectedShipDate.toISOString() : null,
    })),
    total: totalRow[0]?.count ?? 0,
    page,
    pageSize,
  };
}

export async function getSalesOrder(tenantId: string, id: string) {
  const so = await getSoRaw(tenantId, id);

  const [items, [customer], [creator], [company], [unit], timeline] = await Promise.all([
    db.select().from(salesOrderItems).where(eq(salesOrderItems.soId, id)).orderBy(salesOrderItems.sortOrder),
    db.select().from(customers).where(eq(customers.id, so.customerId)).limit(1),
    db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users).where(eq(users.id, so.createdByUserId)).limit(1),
    db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, so.companyId)).limit(1),
    db.select({ id: units.id, name: units.name, code: units.code }).from(units).where(eq(units.id, so.unitId)).limit(1),
    db
      .select({ log: auditLogs, actorName: users.fullName, actorEmail: users.email })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(and(eq(auditLogs.resourceType, "sales_order"), eq(auditLogs.resourceId, id)))
      .orderBy(auditLogs.createdAt),
  ]);

  return {
    ...so,
    createdAt: so.createdAt.toISOString(),
    updatedAt: so.updatedAt.toISOString(),
    expectedShipDate: so.expectedShipDate ? so.expectedShipDate.toISOString() : null,
    validUntil: so.validUntil ? so.validUntil.toISOString() : null,
    fulfilledAt: so.fulfilledAt?.toISOString() ?? null,
    items: items.map((it) => ({ ...it, createdAt: it.createdAt.toISOString() })),
    customer,
    creator,
    company,
    unit,
    timeline: timeline.map((t) => ({
      id: t.log.id,
      action: t.log.action,
      comment: (t.log.metadata as { comment?: string } | null)?.comment ?? null,
      actorName: t.actorName ?? "Unknown",
      actorEmail: t.actorEmail ?? "",
      createdAt: t.log.createdAt.toISOString(),
    })),
  };
}

export async function createSalesOrder(input: SalesOrderCreateInput, ctx: ActorContext) {
  if (!input.items.length) throw BadRequest("no_items", "Add at least one line item");

  const isInterstate = input.isInterstate ?? false;
  const totals = headerTotalsFor(input);

  const so = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(salesOrders)
      .values({
        tenantId: ctx.tenantId,
        companyId: input.companyId,
        unitId: input.unitId,
        customerId: input.customerId,
        createdByUserId: ctx.userId,
        title: input.title,
        description: input.description ?? null,
        status: "draft",
        customerPoNumber: input.customerPoNumber || null,
        isInterstate,
        placeOfSupply: input.placeOfSupply ?? null,
        subtotalPaise: totals.subtotal.toString(),
        discountTotalPaise: totals.discount.toString(),
        taxableAmountPaise: totals.taxable.toString(),
        cgstTotalPaise: totals.cgst.toString(),
        sgstTotalPaise: totals.sgst.toString(),
        igstTotalPaise: totals.igst.toString(),
        taxTotalPaise: totals.tax.toString(),
        freightChargesPaise: totals.freight.toString(),
        otherChargesPaise: totals.other.toString(),
        roundOffPaise: totals.roundOff.toString(),
        totalPaise: totals.total.toString(),
        expectedShipDate: input.expectedShipDate ? new Date(input.expectedShipDate) : null,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        shippingAddress: input.shippingAddress ?? null,
        billingAddress: input.billingAddress ?? null,
        deliveryTerms: input.deliveryTerms ?? null,
        paymentTerms: input.paymentTerms ?? null,
        termsAndConditions: input.termsAndConditions ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    if (!created) throw new Error("Failed to create sales order");

    await tx.insert(salesOrderItems).values(
      input.items.map((it, idx) => ({ soId: created.id, ...buildItemRow(it, isInterstate, idx) })),
    );

    return created;
  });

  await audit(ctx, "create", so.id, { after: { title: so.title, status: so.status, total: so.totalPaise } });
  return so;
}

/** Update a draft SO — replaces the entire line set and recomputes totals. */
export async function updateSalesOrder(id: string, input: SalesOrderCreateInput, ctx: ActorContext) {
  const existing = await getSoRaw(ctx.tenantId, id);
  if (existing.status !== "draft") {
    throw BadRequest("not_editable", "Only draft sales orders can be edited");
  }
  if (existing.createdByUserId !== ctx.userId && !ctx.isTenantAdmin) {
    throw Forbidden("not_owner", "Only the SO creator or a tenant admin can edit this draft");
  }

  const isInterstate = input.isInterstate ?? false;
  const totals = headerTotalsFor(input);

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(salesOrders)
      .set({
        companyId: input.companyId,
        unitId: input.unitId,
        customerId: input.customerId,
        title: input.title,
        description: input.description ?? null,
        customerPoNumber: input.customerPoNumber || null,
        isInterstate,
        placeOfSupply: input.placeOfSupply ?? null,
        subtotalPaise: totals.subtotal.toString(),
        discountTotalPaise: totals.discount.toString(),
        taxableAmountPaise: totals.taxable.toString(),
        cgstTotalPaise: totals.cgst.toString(),
        sgstTotalPaise: totals.sgst.toString(),
        igstTotalPaise: totals.igst.toString(),
        taxTotalPaise: totals.tax.toString(),
        freightChargesPaise: totals.freight.toString(),
        otherChargesPaise: totals.other.toString(),
        roundOffPaise: totals.roundOff.toString(),
        totalPaise: totals.total.toString(),
        expectedShipDate: input.expectedShipDate ? new Date(input.expectedShipDate) : null,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        shippingAddress: input.shippingAddress ?? null,
        billingAddress: input.billingAddress ?? null,
        deliveryTerms: input.deliveryTerms ?? null,
        paymentTerms: input.paymentTerms ?? null,
        termsAndConditions: input.termsAndConditions ?? null,
        notes: input.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(salesOrders.id, id))
      .returning();

    await tx.delete(salesOrderItems).where(eq(salesOrderItems.soId, id));
    await tx.insert(salesOrderItems).values(
      input.items.map((it, idx) => ({ soId: id, ...buildItemRow(it, isInterstate, idx) })),
    );
    return row;
  });

  await audit(ctx, "update", id);
  return updated;
}

export async function submitSalesOrder(id: string, ctx: ActorContext, comment?: string) {
  const so = await getSoRaw(ctx.tenantId, id);
  if (so.status !== "draft") throw BadRequest("invalid_status", "Only drafts can be submitted");

  const soNumber = so.soNumber ?? (await nextSoNumber(ctx.tenantId));

  await db
    .update(salesOrders)
    .set({
      status: "pending_approval",
      soNumber,
      approvalChain: [{ level: 1, roleKey: "approver", status: "pending" }],
      updatedAt: new Date(),
    })
    .where(eq(salesOrders.id, id));

  await audit(ctx, "submit", id, { comment });

  await notifyTenantAdmins({
    tenantId: ctx.tenantId,
    excludeUserId: ctx.userId,
    kind: "sales_order_submitted",
    title: `New sales order awaiting approval: ${soNumber}`,
    body: so.title,
    resourceType: "sales_order",
    resourceId: id,
    metadata: { soNumber, total: so.totalPaise },
  });
}

export async function approveSalesOrder(id: string, ctx: ActorContext, comment?: string) {
  const so = await getSoRaw(ctx.tenantId, id);
  if (so.status !== "pending_approval") throw BadRequest("invalid_status", "This SO isn't waiting for approval");
  if (so.createdByUserId === ctx.userId && !ctx.isTenantAdmin) {
    throw Forbidden("self_approve", "You cannot approve your own sales order");
  }

  await db
    .update(salesOrders)
    .set({
      status: "approved",
      approvalChain: [{ level: 1, roleKey: "approver", status: "approved" }],
      updatedAt: new Date(),
    })
    .where(eq(salesOrders.id, id));

  await audit(ctx, "approve", id, { comment });

  await notifyUsers({
    tenantId: ctx.tenantId,
    userIds: [so.createdByUserId],
    kind: "sales_order_approved",
    title: `Sales order approved: ${so.soNumber ?? ""}`.trim(),
    body: so.title,
    resourceType: "sales_order",
    resourceId: id,
    metadata: { soNumber: so.soNumber },
  });
}

export async function rejectSalesOrder(id: string, ctx: ActorContext, comment?: string) {
  const so = await getSoRaw(ctx.tenantId, id);
  if (so.status !== "pending_approval") throw BadRequest("invalid_status", "This SO isn't waiting for approval");

  await db
    .update(salesOrders)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(salesOrders.id, id));

  await audit(ctx, "reject", id, { comment });

  await notifyUsers({
    tenantId: ctx.tenantId,
    userIds: [so.createdByUserId],
    kind: "sales_order_rejected",
    title: `Sales order rejected: ${so.soNumber ?? ""}`.trim(),
    body: comment || so.title,
    resourceType: "sales_order",
    resourceId: id,
    metadata: { soNumber: so.soNumber },
  });
}

/**
 * Fulfil (ship) one or more SO lines. With no explicit lines, fulfils all
 * remaining quantity. Updates per-line `fulfilledQtyScaled` then rolls the
 * header status to fulfilled / partially_fulfilled.
 */
export async function fulfilSalesOrder(id: string, input: SalesOrderFulfilInput, ctx: ActorContext) {
  const so = await getSoRaw(ctx.tenantId, id);
  if (!["approved", "partially_fulfilled"].includes(so.status)) {
    throw BadRequest("invalid_status", "Only approved or partially-fulfilled orders can be fulfilled");
  }

  const lines = await db.select().from(salesOrderItems).where(eq(salesOrderItems.soId, id));
  if (lines.length === 0) throw BadRequest("no_items", "This sales order has no lines");

  // Build the per-line quantity-to-ship map (scaled ×1000).
  const explicit = new Map<string, number>();
  for (const l of input.lines ?? []) explicit.set(l.soItemId, Math.round(l.quantity * 1000));

  await db.transaction(async (tx) => {
    for (const line of lines) {
      const remaining = line.quantityScaled - line.fulfilledQtyScaled;
      if (remaining <= 0) continue;
      const requested = explicit.size > 0 ? explicit.get(line.id) ?? 0 : remaining;
      const ship = Math.min(Math.max(0, requested), remaining);
      if (ship <= 0) continue;
      await tx
        .update(salesOrderItems)
        .set({ fulfilledQtyScaled: line.fulfilledQtyScaled + ship })
        .where(eq(salesOrderItems.id, line.id));
    }

    // Re-read to decide the header status.
    const refreshed = await tx.select().from(salesOrderItems).where(eq(salesOrderItems.soId, id));
    let allDone = true;
    let anyDone = false;
    for (const l of refreshed) {
      if (l.fulfilledQtyScaled > 0) anyDone = true;
      if (l.fulfilledQtyScaled < l.quantityScaled) allDone = false;
    }
    const status: "approved" | "partially_fulfilled" | "fulfilled" = allDone
      ? "fulfilled"
      : anyDone
        ? "partially_fulfilled"
        : "approved";
    await tx
      .update(salesOrders)
      .set({ status, fulfilledAt: allDone ? new Date() : so.fulfilledAt, updatedAt: new Date() })
      .where(eq(salesOrders.id, id));
  });

  await audit(ctx, "fulfil", id, { comment: input.comment ?? null });
  return getSalesOrder(ctx.tenantId, id);
}

export async function cancelSalesOrder(id: string, ctx: ActorContext, comment?: string) {
  const so = await getSoRaw(ctx.tenantId, id);
  if (["fulfilled", "closed", "cancelled"].includes(so.status)) {
    throw BadRequest("invalid_status", "This sales order is already finalized");
  }

  await db
    .update(salesOrders)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(salesOrders.id, id));

  await audit(ctx, "cancel", id, { comment });
}

async function getSoRaw(tenantId: string, id: string) {
  const [so] = await db
    .select()
    .from(salesOrders)
    .where(and(eq(salesOrders.id, id), eq(salesOrders.tenantId, tenantId), isNull(salesOrders.deletedAt)))
    .limit(1);
  if (!so) throw NotFound("sales_order_not_found", "Sales Order not found");
  return so;
}
