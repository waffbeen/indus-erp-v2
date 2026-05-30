import { eq, and, isNull, sql, inArray } from "drizzle-orm";
import { db } from "../db/index";
import { stockMovements } from "../db/schema/stock";
import { itemStockPolicy } from "../db/schema/item_stock_policy";
import { items } from "../db/schema/items";
import { units } from "../db/schema/units";

/**
 * Reorder board. For every active item-stock-policy we compare the live
 * on-hand (summed from the ledger per item+unit) against the policy's reorder
 * level. Items at/below the level surface here with a suggested order qty that
 * tops them back up to the target (max level, or the reorder level if no max
 * is set).
 *
 * NOTE: this service never creates PRs — it only returns suggestions. The
 * "Create PR" button on the frontend navigates to /pr/new prefilled with the
 * item + qty. PR creation is owned elsewhere.
 */

export interface ReorderSuggestion {
  itemId: string;
  itemName: string;
  itemCode: string | null;
  itemGroupName: string | null;
  unitId: string;
  unitName: string;
  uom: string;
  onHandQty: number;
  reorderLevel: number;
  minQty: number;
  maxQty: number;
  safetyStock: number;
  leadTimeDays: number;
  /** How far below the reorder level we are (>= 0). */
  shortfallQty: number;
  /** Suggested qty to order to reach the target level. */
  suggestedQty: number;
  lastPurchasePricePaise: string | null;
}

export async function getReorderSuggestions(
  tenantId: string,
  opts: { unitId?: string } = {},
) {
  // Active policies define which item+unit pairs we monitor.
  const policyConds = [
    eq(itemStockPolicy.tenantId, tenantId),
    isNull(itemStockPolicy.deletedAt),
    eq(itemStockPolicy.isActive, true),
  ];
  if (opts.unitId) policyConds.push(eq(itemStockPolicy.unitId, opts.unitId));

  const policies = await db
    .select()
    .from(itemStockPolicy)
    .where(and(...policyConds));

  if (policies.length === 0) return { suggestions: [] as ReorderSuggestion[], monitored: 0 };

  // On-hand per item+unit straight from the ledger.
  const ledgerConds = [eq(stockMovements.tenantId, tenantId)];
  if (opts.unitId) ledgerConds.push(eq(stockMovements.unitId, opts.unitId));
  const onHandRows = await db
    .select({
      itemId: stockMovements.itemId,
      unitId: stockMovements.unitId,
      uom: sql<string>`MAX(${stockMovements.uom})`.as("uom"),
      qtyScaled: sql<number>`SUM(${stockMovements.qtyScaled})::bigint`.as("qty_scaled"),
    })
    .from(stockMovements)
    .where(and(...ledgerConds))
    .groupBy(stockMovements.itemId, stockMovements.unitId);

  const onHandMap = new Map<string, { qtyScaled: number; uom: string }>();
  for (const r of onHandRows) {
    onHandMap.set(`${r.itemId}__${r.unitId}`, { qtyScaled: Number(r.qtyScaled), uom: r.uom });
  }

  // Enrich item + unit names.
  const itemIds = Array.from(new Set(policies.map((p) => p.itemId)));
  const unitIds = Array.from(new Set(policies.map((p) => p.unitId)));
  const [itemRows, unitRows] = await Promise.all([
    db
      .select({
        id: items.id,
        name: items.name,
        code: items.code,
        uom: items.uom,
        itemGroupName: items.itemGroupName,
        lastPurchasePricePaise: items.lastPurchasePricePaise,
      })
      .from(items)
      .where(inArray(items.id, itemIds)),
    db.select({ id: units.id, name: units.name }).from(units).where(inArray(units.id, unitIds)),
  ]);
  const itemMap = new Map(itemRows.map((i) => [i.id, i]));
  const unitMap = new Map(unitRows.map((u) => [u.id, u]));

  const suggestions: ReorderSuggestion[] = [];
  for (const p of policies) {
    const onHand = onHandMap.get(`${p.itemId}__${p.unitId}`);
    const onHandScaled = onHand?.qtyScaled ?? 0;

    // Only flag items that are at or below the reorder level.
    if (onHandScaled > p.reorderLevelScaled) continue;

    const targetScaled = p.maxQtyScaled > 0 ? p.maxQtyScaled : p.reorderLevelScaled;
    const suggestedScaled = Math.max(targetScaled - onHandScaled, 0);
    const shortfallScaled = Math.max(p.reorderLevelScaled - onHandScaled, 0);

    const it = itemMap.get(p.itemId);
    suggestions.push({
      itemId: p.itemId,
      itemName: it?.name ?? "—",
      itemCode: it?.code ?? null,
      itemGroupName: it?.itemGroupName ?? null,
      unitId: p.unitId,
      unitName: unitMap.get(p.unitId)?.name ?? "—",
      uom: onHand?.uom ?? it?.uom ?? "nos",
      onHandQty: onHandScaled / 1000,
      reorderLevel: p.reorderLevelScaled / 1000,
      minQty: p.minQtyScaled / 1000,
      maxQty: p.maxQtyScaled / 1000,
      safetyStock: p.safetyStockScaled / 1000,
      leadTimeDays: p.leadTimeDays,
      shortfallQty: shortfallScaled / 1000,
      suggestedQty: suggestedScaled / 1000,
      lastPurchasePricePaise: it?.lastPurchasePricePaise ?? null,
    });
  }

  // Most urgent (biggest shortfall) first.
  suggestions.sort((a, b) => b.shortfallQty - a.shortfallQty);

  return { suggestions, monitored: policies.length };
}

