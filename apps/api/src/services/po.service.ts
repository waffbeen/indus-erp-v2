import { eq, and, isNull, ilike, desc, sql, inArray } from "drizzle-orm";
import { db } from "../db/index";
import { purchaseOrders, poItems } from "../db/schema/po";
import { purchaseRequisitions, prItems } from "../db/schema/pr";
import { grns, grnItems } from "../db/schema/grns";
import { vendors } from "../db/schema/vendors";
import { users } from "../db/schema/users";
import { auditLogs } from "../db/schema/audit_logs";
import { approvalActions } from "../db/schema/approvals";
import { companies } from "../db/schema/companies";
import { units } from "../db/schema/units";
import { BadRequest, Forbidden, NotFound } from "../lib/errors";
import type { PoCreateInput } from "@indus/shared";

interface ListOpts { page?: number; pageSize?: number; search?: string; status?: string; vendorId?: string; }
interface ActorContext {
  tenantId: string;
  userId: string;
  isTenantAdmin: boolean;
  ipAddress?: string;
  userAgent?: string;
}

interface ComputedLine {
  qtyScaled: number;
  unitPaise: number;
  subtotalPaise: bigint;
  discountPaise: bigint;
  taxableAmountPaise: bigint;
  taxRate: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  taxPaise: bigint;
  cgstPaise: bigint;
  sgstPaise: bigint;
  igstPaise: bigint;
  totalPaise: bigint;
}

function computeLine(it: PoCreateInput["items"][number], isInterstate: boolean): ComputedLine {
  const qtyScaled = Math.round(it.quantity * 1000);
  const unitPaise = Math.round(it.unitPrice * 100);
  const subtotal = (BigInt(qtyScaled) * BigInt(unitPaise)) / 1000n;
  const discountPercent = BigInt(Math.round(it.discountPercent ?? 0));
  const discount = (subtotal * discountPercent) / 100n;
  const taxable = subtotal - discount;
  const taxRate = it.taxRate;
  let cgstRate = 0, sgstRate = 0, igstRate = 0;
  if (isInterstate) {
    igstRate = taxRate;
  } else {
    cgstRate = Math.floor(taxRate / 2);
    sgstRate = taxRate - cgstRate;
  }
  const cgst = (taxable * BigInt(cgstRate)) / 100n;
  const sgst = (taxable * BigInt(sgstRate)) / 100n;
  const igst = (taxable * BigInt(igstRate)) / 100n;
  const tax = cgst + sgst + igst;
  return {
    qtyScaled, unitPaise,
    subtotalPaise: subtotal, discountPaise: discount, taxableAmountPaise: taxable,
    taxRate, cgstRate, sgstRate, igstRate,
    taxPaise: tax, cgstPaise: cgst, sgstPaise: sgst, igstPaise: igst,
    totalPaise: taxable + tax,
  };
}

function computeHeaderTotals(
  lines: ComputedLine[],
  freightRupees: number,
  otherRupees: number,
  roundOffRupees: number,
) {
  let subtotal = 0n, discount = 0n, taxable = 0n, cgst = 0n, sgst = 0n, igst = 0n, tax = 0n;
  for (const l of lines) {
    subtotal += l.subtotalPaise;
    discount += l.discountPaise;
    taxable += l.taxableAmountPaise;
    cgst += l.cgstPaise;
    sgst += l.sgstPaise;
    igst += l.igstPaise;
    tax += l.taxPaise;
  }
  const freight = BigInt(Math.round(freightRupees * 100));
  const other = BigInt(Math.round(otherRupees * 100));
  const roundOff = BigInt(Math.round(roundOffRupees * 100));
  const total = taxable + tax + freight + other + roundOff;
  return { subtotal, discount, taxable, cgst, sgst, igst, tax, freight, other, roundOff, total };
}

/** @deprecated Use computeLine + computeHeaderTotals instead. */
function computeTotals(items: PoCreateInput["items"]): { subtotal: bigint; tax: bigint; total: bigint } {
  let subtotal = 0n;
  let tax = 0n;
  for (const it of items) {
    const qtyScaled = BigInt(Math.round(it.quantity * 1000));
    const unitPaise = BigInt(Math.round(it.unitPrice * 100));
    const lineSub = (qtyScaled * unitPaise) / 1000n;
    const lineTax = (lineSub * BigInt(it.taxRate)) / 100n;
    subtotal += lineSub;
    tax += lineTax;
  }
  return { subtotal, tax, total: subtotal + tax };
}

