import { eq, and, isNull, desc, sql, inArray } from "drizzle-orm";
import { db } from "../db/index";
import { grns, grnItems } from "../db/schema/grns";
import { purchaseOrders, poItems } from "../db/schema/po";
import { vendors } from "../db/schema/vendors";
import { users } from "../db/schema/users";
import { auditLogs } from "../db/schema/audit_logs";
import { NotFound, BadRequest } from "../lib/errors";
import * as poService from "./po.service";
import type { GrnCreateInput } from "@indus/shared";

interface ListOpts { page?: number; pageSize?: number; status?: string; poId?: string; vendorId?: string; }
interface ActorContext {
  tenantId: string; userId: string; isTenantAdmin: boolean;
  ipAddress?: string; userAgent?: string;
}

async function nextGrnNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(grns)
    .where(and(eq(grns.tenantId, tenantId), sql`${grns.createdAt} >= ${yearStart}`));
  const count = result[0]?.count ?? 0;
  return `GRN-${year}-${String(count + 1).padStart(5, "0")}`;
}

export async function listGrns(tenantId: string, opts: ListOpts = {}) {
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 25, 100);
  const offset = (page - 1) * pageSize;

  const conds = [eq(grns.tenantId, tenantId), isNull(grns.deletedAt)];
  if (opts.status) conds.push(eq(grns.status, opts.status as "draft"));
  if (opts.poId) conds.push(eq(grns.poId, opts.poId));
  if (opts.vendorId) conds.push(eq(grns.vendorId, opts.vendorId));

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        grn: grns,
        poNumber: purchaseOrders.poNumber,
        vendorName: vendors.name,
      })
      .from(grns)
      .leftJoin(purchaseOrders, eq(grns.poId, purchaseOrders.id))
      .leftJoin(vendors, eq(grns.vendorId, vendors.id))
      .where(and(...conds))
      .orderBy(desc(grns.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(grns).where(and(...conds)),
  ]);

  const ids = rows.map((r) => r.grn.id);
  const counts = ids.length
    ? await db
        .select({ gid: grnItems.grnId, count: sql<number>`count(*)::int` })
        .from(grnItems)
        .where(inArray(grnItems.grnId, ids))
        .groupBy(grnItems.grnId)
    : [];
  const countMap = new Map(counts.map((c) => [c.gid, c.count]));

  return {
    items: rows.map((r) => ({
      id: r.grn.id,
      grnNumber: r.grn.grnNumber,
      status: r.grn.status,
      poId: r.grn.poId,
      poNumber: r.poNumber,
      vendorId: r.grn.vendorId,
      vendorName: r.vendorName,
      invoiceNumber: r.grn.invoiceNumber,
      invoiceAmountPaise: r.grn.invoiceAmountPaise,
      receivedDate: r.grn.receivedDate.toISOString(),
      itemsCount: countMap.get(r.grn.id) ?? 0,
      createdAt: r.grn.createdAt.toISOString(),
    })),
    total: totalRow[0]?.count ?? 0,
    page,
    pageSize,
  };
}

export async function getGrn(tenantId: string, id: string) {
  const [grn] = await db
    .select()
    .from(grns)
    .where(and(eq(grns.id, id), eq(grns.tenantId, tenantId), isNull(grns.deletedAt)))
    .limit(1);
  if (!grn) throw NotFound("grn_not_found", "GRN not found");

  const [items, vendor, po, [receivedBy]] = await Promise.all([
    db.select().from(grnItems).where(eq(grnItems.grnId, id)).orderBy(grnItems.sortOrder),
    db.select().from(vendors).where(eq(vendors.id, grn.vendorId)).limit(1).then((r) => r[0]),
    db
      .select({ id: purchaseOrders.id, poNumber: purchaseOrders.poNumber, title: purchaseOrders.title, status: purchaseOrders.status })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, grn.poId))
      .limit(1)
      .then((r) => r[0]),
    db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users).where(eq(users.id, grn.receivedByUserId)).limit(1),
  ]);

  return {
    ...grn,
    receivedDate: grn.receivedDate.toISOString(),
    invoiceDate: grn.invoiceDate ? grn.invoiceDate.toISOString() : null,
    createdAt: grn.createdAt.toISOString(),
    updatedAt: grn.updatedAt.toISOString(),
    items: items.map((it) => ({ ...it, createdAt: it.createdAt.toISOString() })),
    vendor,
    po,
    receivedBy,
  };
}

