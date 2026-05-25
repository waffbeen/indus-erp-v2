import { eq, and, isNull, ilike, desc, sql, inArray } from "drizzle-orm";
import { db } from "../db/index";
import { gateEntries, gateEntryItems } from "../db/schema/gate_entries";
import { vendors } from "../db/schema/vendors";
import { users } from "../db/schema/users";
import { auditLogs } from "../db/schema/audit_logs";
import { purchaseOrders } from "../db/schema/po";
import { NotFound, BadRequest } from "../lib/errors";
import type { GateEntryCreateInput } from "@indus/shared";

interface ListOpts { page?: number; pageSize?: number; search?: string; status?: string; type?: string; }
interface ActorContext {
  tenantId: string; userId: string; isTenantAdmin: boolean;
  ipAddress?: string; userAgent?: string;
}

async function nextGateEntryNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(gateEntries)
    .where(and(eq(gateEntries.tenantId, tenantId), sql`${gateEntries.createdAt} >= ${yearStart}`));
  const count = result[0]?.count ?? 0;
  return `GE-${year}-${String(count + 1).padStart(5, "0")}`;
}

export async function listGateEntries(tenantId: string, opts: ListOpts = {}) {
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 25, 100);
  const offset = (page - 1) * pageSize;

  const conds = [eq(gateEntries.tenantId, tenantId), isNull(gateEntries.deletedAt)];
  if (opts.status) conds.push(eq(gateEntries.status, opts.status as "open"));
  if (opts.type) conds.push(eq(gateEntries.type, opts.type as "inward"));
  if (opts.search?.trim()) conds.push(ilike(gateEntries.vehicleNumber, `%${opts.search.trim().toUpperCase()}%`));

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        ge: gateEntries,
        vendorName: vendors.name,
        poNumber: purchaseOrders.poNumber,
      })
      .from(gateEntries)
      .leftJoin(vendors, eq(gateEntries.vendorId, vendors.id))
      .leftJoin(purchaseOrders, eq(gateEntries.poId, purchaseOrders.id))
      .where(and(...conds))
      .orderBy(desc(gateEntries.gateInAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(gateEntries).where(and(...conds)),
  ]);

  const ids = rows.map((r) => r.ge.id);
  const counts = ids.length
    ? await db
        .select({ gid: gateEntryItems.gateEntryId, count: sql<number>`count(*)::int` })
        .from(gateEntryItems)
        .where(inArray(gateEntryItems.gateEntryId, ids))
        .groupBy(gateEntryItems.gateEntryId)
    : [];
  const countMap = new Map(counts.map((c) => [c.gid, c.count]));

  return {
    items: rows.map((r) => ({
      id: r.ge.id,
      gateEntryNumber: r.ge.gateEntryNumber,
      type: r.ge.type,
      status: r.ge.status,
      vendorId: r.ge.vendorId,
      vendorName: r.vendorName,
      poId: r.ge.poId,
      poNumber: r.poNumber,
      vehicleNumber: r.ge.vehicleNumber,
      driverName: r.ge.driverName,
      invoiceNumber: r.ge.invoiceNumber,
      itemsCount: countMap.get(r.ge.id) ?? 0,
      gateInAt: r.ge.gateInAt.toISOString(),
      gateOutAt: r.ge.gateOutAt?.toISOString() ?? null,
      createdAt: r.ge.createdAt.toISOString(),
    })),
    total: totalRow[0]?.count ?? 0,
    page,
    pageSize,
  };
}