async function nextPoNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.tenantId, tenantId), sql`${purchaseOrders.createdAt} >= ${yearStart}`));
  const count = result[0]?.count ?? 0;
  return `PO-${year}-${String(count + 1).padStart(5, "0")}`;
}

export async function listPos(tenantId: string, opts: ListOpts = {}) {
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 25, 100);
  const offset = (page - 1) * pageSize;

  const conds = [eq(purchaseOrders.tenantId, tenantId), isNull(purchaseOrders.deletedAt)];
  if (opts.status) conds.push(eq(purchaseOrders.status, opts.status as "draft"));
  if (opts.vendorId) conds.push(eq(purchaseOrders.vendorId, opts.vendorId));
  if (opts.search?.trim()) conds.push(ilike(purchaseOrders.title, `%${opts.search.trim()}%`));

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        po: purchaseOrders,
        vendorName: vendors.name,
      })
      .from(purchaseOrders)
      .leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
      .where(and(...conds))
      .orderBy(desc(purchaseOrders.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(purchaseOrders).where(and(...conds)),
  ]);

  const poIds = rows.map((r) => r.po.id);
  const counts = poIds.length
    ? await db
        .select({ poId: poItems.poId, count: sql<number>`count(*)::int` })
        .from(poItems)
        .where(inArray(poItems.poId, poIds))
        .groupBy(poItems.poId)
    : [];
  const countMap = new Map(counts.map((c) => [c.poId, c.count]));

  return {
    items: rows.map((r) => ({
      id: r.po.id,
      poNumber: r.po.poNumber,
      title: r.po.title,
      status: r.po.status,
      vendorId: r.po.vendorId,
      vendorName: r.vendorName ?? "Unknown",
      prId: r.po.prId,
      totalPaise: r.po.totalPaise,
      currency: r.po.currency,
      itemsCount: countMap.get(r.po.id) ?? 0,
      createdAt: r.po.createdAt.toISOString(),
      deliveryDate: r.po.deliveryDate ? r.po.deliveryDate.toISOString() : null,
    })),
    total: totalRow[0]?.count ?? 0,
    page,
    pageSize,
  };
}

export async function getPo(tenantId: string, id: string) {
  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, tenantId), isNull(purchaseOrders.deletedAt)))
    .limit(1);
  if (!po) throw NotFound("po_not_found", "Purchase Order not found");

  const [items, [vendor], [creator], [company], [unit], actions] = await Promise.all([
    db.select().from(poItems).where(eq(poItems.poId, id)).orderBy(poItems.sortOrder),
    db.select().from(vendors).where(eq(vendors.id, po.vendorId)).limit(1),
    db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users).where(eq(users.id, po.createdByUserId)).limit(1),
    db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, po.companyId)).limit(1),
    db.select({ id: units.id, name: units.name, code: units.code }).from(units).where(eq(units.id, po.unitId)).limit(1),
    db
      .select({
        action: approvalActions,
        actor: { fullName: users.fullName, email: users.email },
      })
      .from(approvalActions)
      .leftJoin(users, eq(approvalActions.actorUserId, users.id))
      .where(and(eq(approvalActions.resourceType, "po"), eq(approvalActions.resourceId, id)))
      .orderBy(approvalActions.createdAt),
  ]);

  return {
    ...po,
    createdAt: po.createdAt.toISOString(),
    updatedAt: po.updatedAt.toISOString(),
    deliveryDate: po.deliveryDate ? po.deliveryDate.toISOString() : null,
    validUntil: po.validUntil ? po.validUntil.toISOString() : null,
    sentToVendorAt: po.sentToVendorAt?.toISOString() ?? null,
    acknowledgedAt: po.acknowledgedAt?.toISOString() ?? null,
    items: items.map((it) => ({ ...it, createdAt: it.createdAt.toISOString() })),
    vendor,
    creator,
    company,
    unit,
    timeline: actions.map((a) => ({
      id: a.action.id,
      action: a.action.action,
      comment: a.action.comment,
      level: a.action.level,
      actorName: a.actor?.fullName ?? "Unknown",
      actorEmail: a.actor?.email ?? "",
      createdAt: a.action.createdAt.toISOString(),
    })),
  };
}