/* ---------------- Policy CRUD (drives the reorder board) ---------------- */

interface ActorContext {
  tenantId: string;
  userId: string;
  isTenantAdmin: boolean;
}

export async function listStockPolicies(tenantId: string, opts: { unitId?: string; itemId?: string } = {}) {
  const conds = [eq(itemStockPolicy.tenantId, tenantId), isNull(itemStockPolicy.deletedAt)];
  if (opts.unitId) conds.push(eq(itemStockPolicy.unitId, opts.unitId));
  if (opts.itemId) conds.push(eq(itemStockPolicy.itemId, opts.itemId));

  const rows = await db
    .select({
      id: itemStockPolicy.id,
      itemId: itemStockPolicy.itemId,
      itemName: items.name,
      itemCode: items.code,
      unitId: itemStockPolicy.unitId,
      unitName: units.name,
      minQtyScaled: itemStockPolicy.minQtyScaled,
      maxQtyScaled: itemStockPolicy.maxQtyScaled,
      reorderLevelScaled: itemStockPolicy.reorderLevelScaled,
      safetyStockScaled: itemStockPolicy.safetyStockScaled,
      leadTimeDays: itemStockPolicy.leadTimeDays,
      isActive: itemStockPolicy.isActive,
    })
    .from(itemStockPolicy)
    .leftJoin(items, eq(itemStockPolicy.itemId, items.id))
    .leftJoin(units, eq(itemStockPolicy.unitId, units.id))
    .where(and(...conds));

  return rows.map((r) => ({
    id: r.id,
    itemId: r.itemId,
    itemName: r.itemName ?? "—",
    itemCode: r.itemCode ?? null,
    unitId: r.unitId,
    unitName: r.unitName ?? "—",
    minQty: r.minQtyScaled / 1000,
    maxQty: r.maxQtyScaled / 1000,
    reorderLevel: r.reorderLevelScaled / 1000,
    safetyStock: r.safetyStockScaled / 1000,
    leadTimeDays: r.leadTimeDays,
    isActive: r.isActive,
  }));
}

interface PolicyUpsertInput {
  id?: string;
  itemId: string;
  unitId: string;
  minQty: number;
  maxQty: number;
  reorderLevel: number;
  safetyStock: number;
  leadTimeDays: number;
  isActive?: boolean;
}

const scale = (n: number) => Math.round((n ?? 0) * 1000);

export async function upsertStockPolicy(ctx: ActorContext, input: PolicyUpsertInput) {
  const values = {
    minQtyScaled: scale(input.minQty),
    maxQtyScaled: scale(input.maxQty),
    reorderLevelScaled: scale(input.reorderLevel),
    safetyStockScaled: scale(input.safetyStock),
    leadTimeDays: Math.round(input.leadTimeDays ?? 0),
    isActive: input.isActive ?? true,
  };

  if (input.id) {
    const [updated] = await db
      .update(itemStockPolicy)
      .set({ ...values, itemId: input.itemId, unitId: input.unitId, updatedAt: new Date() })
      .where(and(eq(itemStockPolicy.tenantId, ctx.tenantId), eq(itemStockPolicy.id, input.id)))
      .returning();
    return updated!;
  }

  // One policy per item+unit — update the existing (even if soft-deleted) instead
  // of creating a duplicate.
  const [existing] = await db
    .select()
    .from(itemStockPolicy)
    .where(
      and(
        eq(itemStockPolicy.tenantId, ctx.tenantId),
        eq(itemStockPolicy.itemId, input.itemId),
        eq(itemStockPolicy.unitId, input.unitId),
      ),
    )
    .limit(1);
  if (existing) {
    const [updated] = await db
      .update(itemStockPolicy)
      .set({ ...values, deletedAt: null, updatedAt: new Date() })
      .where(eq(itemStockPolicy.id, existing.id))
      .returning();
    return updated!;
  }

  const [created] = await db
    .insert(itemStockPolicy)
    .values({ tenantId: ctx.tenantId, itemId: input.itemId, unitId: input.unitId, ...values })
    .returning();
  return created!;
}

export async function deleteStockPolicy(ctx: ActorContext, id: string) {
  await db
    .update(itemStockPolicy)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(itemStockPolicy.tenantId, ctx.tenantId), eq(itemStockPolicy.id, id)));
}
