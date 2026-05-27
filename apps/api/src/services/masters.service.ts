import { eq, and, isNull, ilike, sql } from "drizzle-orm";
import { db } from "../db/index";
import { hsnCodes } from "../db/schema/hsn_codes";
import { uoms } from "../db/schema/uoms";
import { BadRequest, Forbidden, NotFound } from "../lib/errors";

interface ActorContext {
  tenantId: string;
  userId: string;
  isTenantAdmin: boolean;
}

/* ---------------- HSN codes ---------------- */

export async function listHsnCodes(tenantId: string, search?: string) {
  const conds = [eq(hsnCodes.tenantId, tenantId), isNull(hsnCodes.deletedAt)];
  if (search?.trim()) conds.push(ilike(hsnCodes.code, `${search.trim()}%`));
  return db
    .select({
      id: hsnCodes.id,
      code: hsnCodes.code,
      description: hsnCodes.description,
      defaultGstRate: hsnCodes.defaultGstRate,
    })
    .from(hsnCodes)
    .where(and(...conds))
    .orderBy(hsnCodes.code)
    .limit(200);
}

/**
 * Upsert by (tenant, code) — idempotent. Called from the PO form when a user
 * types a fresh HSN and checks "Save to master", and also from the Settings
 * admin page. Returns the row.
 */
export async function upsertHsnCode(
  ctx: ActorContext,
  input: { code: string; description?: string | null; defaultGstRate?: number | null },
) {
  const code = input.code.trim();
  if (!code) throw BadRequest("code_required", "HSN code is required");

  const [existing] = await db
    .select()
    .from(hsnCodes)
    .where(and(eq(hsnCodes.tenantId, ctx.tenantId), eq(hsnCodes.code, code), isNull(hsnCodes.deletedAt)))
    .limit(1);
  if (existing) {
    const patch: Partial<typeof existing> = {};
    if (input.description != null) patch.description = input.description.trim() || null;
    if (input.defaultGstRate != null) patch.defaultGstRate = input.defaultGstRate;
    if (Object.keys(patch).length) {
      await db.update(hsnCodes).set({ ...patch, updatedAt: new Date() }).where(eq(hsnCodes.id, existing.id));
    }
    return { ...existing, ...patch };
  }

  const [created] = await db
    .insert(hsnCodes)
    .values({
      tenantId: ctx.tenantId,
      code,
      description: input.description?.trim() || null,
      defaultGstRate: input.defaultGstRate ?? null,
    })
    .returning();
  return created!;
}

export async function deleteHsnCode(ctx: ActorContext, id: string) {
  if (!ctx.isTenantAdmin) throw Forbidden("admin_only", "Only tenant admins can remove HSN codes");
  await db
    .update(hsnCodes)
    .set({ deletedAt: new Date() })
    .where(and(eq(hsnCodes.tenantId, ctx.tenantId), eq(hsnCodes.id, id)));
}

/* ---------------- UoMs ---------------- */

export async function listUoms(tenantId: string) {
  return db
    .select({ id: uoms.id, code: uoms.code, name: uoms.name })
    .from(uoms)
    .where(and(eq(uoms.tenantId, tenantId), isNull(uoms.deletedAt)))
    .orderBy(uoms.code);
}

export async function upsertUom(ctx: ActorContext, input: { code: string; name?: string | null }) {
  const code = input.code.trim().toLowerCase();
  if (!code) throw BadRequest("code_required", "UoM code is required");
  const name = (input.name?.trim() || code);

  const [existing] = await db
    .select()
    .from(uoms)
    .where(and(eq(uoms.tenantId, ctx.tenantId), eq(uoms.code, code), isNull(uoms.deletedAt)))
    .limit(1);
  if (existing) {
    if (input.name && input.name.trim() !== existing.name) {
      await db.update(uoms).set({ name: input.name.trim(), updatedAt: new Date() }).where(eq(uoms.id, existing.id));
    }
    return existing;
  }
  const [created] = await db.insert(uoms).values({ tenantId: ctx.tenantId, code, name }).returning();
  return created!;
}

export async function deleteUom(ctx: ActorContext, id: string) {
  if (!ctx.isTenantAdmin) throw Forbidden("admin_only", "Only tenant admins can remove UoMs");
  await db
    .update(uoms)
    .set({ deletedAt: new Date() })
    .where(and(eq(uoms.tenantId, ctx.tenantId), eq(uoms.id, id)));
}

/**
 * Seed a tenant's UoM master with the common Indian-procurement units when
 * empty. Called once from the seed script + idempotent on subsequent runs.
 */
export const DEFAULT_UOMS = [
  { code: "nos",   name: "Numbers" },
  { code: "pcs",   name: "Pieces" },
  { code: "kg",    name: "Kilograms" },
  { code: "g",     name: "Grams" },
  { code: "mt",    name: "Metric Tonnes" },
  { code: "ltr",   name: "Litres" },
  { code: "ml",    name: "Millilitres" },
  { code: "mtr",   name: "Metres" },
  { code: "cm",    name: "Centimetres" },
  { code: "ft",    name: "Feet" },
  { code: "inch",  name: "Inches" },
  { code: "sqm",   name: "Square Metres" },
  { code: "sqft",  name: "Square Feet" },
  { code: "box",   name: "Boxes" },
  { code: "pkt",   name: "Packets" },
  { code: "set",   name: "Sets" },
  { code: "roll",  name: "Rolls" },
  { code: "drum",  name: "Drums" },
  { code: "bag",   name: "Bags" },
  { code: "pair",  name: "Pairs" },
] as const;

export async function ensureDefaultUoms(tenantId: string) {
  const existing = await db
    .select({ code: uoms.code })
    .from(uoms)
    .where(and(eq(uoms.tenantId, tenantId), isNull(uoms.deletedAt)));
  const have = new Set(existing.map((r) => r.code));
  const missing = DEFAULT_UOMS.filter((u) => !have.has(u.code));
  if (missing.length === 0) return;
  await db.insert(uoms).values(missing.map((u) => ({ tenantId, code: u.code, name: u.name })));
}
