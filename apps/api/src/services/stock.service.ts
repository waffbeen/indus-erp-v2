import { eq, and, isNull, desc, sql, ilike, inArray } from "drizzle-orm";
import { db, type DB } from "../db/index";
import { stockMovements } from "../db/schema/stock";
import { items } from "../db/schema/items";
import { units } from "../db/schema/units";
import { users } from "../db/schema/users";
import { auditLogs } from "../db/schema/audit_logs";
import { BadRequest, NotFound } from "../lib/errors";

/**
 * A DB handle that is either the root connection or an open transaction, so
 * callers (e.g. GRN create/cancel) can run these movement writes inside their
 * own transaction and have them commit/roll back atomically with the receipt.
 */
type Executor = DB | Parameters<Parameters<DB["transaction"]>[0]>[0];

interface ActorContext {
  tenantId: string;
  userId: string;
  isTenantAdmin: boolean;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Roll up the running ledger into one row per (item, unit) — current on-hand.
 * Items with zero movements OR movements that net to zero are still returned
 * when explicitly searched, so a warehouse manager can see "we had 100, now
 * we have 0" rather than the row disappearing.
 */
export async function getStockByItem(
  tenantId: string,
  opts: { search?: string; unitId?: string; itemGroup?: string; nonZeroOnly?: boolean } = {},
) {
  const conds = [eq(stockMovements.tenantId, tenantId)];
  if (opts.unitId) conds.push(eq(stockMovements.unitId, opts.unitId));

  // First grouped query — sum qty by item + unit
  const rows = await db
    .select({
      itemId: stockMovements.itemId,
      unitId: stockMovements.unitId,
      uom: stockMovements.uom,
      qtyScaled: sql<number>`SUM(${stockMovements.qtyScaled})::bigint`.as("qty_scaled"),
      lastMovementAt: sql<Date>`MAX(${stockMovements.createdAt})`.as("last_movement_at"),
      lineCount: sql<number>`COUNT(*)::int`.as("line_count"),
    })
    .from(stockMovements)
    .where(and(...conds))
    .groupBy(stockMovements.itemId, stockMovements.unitId, stockMovements.uom);

  if (rows.length === 0) return [];

  // Enrich with item + unit names (single JOIN-less fetch keeps it parallelisable)
  const itemIds = Array.from(new Set(rows.map((r) => r.itemId)));
  const unitIds = Array.from(new Set(rows.map((r) => r.unitId)));
  const [itemRows, unitRows] = await Promise.all([
    db
      .select({
        id: items.id,
        name: items.name,
        code: items.code,
        itemGroupName: items.itemGroupName,
        itemSubGroupName: items.itemSubGroupName,
        hsnCode: items.hsnCode,
      })
      .from(items)
      .where(inArray(items.id, itemIds)),
    db
      .select({ id: units.id, name: units.name, code: units.code })
      .from(units)
      .where(inArray(units.id, unitIds)),
  ]);
  const itemMap = new Map(itemRows.map((i) => [i.id, i]));
  const unitMap = new Map(unitRows.map((u) => [u.id, u]));

  // Filter post-join so we can still match on name/code/group
  const search = opts.search?.trim().toLowerCase();
  const group = opts.itemGroup?.trim().toLowerCase();

  let result = rows
    .map((r) => {
      const it = itemMap.get(r.itemId);
      const un = unitMap.get(r.unitId);
      return {
        itemId: r.itemId,
        unitId: r.unitId,
        itemName: it?.name ?? "—",
        itemCode: it?.code ?? null,
        itemGroupName: it?.itemGroupName ?? null,
        itemSubGroupName: it?.itemSubGroupName ?? null,
        hsnCode: it?.hsnCode ?? null,
        unitName: un?.name ?? "—",
        unitCode: un?.code ?? null,
        uom: r.uom,
        qty: Number(r.qtyScaled) / 1000,
        lineCount: r.lineCount,
        lastMovementAt: r.lastMovementAt ? new Date(r.lastMovementAt).toISOString() : null,
      };
    })
    .filter((r) => {
      if (opts.nonZeroOnly && r.qty === 0) return false;
      if (search && !`${r.itemName} ${r.itemCode ?? ""}`.toLowerCase().includes(search)) return false;
      if (group && (r.itemGroupName ?? "").toLowerCase() !== group) return false;
      return true;
    });

  // Sort highest qty first so warehouses with stock float to the top
  result.sort((a, b) => b.qty - a.qty);
  return result;
}

/**
 * Movement-by-movement ledger for one item. Optionally scoped to a single warehouse.
 */
export async function getItemLedger(
  tenantId: string,
  itemId: string,
  opts: { unitId?: string } = {},
) {
  const [item] = await db.select().from(items).where(and(eq(items.id, itemId), eq(items.tenantId, tenantId))).limit(1);
  if (!item) throw NotFound("item_not_found", "Item not found");

  const conds = [eq(stockMovements.tenantId, tenantId), eq(stockMovements.itemId, itemId)];
  if (opts.unitId) conds.push(eq(stockMovements.unitId, opts.unitId));

  const rows = await db
    .select({
      mov: stockMovements,
      unitName: units.name,
      actorName: users.fullName,
    })
    .from(stockMovements)
    .leftJoin(units, eq(stockMovements.unitId, units.id))
    .leftJoin(users, eq(stockMovements.createdByUserId, users.id))
    .where(and(...conds))
    .orderBy(desc(stockMovements.createdAt));

  // Compute running balance per unit so the UI can show "balance after this row"
  // Drizzle doesn't give us window functions for free; do it in code.
  // Sort ascending for running balance, then reverse to display newest first.
  const ascending = [...rows].sort((a, b) => a.mov.createdAt.getTime() - b.mov.createdAt.getTime());
  const balanceByUnit = new Map<string, number>();
  const withBalance = ascending.map((r) => {
    const k = r.mov.unitId;
    const next = (balanceByUnit.get(k) ?? 0) + r.mov.qtyScaled;
    balanceByUnit.set(k, next);
    return { ...r, runningBalanceScaled: next };
  });

  return {
    item: {
      id: item.id,
      name: item.name,
      code: item.code,
      itemGroupName: item.itemGroupName,
      itemSubGroupName: item.itemSubGroupName,
      hsnCode: item.hsnCode,
      uom: item.uom,
    },
    movements: [...withBalance].reverse().map((r) => ({
      id: r.mov.id,
      sourceType: r.mov.sourceType,
      sourceId: r.mov.sourceId,
      sourceRef: r.mov.sourceRef,
      unitId: r.mov.unitId,
      unitName: r.unitName ?? "—",
      qty: r.mov.qtyScaled / 1000,
      uom: r.mov.uom,
      unitPricePaise: r.mov.unitPricePaise,
      batchNumber: r.mov.batchNumber,
      mfgDate: r.mov.mfgDate ? r.mov.mfgDate.toISOString() : null,
      expiryDate: r.mov.expiryDate ? r.mov.expiryDate.toISOString() : null,
      remarks: r.mov.remarks,
      runningBalance: r.runningBalanceScaled / 1000,
      actorName: r.actorName ?? "Unknown",
      createdAt: r.mov.createdAt.toISOString(),
    })),
  };
}

interface MovementInput {
  companyId: string;
  unitId: string;
  itemId: string;
  qty: number; // positive — service prefixes sign based on kind
  uom: string;
  unitPrice?: number; // rupees, optional (defaults to last known)
  batchNumber?: string | null;
  mfgDate?: string | null;
  expiryDate?: string | null;
  remarks?: string | null;
}

/** Issue stock (negative movement). */
export async function issueStock(input: MovementInput, ctx: ActorContext) {
  return createMovement(input, "issue", -1, ctx);
}

/** Adjust stock (positive or negative depending on input.qty sign). */
export async function adjustStock(input: MovementInput & { direction: "in" | "out" }, ctx: ActorContext) {
  return createMovement(input, "adjustment", input.direction === "in" ? 1 : -1, ctx);
}

/** Internal: insert a movement row + audit log. */
async function createMovement(
  input: MovementInput,
  sourceType: "issue" | "adjustment",
  sign: 1 | -1,
  ctx: ActorContext,
) {
  if (input.qty <= 0) throw BadRequest("invalid_qty", "Quantity must be greater than zero — direction is set separately");

  const qtyScaled = Math.round(input.qty * 1000) * sign;
  const unitPaise = Math.round((input.unitPrice ?? 0) * 100);

  const [created] = await db
    .insert(stockMovements)
    .values({
      tenantId: ctx.tenantId,
      companyId: input.companyId,
      unitId: input.unitId,
      itemId: input.itemId,
      sourceType,
      sourceId: null,
      sourceRef: null,
      qtyScaled,
      uom: input.uom,
      unitPricePaise: unitPaise.toString(),
      batchNumber: input.batchNumber?.trim() || null,
      mfgDate: input.mfgDate ? new Date(input.mfgDate) : null,
      expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
      remarks: input.remarks ?? null,
      createdByUserId: ctx.userId,
    })
    .returning();

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: sourceType,
    resourceType: "stock_movement",
    resourceId: created!.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    after: { itemId: input.itemId, qtyScaled, sourceType } as Record<string, unknown>,
  });

  return created;
}

