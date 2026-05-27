import { eq, and, isNull, ilike, asc } from "drizzle-orm";
import { db } from "../db/index";
import { hsnCodes } from "../db/schema/hsn_codes";
import { uoms } from "../db/schema/uoms";
import { paymentTerms } from "../db/schema/payment_terms";
import { deliveryTerms } from "../db/schema/delivery_terms";
import { cancellationReasons } from "../db/schema/cancellation_reasons";
import { itemGroups } from "../db/schema/item_groups";
import { itemSubGroups } from "../db/schema/item_sub_groups";
import { itemCategories } from "../db/schema/item_categories";
import { brands } from "../db/schema/brands";
import { costCenters } from "../db/schema/cost_centers";
import { BadRequest, Forbidden } from "../lib/errors";

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

/* ---------------- Payment Terms ---------------- */

const DEFAULT_PAYMENT_TERMS = [
  "Net 7 days",
  "Net 15 days",
  "Net 30 days",
  "Net 45 days",
  "Net 60 days",
  "Net 90 days",
  "50% advance + 50% on delivery",
  "100% advance",
  "100% on delivery",
  "Against proforma invoice",
  "LC at sight",
];

export async function ensureDefaultPaymentTerms(tenantId: string) {
  const existing = await db
    .select({ id: paymentTerms.id })
    .from(paymentTerms)
    .where(and(eq(paymentTerms.tenantId, tenantId), isNull(paymentTerms.deletedAt)))
    .limit(1);
  if (existing.length) return;
  await db.insert(paymentTerms).values(
    DEFAULT_PAYMENT_TERMS.map((label, idx) => ({ tenantId, label, sortOrder: idx })),
  );
}

export async function listPaymentTerms(tenantId: string) {
  return db
    .select({ id: paymentTerms.id, label: paymentTerms.label, isActive: paymentTerms.isActive, sortOrder: paymentTerms.sortOrder })
    .from(paymentTerms)
    .where(and(eq(paymentTerms.tenantId, tenantId), isNull(paymentTerms.deletedAt)))
    .orderBy(asc(paymentTerms.sortOrder), asc(paymentTerms.label));
}

export async function upsertPaymentTerm(ctx: ActorContext, input: { id?: string; label: string; isActive?: boolean }) {
  const label = input.label.trim();
  if (!label) throw BadRequest("label_required", "Label is required");
  if (input.id) {
    await db.update(paymentTerms)
      .set({ label, isActive: input.isActive ?? true, updatedAt: new Date() })
      .where(and(eq(paymentTerms.tenantId, ctx.tenantId), eq(paymentTerms.id, input.id)));
    return { id: input.id, label, isActive: input.isActive ?? true };
  }
  const [created] = await db.insert(paymentTerms)
    .values({ tenantId: ctx.tenantId, label, isActive: input.isActive ?? true })
    .returning();
  return created!;
}

export async function deletePaymentTerm(ctx: ActorContext, id: string) {
  if (!ctx.isTenantAdmin) throw Forbidden("admin_only", "Only tenant admins can remove payment terms");
  await db.update(paymentTerms)
    .set({ deletedAt: new Date() })
    .where(and(eq(paymentTerms.tenantId, ctx.tenantId), eq(paymentTerms.id, id)));
}

/* ---------------- Delivery Terms (F.O.R.) ---------------- */

const DEFAULT_DELIVERY_TERMS: Array<{ code: string; label: string }> = [
  { code: "ex_works",         label: "Ex Works" },
  { code: "for_plant",        label: "FOR Plant / Site" },
  { code: "cif",              label: "CIF (Cost + Insurance + Freight)" },
  { code: "annexure",         label: "Annexure" },
  { code: "upto_destination", label: "Upto Destination" },
];

export async function ensureDefaultDeliveryTerms(tenantId: string) {
  const existing = await db
    .select({ id: deliveryTerms.id })
    .from(deliveryTerms)
    .where(and(eq(deliveryTerms.tenantId, tenantId), isNull(deliveryTerms.deletedAt)))
    .limit(1);
  if (existing.length) return;
  await db.insert(deliveryTerms).values(
    DEFAULT_DELIVERY_TERMS.map((d, idx) => ({ tenantId, code: d.code, label: d.label, sortOrder: idx })),
  );
}

