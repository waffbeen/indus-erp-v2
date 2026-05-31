import { eq, and, isNull, ilike, desc, sql } from "drizzle-orm";
import { db } from "../db/index";
import { customers } from "../db/schema/customers";
import { auditLogs } from "../db/schema/audit_logs";
import { NotFound, Conflict } from "../lib/errors";
import type { CustomerCreateInput, CustomerUpdateInput } from "@indus/shared";

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

/** Drop empty-string / undefined values so we don't overwrite columns with "". */
const sanitize = <T extends Record<string, unknown>>(obj: T): T => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === "" || v === undefined) continue;
    out[k] = v;
  }
  return out as T;
};

/** `creditLimit` is sent in ₹ from the UI — convert to paise for storage. */
function toRow(input: Partial<CustomerCreateInput>): Record<string, unknown> {
  const { creditLimit, ...rest } = input;
  const row: Record<string, unknown> = sanitize(rest);
  if (creditLimit !== undefined && creditLimit !== null) {
    row.creditLimitPaise = Math.round(creditLimit * 100).toString();
  }
  return row;
}

async function nextCustomerCode(tenantId: string): Promise<string> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(eq(customers.tenantId, tenantId));
  const count = result[0]?.count ?? 0;
  return `C-${String(count + 1).padStart(4, "0")}`;
}

export async function listCustomers(tenantId: string, opts: ListOpts = {}) {
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 25, 100);
  const offset = (page - 1) * pageSize;

  const conditions = [eq(customers.tenantId, tenantId), isNull(customers.deletedAt)];
  if (opts.search?.trim()) {
    conditions.push(ilike(customers.name, `%${opts.search.trim()}%`));
  }

  const [rows, total] = await Promise.all([
    db
      .select()
      .from(customers)
      .where(and(...conditions))
      .orderBy(desc(customers.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(customers).where(and(...conditions)),
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
      creditDays: r.creditDays,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
    })),
    page,
    pageSize,
    total: total[0]?.count ?? 0,
  };
}

export async function getCustomer(tenantId: string, id: string) {
  const [c] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId), isNull(customers.deletedAt)))
    .limit(1);
  if (!c) throw NotFound("customer_not_found", "Customer not found");
  return c;
}

export async function createCustomer(input: CustomerCreateInput, ctx: ActorContext) {
  const data = toRow(input);

  // GSTIN uniqueness within tenant
  if (typeof data.gstin === "string" && data.gstin) {
    const [existing] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.tenantId, ctx.tenantId),
          eq(customers.gstin, data.gstin),
          isNull(customers.deletedAt),
        ),
      )
      .limit(1);
    if (existing) {
      throw Conflict("gstin_exists", "A customer with this GSTIN already exists");
    }
  }

  const code = await nextCustomerCode(ctx.tenantId);

  const [created] = await db
    .insert(customers)
    .values({
      tenantId: ctx.tenantId,
      code,
      name: input.name,
      ...data,
    })
    .returning();

  if (!created) throw new Error("Failed to create customer");

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    action: "create",
    resourceType: "customer",
    resourceId: created.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    after: created as Record<string, unknown>,
  });

  return created;
}

export async function updateCustomer(id: string, input: CustomerUpdateInput, ctx: ActorContext) {
  const before = await getCustomer(ctx.tenantId, id);
  const data = toRow(input);

  const [updated] = await db
    .update(customers)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(customers.id, id), eq(customers.tenantId, ctx.tenantId)))
    .returning();

  if (!updated) throw NotFound("customer_not_found", "Customer not found");

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    action: "update",
    resourceType: "customer",
    resourceId: updated.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    before: before as Record<string, unknown>,
    after: updated as Record<string, unknown>,
  });

  return updated;
}

export async function deleteCustomer(id: string, ctx: ActorContext) {
  const before = await getCustomer(ctx.tenantId, id);

  await db
    .update(customers)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(customers.id, id), eq(customers.tenantId, ctx.tenantId)));

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    action: "delete",
    resourceType: "customer",
    resourceId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    before: before as Record<string, unknown>,
  });
}