/**
 * Bulk insert movements from a GRN — called from grn.service after the GRN
 * is created. Each accepted line becomes one positive movement (per batch
 * if batchMode is on). Rejected qty doesn't enter stock.
 */
export async function recordGrnAcceptances(
  tenantId: string,
  grnId: string,
  grnNumber: string | null,
  companyId: string,
  unitId: string,
  createdByUserId: string,
  lines: Array<{
    itemId?: string | null;
    uom: string;
    acceptedQuantity: number;
    unitPrice: number;
    batchNumber?: string | null;
    mfgDate?: string | null;
    expiryDate?: string | null;
  }>,
  exec: Executor = db,
) {
  // Skip lines without an item id (free-text receipts can't increment stock).
  const inserts = lines
    .filter((l) => l.itemId && l.acceptedQuantity > 0)
    .map((l) => ({
      tenantId,
      companyId,
      unitId,
      itemId: l.itemId!,
      sourceType: "grn",
      sourceId: grnId,
      sourceRef: grnNumber,
      qtyScaled: Math.round(l.acceptedQuantity * 1000),
      uom: l.uom,
      unitPricePaise: Math.round((l.unitPrice ?? 0) * 100).toString(),
      batchNumber: l.batchNumber?.trim() || null,
      mfgDate: l.mfgDate ? new Date(l.mfgDate) : null,
      expiryDate: l.expiryDate ? new Date(l.expiryDate) : null,
      remarks: null as string | null,
      createdByUserId,
    }));
  if (inserts.length === 0) return;
  await exec.insert(stockMovements).values(inserts);
}