export async function listDeliveryTerms(tenantId: string) {
  return db
    .select({ id: deliveryTerms.id, code: deliveryTerms.code, label: deliveryTerms.label, isActive: deliveryTerms.isActive })
    .from(deliveryTerms)
    .where(and(eq(deliveryTerms.tenantId, tenantId), isNull(deliveryTerms.deletedAt)))
    .orderBy(asc(deliveryTerms.sortOrder), asc(deliveryTerms.label));
}

export async function upsertDeliveryTerm(ctx: ActorContext, input: { id?: string; code: string; label: string; isActive?: boolean }) {
  const code = input.code.trim().toLowerCase().replace(/\s+/g, "_");
  const label = input.label.trim();
  if (!code || !label) throw BadRequest("required", "Code and label are required");
  if (input.id) {
    await db.update(deliveryTerms)
      .set({ code, label, isActive: input.isActive ?? true, updatedAt: new Date() })
      .where(and(eq(deliveryTerms.tenantId, ctx.tenantId), eq(deliveryTerms.id, input.id)));
    return { id: input.id, code, label, isActive: input.isActive ?? true };
  }
  const [created] = await db.insert(deliveryTerms)
    .values({ tenantId: ctx.tenantId, code, label, isActive: input.isActive ?? true })
    .returning();
  return created!;
}

export async function deleteDeliveryTerm(ctx: ActorContext, id: string) {
  if (!ctx.isTenantAdmin) throw Forbidden("admin_only", "Only tenant admins can remove delivery terms");
  await db.update(deliveryTerms)
    .set({ deletedAt: new Date() })
    .where(and(eq(deliveryTerms.tenantId, ctx.tenantId), eq(deliveryTerms.id, id)));
}

/* ---------------- Cancellation Reasons ---------------- */

const DEFAULT_CANCEL_REASONS = [
  "Vendor unable to supply",
  "Better price found",
  "Internal requirement changed",
  "Item obsolete / discontinued",
  "Duplicate PO",
  "Approver rejected",
  "Other",
];

export async function ensureDefaultCancelReasons(tenantId: string) {
  const existing = await db
    .select({ id: cancellationReasons.id })
    .from(cancellationReasons)
    .where(and(eq(cancellationReasons.tenantId, tenantId), isNull(cancellationReasons.deletedAt)))
    .limit(1);
  if (existing.length) return;
  await db.insert(cancellationReasons).values(
    DEFAULT_CANCEL_REASONS.map((label, idx) => ({ tenantId, label, sortOrder: idx })),
  );
}

export async function listCancelReasons(tenantId: string) {
  return db
    .select({ id: cancellationReasons.id, label: cancellationReasons.label, isActive: cancellationReasons.isActive })
    .from(cancellationReasons)
    .where(and(eq(cancellationReasons.tenantId, tenantId), isNull(cancellationReasons.deletedAt)))
    .orderBy(asc(cancellationReasons.sortOrder), asc(cancellationReasons.label));
}

export async function upsertCancelReason(ctx: ActorContext, input: { id?: string; label: string; isActive?: boolean }) {
  const label = input.label.trim();
  if (!label) throw BadRequest("label_required", "Label is required");
  if (input.id) {
    await db.update(cancellationReasons)
      .set({ label, isActive: input.isActive ?? true, updatedAt: new Date() })
      .where(and(eq(cancellationReasons.tenantId, ctx.tenantId), eq(cancellationReasons.id, input.id)));
    return { id: input.id, label, isActive: input.isActive ?? true };
  }
  const [created] = await db.insert(cancellationReasons)
    .values({ tenantId: ctx.tenantId, label, isActive: input.isActive ?? true })
    .returning();
  return created!;
}