/** Build a draft PoCreateInput from an approved PR (used by frontend to pre-fill the form). */
export async function getPoDraftFromPr(tenantId: string, prId: string) {
  const [pr] = await db
    .select()
    .from(purchaseRequisitions)
    .where(and(eq(purchaseRequisitions.id, prId), eq(purchaseRequisitions.tenantId, tenantId), isNull(purchaseRequisitions.deletedAt)))
    .limit(1);
  if (!pr) throw NotFound("pr_not_found", "Source PR not found");
  if (pr.status !== "approved") {
    throw BadRequest("pr_not_approved", "Only approved PRs can be converted to POs");
  }
  const items = await db.select().from(prItems).where(eq(prItems.prId, prId)).orderBy(prItems.sortOrder);

  return {
    pr: {
      id: pr.id,
      prNumber: pr.prNumber,
      title: pr.title,
      description: pr.description,
      companyId: pr.companyId,
      unitId: pr.unitId,
    },
    items: items.map((it) => ({
      prItemId: it.id,
      itemId: it.itemId,
      itemName: it.itemName,
      description: it.description,
      itemGroupName: it.itemGroupName,
      itemSubGroupName: it.itemSubGroupName,
      hsnCode: it.hsnCode,
      uom: it.uom,
      quantity: it.quantityScaled / 1000,
      estimatedUnitPrice: it.estimatedUnitPricePaise ? Number(it.estimatedUnitPricePaise) / 100 : 0,
      itemNarration: it.itemNarration,
      specifications: it.specifications,
    })),
  };
}

export async function createPo(input: PoCreateInput, ctx: ActorContext) {
  if (!input.items.length) throw BadRequest("no_items", "Add at least one line item");

  const isInterstate = input.isInterstate ?? false;
  const computedLines = input.items.map((it) => computeLine(it, isInterstate));
  const totals = computeHeaderTotals(
    computedLines,
    input.freightCharges ?? 0,
    input.otherCharges ?? 0,
    input.roundOff ?? 0,
  );

  const [po] = await db
    .insert(purchaseOrders)
    .values({
      tenantId: ctx.tenantId,
      companyId: input.companyId,
      unitId: input.unitId,
      vendorId: input.vendorId,
      prId: input.prId ?? null,
      createdByUserId: ctx.userId,
      title: input.title,
      description: input.description ?? null,
      status: "draft",
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
      deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : null,
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
      deliveryAddress: input.deliveryAddress ?? null,
      deliveryTerms: input.deliveryTerms ?? null,
      paymentTerms: input.paymentTerms ?? null,
      termsAndConditions: input.termsAndConditions ?? null,
      revisionNo: input.revisionNo ?? 0,
      revisionRemark: input.revisionRemark ?? null,
    })
    .returning();
  if (!po) throw new Error("Failed to create PO");

  await db.insert(poItems).values(
    input.items.map((it, idx) => {
      const l = computedLines[idx]!;
      return {
        poId: po.id,
        prItemId: it.prItemId ?? null,
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
    }),
  );

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "create",
    resourceType: "po",
    resourceId: po.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    after: { title: po.title, status: po.status, total: po.totalPaise } as Record<string, unknown>,
  });

  return po;
}

export async function submitPo(id: string, ctx: ActorContext, comment?: string) {
  const po = await getPoRaw(ctx.tenantId, id);
  if (po.status !== "draft") throw BadRequest("invalid_status", "Only drafts can be submitted");

  const poNumber = po.poNumber ?? (await nextPoNumber(ctx.tenantId));

  await db.transaction(async (tx) => {
    await tx
      .update(purchaseOrders)
      .set({
        status: "pending_approval",
        poNumber,
        approvalChain: [{ level: 1, roleKey: "approver", status: "pending" }],
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, id));

    await tx.insert(approvalActions).values({
      tenantId: ctx.tenantId,
      resourceType: "po",
      resourceId: id,
      actorUserId: ctx.userId,
      action: "submit",
      comment: comment ?? null,
    });
  });

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId, actorUserId: ctx.userId,
    action: "submit", resourceType: "po", resourceId: id,
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
  });
}

export async function approvePo(id: string, ctx: ActorContext, comment?: string) {
  const po = await getPoRaw(ctx.tenantId, id);
  if (po.status !== "pending_approval") throw BadRequest("invalid_status", "This PO isn't waiting for approval");
  if (po.createdByUserId === ctx.userId && !ctx.isTenantAdmin) {
    throw Forbidden("self_approve", "You cannot approve your own PO");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(purchaseOrders)
      .set({
        status: "approved",
        approvalChain: [{ level: 1, roleKey: "approver", status: "approved" }],
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, id));

    await tx.insert(approvalActions).values({
      tenantId: ctx.tenantId,
      resourceType: "po",
      resourceId: id,
      actorUserId: ctx.userId,
      action: "approve",
      level: 1,
      comment: comment ?? null,
    });

    // If sourced from PR, mark PR as converted
    if (po.prId) {
      await tx
        .update(purchaseRequisitions)
        .set({ status: "converted_to_po", updatedAt: new Date() })
        .where(eq(purchaseRequisitions.id, po.prId));
    }
  });

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId, actorUserId: ctx.userId,
    action: "approve", resourceType: "po", resourceId: id,
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
  });
}