/**
 * Reverse the movements created by a previously-accepted GRN. Used when a GRN
 * is cancelled — we insert inverse rows (sourceType "grn_reversal") so the
 * ledger stays append-only and the on-hand qty drops back.
 */
export async function reverseGrnMovements(
  tenantId: string,
  grnId: string,
  actorUserId: string,
  exec: Executor = db,
) {
  const originals = await exec
    .select()
    .from(stockMovements)
    .where(and(eq(stockMovements.tenantId, tenantId), eq(stockMovements.sourceId, grnId), eq(stockMovements.sourceType, "grn")));
  if (originals.length === 0) return;

  await exec.insert(stockMovements).values(
    originals.map((m) => ({
      tenantId: m.tenantId,
      companyId: m.companyId,
      unitId: m.unitId,
      itemId: m.itemId,
      sourceType: "grn_reversal",
      sourceId: m.id, // points back at the original row that's being reversed
      sourceRef: m.sourceRef ? `Reversal of ${m.sourceRef}` : "GRN reversal",
      qtyScaled: -m.qtyScaled,
      uom: m.uom,
      unitPricePaise: m.unitPricePaise,
      batchNumber: m.batchNumber,
      mfgDate: m.mfgDate,
      expiryDate: m.expiryDate,
      remarks: "Auto-reversal: GRN cancelled",
      createdByUserId: actorUserId,
    })),
  );
}