export async function deleteCancelReason(ctx: ActorContext, id: string) {
  if (!ctx.isTenantAdmin) throw Forbidden("admin_only", "Only tenant admins can remove reasons");
  await db.update(cancellationReasons)
    .set({ deletedAt: new Date() })
    .where(and(eq(cancellationReasons.tenantId, ctx.tenantId), eq(cancellationReasons.id, id)));
}

/* ---------------- Item Groups ---------------- */

export async function listItemGroups(tenantId: string) {
  return db
    .select({ id: itemGroups.id, code: itemGroups.code, name: itemGroups.name, isActive: itemGroups.isActive })
    .from(itemGroups)
    .where(and(eq(itemGroups.tenantId, tenantId), isNull(itemGroups.deletedAt)))
    .orderBy(asc(itemGroups.name));
}

export async function upsertItemGroup(ctx: ActorContext, input: { id?: string; code?: string | null; name: string; isActive?: boolean }) {
  const name = input.name.trim();
  if (!name) throw BadRequest("name_required", "Name is required");
  const code = input.code?.trim() || null;
  if (input.id) {
    await db.update(itemGroups)
      .set({ code, name, isActive: input.isActive ?? true, updatedAt: new Date() })
      .where(and(eq(itemGroups.tenantId, ctx.tenantId), eq(itemGroups.id, input.id)));
    return { id: input.id, code, name, isActive: input.isActive ?? true };
  }
  const [created] = await db.insert(itemGroups)
    .values({ tenantId: ctx.tenantId, code, name, isActive: input.isActive ?? true })
    .returning();
  return created!;
}

export async function deleteItemGroup(ctx: ActorContext, id: string) {
  if (!ctx.isTenantAdmin) throw Forbidden("admin_only", "Only tenant admins can remove item groups");
  await db.update(itemGroups)
    .set({ deletedAt: new Date() })
    .where(and(eq(itemGroups.tenantId, ctx.tenantId), eq(itemGroups.id, id)));
}

/* ---------------- Item Sub-Groups ---------------- */

export async function listItemSubGroups(tenantId: string) {
  return db
    .select({
      id: itemSubGroups.id,
      groupId: itemSubGroups.groupId,
      code: itemSubGroups.code,
      name: itemSubGroups.name,
      isActive: itemSubGroups.isActive,
    })
    .from(itemSubGroups)
    .where(and(eq(itemSubGroups.tenantId, tenantId), isNull(itemSubGroups.deletedAt)))
    .orderBy(asc(itemSubGroups.name));
}

export async function upsertItemSubGroup(
  ctx: ActorContext,
  input: { id?: string; groupId?: string | null; code?: string | null; name: string; isActive?: boolean },
) {
  const name = input.name.trim();
  if (!name) throw BadRequest("name_required", "Name is required");
  const code = input.code?.trim() || null;
  const groupId = input.groupId || null;
  if (input.id) {
    await db.update(itemSubGroups)
      .set({ groupId, code, name, isActive: input.isActive ?? true, updatedAt: new Date() })
      .where(and(eq(itemSubGroups.tenantId, ctx.tenantId), eq(itemSubGroups.id, input.id)));
    return { id: input.id, groupId, code, name, isActive: input.isActive ?? true };
  }
  const [created] = await db.insert(itemSubGroups)
    .values({ tenantId: ctx.tenantId, groupId, code, name, isActive: input.isActive ?? true })
    .returning();
  return created!;
}

export async function deleteItemSubGroup(ctx: ActorContext, id: string) {
  if (!ctx.isTenantAdmin) throw Forbidden("admin_only", "Only tenant admins can remove sub-groups");
  await db.update(itemSubGroups)
    .set({ deletedAt: new Date() })
    .where(and(eq(itemSubGroups.tenantId, ctx.tenantId), eq(itemSubGroups.id, id)));
}

/* ---------------- Item Categories ---------------- */

export async function listItemCategories(tenantId: string) {
  return db
    .select({ id: itemCategories.id, code: itemCategories.code, name: itemCategories.name, isActive: itemCategories.isActive })
    .from(itemCategories)
    .where(and(eq(itemCategories.tenantId, tenantId), isNull(itemCategories.deletedAt)))
    .orderBy(asc(itemCategories.name));
}

