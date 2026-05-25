import { eq, and, isNull, ilike, desc, sql } from "drizzle-orm";
import { db } from "../db/index";
import { items } from "../db/schema/items";
import { auditLogs } from "../db/schema/audit_logs";
import { NotFound } from "../lib/errors";
import type { ItemCreateInput, ItemUpdateInput } from "@indus/shared";

interface ListOpts {
  page?: number;
  pageSize?: number;
  search?: string;
}

interface ActorContext {
  tenantId: string;
  userId: string;
  userEmail: string;
  ipAddress?: string;
  userAgent?: string;
}

const sanitize = <T extends Record<string, unknown>>(obj: T): T => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === "" || v === undefined) continue;
    out[k] = v;
  }
  return out as T;
};

async function nextItemCode(tenantId: string): Promise<string> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(items)
    .where(eq(items.tenantId, tenantId));
  const count = result[0]?.count ?? 0;
  return `I-${String(count + 1).padStart(4, "0")}`;
}

export async function listItems(tenantId: string, opts: ListOpts = {}) {
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 25, 100);
  const offset = (page - 1) * pageSize;

  const conditions = [eq(items.tenantId, tenantId), isNull(items.deletedAt)];
  if (opts.search?.trim()) {
    conditions.push(ilike(items.name, `%${opts.search.trim()}%`));
  }

  const [rows, total] = await Promise.all([
    db
      .select()
      .from(items)
      .where(and(...conditions))
      .orderBy(desc(items.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(items)
      .where(and(...conditions)),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      category: r.category,
      itemGroupName: r.itemGroupName,
      itemSubGroupName: r.itemSubGroupName,
      uom: r.uom,
      stockUnit: r.stockUnit,
      purchaseUnit: r.purchaseUnit,
      hsnCode: r.hsnCode,
      defaultTaxRate: r.defaultTaxRate,
      isStocked: r.isStocked,
      isAsset: r.isAsset,
      isService: r.isService,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
    })),
    page,
    pageSize,
    total: total[0]?.count ?? 0,
  };
}

/**
 * Last purchase info for an item — looked up from previous PO lines.
 * Used by PR form to show "last bought at ₹X on dd-MMM-yyyy".
 */
export async function getLastPurchaseInfo(tenantId: string, itemId: string) {
  const rows = await db.execute<{ rate: string; date: Date; vendor_name: string | null; po_number: string | null }>(
    sql`SELECT pi.unit_price_paise::text AS rate,
               po.created_at AS date,
               v.name AS vendor_name,
               po.po_number AS po_number
        FROM po_items pi
        JOIN purchase_orders po ON po.id = pi.po_id
        LEFT JOIN vendors v ON v.id = po.vendor_id
        WHERE pi.item_id = ${itemId}
          AND po.tenant_id = ${tenantId}
          AND po.deleted_at IS NULL
          AND po.status IN ('approved','sent_to_vendor','partially_received','received','closed')
        ORDER BY po.created_at DESC
        LIMIT 1`,
  );
  const row = rows.rows[0];
  if (!row) return { ratePaise: null, date: null, vendorName: null, poNumber: null };
  return {
    ratePaise: row.rate,
    date: row.date instanceof Date ? row.date.toISOString() : String(row.date),
    vendorName: row.vendor_name,
    poNumber: row.po_number,
  };
}

export async function getItem(tenantId: string, id: string) {
  const [v] = await db
    .select()
    .from(items)
    .where(and(eq(items.id, id), eq(items.tenantId, tenantId), isNull(items.deletedAt)))
    .limit(1);
  if (!v) throw NotFound("item_not_found", "Item not found");
  return v;
}

export async function createItem(input: ItemCreateInput, ctx: ActorContext) {
  const data = sanitize(input);
  const code = await nextItemCode(ctx.tenantId);

  const [created] = await db
    .insert(items)
    .values({
      tenantId: ctx.tenantId,
      code,
      ...(data as object),
    })
    .returning();

  if (!created) throw new Error("Failed to create item");

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    action: "create",
    resourceType: "item",
    resourceId: created.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    after: created as Record<string, unknown>,
  });

  return created;
}

export async function updateItem(id: string, input: ItemUpdateInput, ctx: ActorContext) {
  const before = await getItem(ctx.tenantId, id);
  const data = sanitize(input);

  const [updated] = await db
    .update(items)
    .set({ ...(data as object), updatedAt: new Date() })
    .where(and(eq(items.id, id), eq(items.tenantId, ctx.tenantId)))
    .returning();

  if (!updated) throw NotFound("item_not_found", "Item not found");

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    action: "update",
    resourceType: "item",
    resourceId: updated.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    before: before as Record<string, unknown>,
    after: updated as Record<string, unknown>,
  });

  return updated;
}

export async function deleteItem(id: string, ctx: ActorContext) {
  const before = await getItem(ctx.tenantId, id);

  await db
    .update(items)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(items.id, id), eq(items.tenantId, ctx.tenantId)));

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    action: "delete",
    resourceType: "item",
    resourceId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    before: before as Record<string, unknown>,
  });
}