export async function getGateEntry(tenantId: string, id: string) {
  const [ge] = await db
    .select()
    .from(gateEntries)
    .where(and(eq(gateEntries.id, id), eq(gateEntries.tenantId, tenantId), isNull(gateEntries.deletedAt)))
    .limit(1);
  if (!ge) throw NotFound("gate_entry_not_found", "Gate entry not found");

  const [items, vendor, [creator], po] = await Promise.all([
    db.select().from(gateEntryItems).where(eq(gateEntryItems.gateEntryId, id)).orderBy(gateEntryItems.sortOrder),
    ge.vendorId ? db.select().from(vendors).where(eq(vendors.id, ge.vendorId)).limit(1).then((r) => r[0]) : Promise.resolve(undefined),
    db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users).where(eq(users.id, ge.createdByUserId)).limit(1),
    ge.poId ? db.select({ id: purchaseOrders.id, poNumber: purchaseOrders.poNumber, title: purchaseOrders.title }).from(purchaseOrders).where(eq(purchaseOrders.id, ge.poId)).limit(1).then((r) => r[0]) : Promise.resolve(undefined),
  ]);

  return {
    ...ge,
    gateInAt: ge.gateInAt.toISOString(),
    gateOutAt: ge.gateOutAt?.toISOString() ?? null,
    invoiceDate: ge.invoiceDate ? ge.invoiceDate.toISOString() : null,
    createdAt: ge.createdAt.toISOString(),
    updatedAt: ge.updatedAt.toISOString(),
    items: items.map((it) => ({ ...it, createdAt: it.createdAt.toISOString() })),
    vendor,
    creator,
    po,
  };
}

export async function createGateEntry(input: GateEntryCreateInput, ctx: ActorContext) {
  const number = await nextGateEntryNumber(ctx.tenantId);
  const [ge] = await db
    .insert(gateEntries)
    .values({
      tenantId: ctx.tenantId,
      companyId: input.companyId,
      unitId: input.unitId,
      createdByUserId: ctx.userId,
      gateEntryNumber: number,
      type: input.type,
      status: "open",
      vendorId: input.vendorId ?? null,
      poId: input.poId ?? null,
      vehicleNumber: input.vehicleNumber?.toUpperCase() ?? null,
      driverName: input.driverName ?? null,
      driverPhone: input.driverPhone ?? null,
      invoiceNumber: input.invoiceNumber ?? null,
      invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : null,
      remarks: input.remarks ?? null,
    })
    .returning();

  if (!ge) throw new Error("Failed to create gate entry");

  if (input.items.length) {
    await db.insert(gateEntryItems).values(
      input.items.map((it, idx) => ({
        gateEntryId: ge.id,
        itemId: it.itemId ?? null,
        itemName: it.itemName,
        description: it.description ?? null,
        quantityScaled: Math.round(it.quantity * 1000),
        uom: it.uom,
        notes: it.notes ?? null,
        sortOrder: idx,
      })),
    );
  }

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "create",
    resourceType: "gate_entry",
    resourceId: ge.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    after: { number, type: ge.type } as Record<string, unknown>,
  });

  return ge;
}

export async function closeGateEntry(id: string, ctx: ActorContext) {
  const [ge] = await db
    .select()
    .from(gateEntries)
    .where(and(eq(gateEntries.id, id), eq(gateEntries.tenantId, ctx.tenantId), isNull(gateEntries.deletedAt)))
    .limit(1);
  if (!ge) throw NotFound("gate_entry_not_found", "Gate entry not found");
  if (ge.status !== "open") throw BadRequest("invalid_status", "Only open gate entries can be closed");

  await db
    .update(gateEntries)
    .set({ status: "closed", gateOutAt: new Date(), updatedAt: new Date() })
    .where(eq(gateEntries.id, id));

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId, actorUserId: ctx.userId,
    action: "close", resourceType: "gate_entry", resourceId: id,
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
  });
}

export async function cancelGateEntry(id: string, ctx: ActorContext) {
  const [ge] = await db
    .select()
    .from(gateEntries)
    .where(and(eq(gateEntries.id, id), eq(gateEntries.tenantId, ctx.tenantId), isNull(gateEntries.deletedAt)))
    .limit(1);
  if (!ge) throw NotFound("gate_entry_not_found", "Gate entry not found");
  if (ge.status === "closed") throw BadRequest("invalid_status", "Closed gate entries cannot be cancelled");

  await db
    .update(gateEntries)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(gateEntries.id, id));

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId, actorUserId: ctx.userId,
    action: "cancel", resourceType: "gate_entry", resourceId: id,
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
  });
}