export async function upsertItemCategory(ctx: ActorContext, input: { id?: string; code?: string | null; name: string; isActive?: boolean }) {
  const name = input.name.trim();
  if (!name) throw BadRequest("name_required", "Name is required");
  const code = input.code?.trim() || null;
  if (input.id) {
    await db.update(itemCategories)
      .set({ code, name, isActive: input.isActive ?? true, updatedAt: new Date() })
      .where(and(eq(itemCategories.tenantId, ctx.tenantId), eq(itemCategories.id, input.id)));
    return { id: input.id, code, name, isActive: input.isActive ?? true };
  }
  const [created] = await db.insert(itemCategories)
    .values({ tenantId: ctx.tenantId, code, name, isActive: input.isActive ?? true })
    .returning();
  return created!;
}

export async function deleteItemCategory(ctx: ActorContext, id: string) {
  if (!ctx.isTenantAdmin) throw Forbidden("admin_only", "Only tenant admins can remove categories");
  await db.update(itemCategories)
    .set({ deletedAt: new Date() })
    .where(and(eq(itemCategories.tenantId, ctx.tenantId), eq(itemCategories.id, id)));
}

/* ---------------- Brands ---------------- */

export async function listBrands(tenantId: string) {
  return db
    .select({ id: brands.id, name: brands.name, isActive: brands.isActive })
    .from(brands)
    .where(and(eq(brands.tenantId, tenantId), isNull(brands.deletedAt)))
    .orderBy(asc(brands.name));
}

export async function upsertBrand(ctx: ActorContext, input: { id?: string; name: string; isActive?: boolean }) {
  const name = input.name.trim();
  if (!name) throw BadRequest("name_required", "Name is required");
  if (input.id) {
    await db.update(brands)
      .set({ name, isActive: input.isActive ?? true, updatedAt: new Date() })
      .where(and(eq(brands.tenantId, ctx.tenantId), eq(brands.id, input.id)));
    return { id: input.id, name, isActive: input.isActive ?? true };
  }
  const [created] = await db.insert(brands)
    .values({ tenantId: ctx.tenantId, name, isActive: input.isActive ?? true })
    .returning();
  return created!;
}

export async function deleteBrand(ctx: ActorContext, id: string) {
  if (!ctx.isTenantAdmin) throw Forbidden("admin_only", "Only tenant admins can remove brands");
  await db.update(brands)
    .set({ deletedAt: new Date() })
    .where(and(eq(brands.tenantId, ctx.tenantId), eq(brands.id, id)));
}

/* ---------------- Cost Centres ---------------- */

export async function listCostCenters(tenantId: string) {
  return db
    .select({ id: costCenters.id, code: costCenters.code, name: costCenters.name, isActive: costCenters.isActive })
    .from(costCenters)
    .where(and(eq(costCenters.tenantId, tenantId), isNull(costCenters.deletedAt)))
    .orderBy(asc(costCenters.name));
}

export async function upsertCostCenter(ctx: ActorContext, input: { id?: string; code?: string | null; name: string; isActive?: boolean }) {
  const name = input.name.trim();
  if (!name) throw BadRequest("name_required", "Name is required");
  const code = input.code?.trim() || null;
  if (input.id) {
    await db.update(costCenters)
      .set({ code, name, isActive: input.isActive ?? true, updatedAt: new Date() })
      .where(and(eq(costCenters.tenantId, ctx.tenantId), eq(costCenters.id, input.id)));
    return { id: input.id, code, name, isActive: input.isActive ?? true };
  }
  const [created] = await db.insert(costCenters)
    .values({ tenantId: ctx.tenantId, code, name, isActive: input.isActive ?? true })
    .returning();
  return created!;
}

export async function deleteCostCenter(ctx: ActorContext, id: string) {
  if (!ctx.isTenantAdmin) throw Forbidden("admin_only", "Only tenant admins can remove cost centres");
  await db.update(costCenters)
    .set({ deletedAt: new Date() })
    .where(and(eq(costCenters.tenantId, ctx.tenantId), eq(costCenters.id, id)));
}