export async function rejectPo(id: string, ctx: ActorContext, comment?: string) {
  const po = await getPoRaw(ctx.tenantId, id);
  if (po.status !== "pending_approval") throw BadRequest("invalid_status", "This PO isn't waiting for approval");

  await db.transaction(async (tx) => {
    await tx
      .update(purchaseOrders)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(purchaseOrders.id, id));

    await tx.insert(approvalActions).values({
      tenantId: ctx.tenantId,
      resourceType: "po",
      resourceId: id,
      actorUserId: ctx.userId,
      action: "reject",
      level: 1,
      comment: comment ?? null,
    });
  });

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId, actorUserId: ctx.userId,
    action: "reject", resourceType: "po", resourceId: id,
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
  });
}

export async function sendToVendor(id: string, ctx: ActorContext, comment?: string) {
  const po = await getPoRaw(ctx.tenantId, id);
  if (po.status !== "approved") throw BadRequest("invalid_status", "Only approved POs can be sent");

  await db.transaction(async (tx) => {
    await tx
      .update(purchaseOrders)
      .set({ status: "sent_to_vendor", sentToVendorAt: new Date(), updatedAt: new Date() })
      .where(eq(purchaseOrders.id, id));

    await tx.insert(approvalActions).values({
      tenantId: ctx.tenantId,
      resourceType: "po",
      resourceId: id,
      actorUserId: ctx.userId,
      action: "submit", // re-using "submit" — could add "dispatch" later
      comment: comment ?? "Sent to vendor",
    });
  });

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId, actorUserId: ctx.userId,
    action: "send_to_vendor", resourceType: "po", resourceId: id,
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
  });
}

export async function cancelPo(id: string, ctx: ActorContext, comment?: string) {
  const po = await getPoRaw(ctx.tenantId, id);
  if (["received", "closed", "cancelled"].includes(po.status)) {
    throw BadRequest("invalid_status", "This PO is already finalized");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(purchaseOrders)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(purchaseOrders.id, id));

    await tx.insert(approvalActions).values({
      tenantId: ctx.tenantId,
      resourceType: "po",
      resourceId: id,
      actorUserId: ctx.userId,
      action: "cancel",
      comment: comment ?? null,
    });
  });

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId, actorUserId: ctx.userId,
    action: "cancel", resourceType: "po", resourceId: id,
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
  });
}

/** Called by GRN service — update PO status based on received qty. */
export async function refreshPoReceivedStatus(tenantId: string, poId: string) {
  // Sum received across all GRNs for this PO
  const items = await db.select().from(poItems).where(eq(poItems.poId, poId));
  if (items.length === 0) return;

  // Calculate received per po_item from grn_items, excluding cancelled GRNs
  const itemIds = items.map((i) => i.id);
  const receivedRows = itemIds.length
    ? await db
        .select({
          poItemId: grnItems.poItemId,
          received: sql<number>`COALESCE(SUM(${grnItems.acceptedQuantityScaled}), 0)::int`.as("received"),
        })
        .from(grnItems)
        .innerJoin(grns, eq(grnItems.grnId, grns.id))
        .where(and(inArray(grnItems.poItemId, itemIds), sql`${grns.status} <> 'cancelled'`))
        .groupBy(grnItems.poItemId)
    : [];

  const receivedMap = new Map<string, number>();
  for (const r of receivedRows) {
    if (r.poItemId) receivedMap.set(r.poItemId, r.received);
  }

  let allReceived = true;
  let anyReceived = false;
  for (const it of items) {
    const got = receivedMap.get(it.id) ?? 0;
    if (got > 0) anyReceived = true;
    if (got < Number(it.quantityScaled)) allReceived = false;
  }

  let newStatus: "approved" | "sent_to_vendor" | "partially_received" | "received";
  if (allReceived) newStatus = "received";
  else if (anyReceived) newStatus = "partially_received";
  else {
    const [po] = await db.select({ status: purchaseOrders.status }).from(purchaseOrders).where(eq(purchaseOrders.id, poId));
    newStatus = (po?.status as typeof newStatus) ?? "sent_to_vendor";
  }

  await db
    .update(purchaseOrders)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenantId, tenantId)));
}

async function getPoRaw(tenantId: string, id: string) {
  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, tenantId), isNull(purchaseOrders.deletedAt)))
    .limit(1);
  if (!po) throw NotFound("po_not_found", "Purchase Order not found");
  return po;
}