/** Pre-fill GRN form from a PO — returns ordered qty already-received per line. */
export async function getGrnDraftFromPo(tenantId: string, poId: string) {
  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenantId, tenantId), isNull(purchaseOrders.deletedAt)))
    .limit(1);
  if (!po) throw NotFound("po_not_found", "Source PO not found");
  if (!["approved", "sent_to_vendor", "partially_received"].includes(po.status)) {
    throw BadRequest("po_not_ready", "Only approved/sent/partially-received POs can have GRNs raised against them");
  }

  const items = await db.select().from(poItems).where(eq(poItems.poId, poId)).orderBy(poItems.sortOrder);

  // Already received per po_item
  const itemIds = items.map((i) => i.id);
  const received = itemIds.length
    ? await db.execute<{ po_item_id: string; received: number }>(
        sql`SELECT po_item_id, COALESCE(SUM(accepted_quantity_scaled), 0)::int AS received
            FROM grn_items
            WHERE po_item_id = ANY(${itemIds})
            GROUP BY po_item_id`,
      )
    : { rows: [] as Array<{ po_item_id: string; received: number }> };
  const receivedMap = new Map<string, number>();
  for (const r of received.rows) receivedMap.set(r.po_item_id, r.received);

  return {
    po: {
      id: po.id,
      poNumber: po.poNumber,
      title: po.title,
      companyId: po.companyId,
      unitId: po.unitId,
      vendorId: po.vendorId,
    },
    items: items.map((it) => {
      const alreadyReceived = receivedMap.get(it.id) ?? 0;
      const orderedScaled = it.quantityScaled;
      const remainingScaled = Math.max(0, orderedScaled - alreadyReceived);
      return {
        poItemId: it.id,
        itemId: it.itemId,
        itemName: it.itemName,
        uom: it.uom,
        orderedQuantity: orderedScaled / 1000,
        alreadyReceivedQuantity: alreadyReceived / 1000,
        suggestedReceiveQuantity: remainingScaled / 1000,
        unitPrice: Number(it.unitPricePaise) / 100,
      };
    }),
  };
}

export async function createGrn(input: GrnCreateInput, ctx: ActorContext) {
  if (!input.items.length) throw BadRequest("no_items", "Add at least one line");

  const number = await nextGrnNumber(ctx.tenantId);
  const invoicePaise = input.invoiceAmount ? Math.round(input.invoiceAmount * 100).toString() : null;

  const [grn] = await db
    .insert(grns)
    .values({
      tenantId: ctx.tenantId,
      companyId: input.companyId,
      unitId: input.unitId,
      poId: input.poId,
      vendorId: input.vendorId,
      gateEntryId: input.gateEntryId ?? null,
      receivedByUserId: ctx.userId,
      grnNumber: number,
      status: "submitted",
      invoiceNumber: input.invoiceNumber ?? null,
      invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : null,
      invoiceAmountPaise: invoicePaise,
      receivedDate: new Date(input.receivedDate),
      remarks: input.remarks ?? null,
    })
    .returning();

  if (!grn) throw new Error("Failed to create GRN");

  await db.insert(grnItems).values(
    input.items.map((it, idx) => ({
      grnId: grn.id,
      poItemId: it.poItemId ?? null,
      itemId: it.itemId ?? null,
      itemName: it.itemName,
      uom: it.uom,
      orderedQuantityScaled: Math.round(it.orderedQuantity * 1000),
      receivedQuantityScaled: Math.round(it.receivedQuantity * 1000),
      acceptedQuantityScaled: Math.round(it.acceptedQuantity * 1000),
      rejectedQuantityScaled: Math.round(it.rejectedQuantity * 1000),
      unitPricePaise: Math.round(it.unitPrice * 100).toString(),
      condition: it.condition,
      remarks: it.remarks ?? null,
      sortOrder: idx,
    })),
  );

  // Update PO status based on cumulative received
  await poService.refreshPoReceivedStatus(ctx.tenantId, input.poId);

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "create",
    resourceType: "grn",
    resourceId: grn.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    after: { number, poId: grn.poId, items: input.items.length } as Record<string, unknown>,
  });

  return grn;
}

export async function cancelGrn(id: string, ctx: ActorContext) {
  const [grn] = await db
    .select()
    .from(grns)
    .where(and(eq(grns.id, id), eq(grns.tenantId, ctx.tenantId), isNull(grns.deletedAt)))
    .limit(1);
  if (!grn) throw NotFound("grn_not_found", "GRN not found");
  if (grn.status === "cancelled") return;

  await db
    .update(grns)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(grns.id, id));

  await poService.refreshPoReceivedStatus(ctx.tenantId, grn.poId);

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId, actorUserId: ctx.userId,
    action: "cancel", resourceType: "grn", resourceId: id,
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
  });
}
