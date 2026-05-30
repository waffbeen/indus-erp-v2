import { eq, and, isNull, ilike, desc, sql } from "drizzle-orm";
import { db } from "../db/index";
import { vendors } from "../db/schema/vendors";
import { auditLogs } from "../db/schema/audit_logs";
import { NotFound, Conflict } from "../lib/errors";
import type { VendorCreateInput, VendorUpdateInput } from "@indus/shared";

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

async function nextVendorCode(tenantId: string): Promise<string> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vendors)
    .where(eq(vendors.tenantId, tenantId));
  const count = result[0]?.count ?? 0;
  return `V-${String(count + 1).padStart(4, "0")}`;
}

export async function listVendors(tenantId: string, opts: ListOpts = {}) {
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 25, 100);
  const offset = (page - 1) * pageSize;

  const conditions = [eq(vendors.tenantId, tenantId), isNull(vendors.deletedAt)];
  if (opts.search?.trim()) {
    conditions.push(ilike(vendors.name, `%${opts.search.trim()}%`));
  }

  const [rows, total] = await Promise.all([
    db
      .select()
      .from(vendors)
      .where(and(...conditions))
      .orderBy(desc(vendors.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(vendors)
      .where(and(...conditions)),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      gstin: r.gstin,
      city: r.city,
      state: r.state,
      email: r.email,
      phone: r.phone,
      ratingScaled: r.ratingScaled,
      ratingCount: r.ratingCount,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
    })),
    page,
    pageSize,
    total: total[0]?.count ?? 0,
  };
}

export async function getVendor(tenantId: string, id: string) {
  const [v] = await db
    .select()
    .from(vendors)
    .where(and(eq(vendors.id, id), eq(vendors.tenantId, tenantId), isNull(vendors.deletedAt)))
    .limit(1);
  if (!v) throw NotFound("vendor_not_found", "Vendor not found");
  return v;
}

export async function createVendor(input: VendorCreateInput, ctx: ActorContext) {
  const data = sanitize(input);

  // GSTIN uniqueness check within tenant
  if (data.gstin) {
    const [existing] = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(
        and(
          eq(vendors.tenantId, ctx.tenantId),
          eq(vendors.gstin, data.gstin),
          isNull(vendors.deletedAt),
        ),
      )
      .limit(1);
    if (existing) {
      throw Conflict("gstin_exists", "A vendor with this GSTIN already exists");
    }
  }

  const code = await nextVendorCode(ctx.tenantId);

  const [created] = await db
    .insert(vendors)
    .values({
      tenantId: ctx.tenantId,
      code,
      ...data,
    })
    .returning();

  if (!created) throw new Error("Failed to create vendor");

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    action: "create",
    resourceType: "vendor",
    resourceId: created.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    after: created as Record<string, unknown>,
  });

  return created;
}

export async function updateVendor(id: string, input: VendorUpdateInput, ctx: ActorContext) {
  const before = await getVendor(ctx.tenantId, id);
  const data = sanitize(input);

  const [updated] = await db
    .update(vendors)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(vendors.id, id), eq(vendors.tenantId, ctx.tenantId)))
    .returning();

  if (!updated) throw NotFound("vendor_not_found", "Vendor not found");

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    action: "update",
    resourceType: "vendor",
    resourceId: updated.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    before: before as Record<string, unknown>,
    after: updated as Record<string, unknown>,
  });

  return updated;
}

export async function deleteVendor(id: string, ctx: ActorContext) {
  const before = await getVendor(ctx.tenantId, id);

  await db
    .update(vendors)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(vendors.id, id), eq(vendors.tenantId, ctx.tenantId)));

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    action: "delete",
    resourceType: "vendor",
    resourceId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    before: before as Record<string, unknown>,
  });
}
