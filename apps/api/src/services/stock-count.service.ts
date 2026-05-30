import { eq, and, isNull, desc, sql, inArray } from "drizzle-orm";
import { db } from "../db/index";
import { stockMovements } from "../db/schema/stock";
import { stockCounts, stockCountItems } from "../db/schema/stock_counts";
import { items } from "../db/schema/items";
import { units } from "../db/schema/units";
import { companies } from "../db/schema/companies";
import { users } from "../db/schema/users";
import { auditLogs } from "../db/schema/audit_logs";
import { BadRequest, Forbidden, NotFound } from "../lib/errors";

interface ActorContext {
  tenantId: string;
  userId: string;
  isTenantAdmin: boolean;
  ipAddress?: string;
  userAgent?: string;
}

/* ---------------- Count number ---------------- */

async function nextCountNumber(tenantId: string): Promise<string> {
  const rows = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(stockCounts)
    .where(eq(stockCounts.tenantId, tenantId));
  const seq = (Number(rows[0]?.count) || 0) + 1;
  const year = new Date().getFullYear();
  return `CNT-${year}-${String(seq).padStart(4, "0")}`;
}

/* ---------------- Create (snapshot the ledger) ---------------- */

export async function createCount(
  ctx: ActorContext,
  input: { companyId: string; unitId: string; remarks?: string | null },
) {
  // Validate company + unit belong to the tenant.
  const [unit] = await db
    .select({ id: units.id, companyId: units.companyId })
    .from(units)
    .where(and(eq(units.id, input.unitId), eq(units.tenantId, ctx.tenantId), isNull(units.deletedAt)))
    .limit(1);
  if (!unit) throw BadRequest("invalid_unit", "Selected unit does not belong to this workspace");

  const [company] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, input.companyId), eq(companies.tenantId, ctx.tenantId), isNull(companies.deletedAt)))
    .limit(1);
  if (!company) throw BadRequest("invalid_company", "Selected company does not belong to this workspace");

  // Snapshot system on-hand per item for this unit, straight from the ledger.
  const positions = await db
    .select({
      itemId: stockMovements.itemId,
      uom: sql<string>`MAX(${stockMovements.uom})`.as("uom"),
      qtyScaled: sql<number>`SUM(${stockMovements.qtyScaled})::bigint`.as("qty_scaled"),
    })
    .from(stockMovements)
    .where(and(eq(stockMovements.tenantId, ctx.tenantId), eq(stockMovements.unitId, input.unitId)))
    .groupBy(stockMovements.itemId);

  // Resolve item names for the snapshot rows.
  const itemIds = positions.map((p) => p.itemId);
  const itemRows = itemIds.length
    ? await db.select({ id: items.id, name: items.name }).from(items).where(inArray(items.id, itemIds))
    : [];
  const nameMap = new Map(itemRows.map((i) => [i.id, i.name]));

  const countNumber = await nextCountNumber(ctx.tenantId);

  const created = await db.transaction(async (tx) => {
    const [count] = await tx
      .insert(stockCounts)
      .values({
        tenantId: ctx.tenantId,
        companyId: input.companyId,
        unitId: input.unitId,
        countNumber,
        status: "draft",
        countedByUserId: ctx.userId,
        remarks: input.remarks?.trim() || null,
      })
      .returning();

    if (positions.length > 0) {
      await tx.insert(stockCountItems).values(
        positions.map((p, idx) => {
          const systemQtyScaled = Number(p.qtyScaled) || 0;
          return {
            countId: count!.id,
            itemId: p.itemId,
            itemName: nameMap.get(p.itemId) ?? "—",
            uom: p.uom,
            systemQtyScaled,
            // Default counted = system, so untouched lines post no adjustment.
            countedQtyScaled: systemQtyScaled,
            varianceScaled: 0,
            sortOrder: idx,
          };
        }),
      );
    }

    return count!;
  });

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "create",
    resourceType: "stock_count",
    resourceId: created.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    after: { countNumber, unitId: input.unitId, lines: positions.length } as Record<string, unknown>,
  });

  return created;
}

/* ---------------- List ---------------- */

export async function listCounts(tenantId: string, opts: { status?: string; unitId?: string } = {}) {
  const conds = [eq(stockCounts.tenantId, tenantId), isNull(stockCounts.deletedAt)];
  if (opts.unitId) conds.push(eq(stockCounts.unitId, opts.unitId));
  if (opts.status) conds.push(eq(stockCounts.status, opts.status as any));

  const rows = await db
    .select({
      id: stockCounts.id,
      countNumber: stockCounts.countNumber,
      status: stockCounts.status,
      unitId: stockCounts.unitId,
      unitName: units.name,
      companyId: stockCounts.companyId,
      remarks: stockCounts.remarks,
      countedByUserId: stockCounts.countedByUserId,
      countedByName: users.fullName,
      postedAt: stockCounts.postedAt,
      createdAt: stockCounts.createdAt,
      lineCount: sql<number>`(SELECT COUNT(*)::int FROM stock_count_items sci WHERE sci.count_id = ${stockCounts.id})`,
    })
    .from(stockCounts)
    .leftJoin(units, eq(stockCounts.unitId, units.id))
    .leftJoin(users, eq(stockCounts.countedByUserId, users.id))
    .where(and(...conds))
    .orderBy(desc(stockCounts.createdAt));

  return rows.map((r) => ({
    id: r.id,
    countNumber: r.countNumber,
    status: r.status,
    unitId: r.unitId,
    unitName: r.unitName ?? "—",
    companyId: r.companyId,
    remarks: r.remarks,
    countedByName: r.countedByName ?? "—",
    postedAt: r.postedAt ? r.postedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    lineCount: Number(r.lineCount) || 0,
  }));
}

/* ---------------- Get one (header + lines) ---------------- */

export async function getCount(tenantId: string, id: string) {
  const [count] = await db
    .select()
    .from(stockCounts)
    .where(and(eq(stockCounts.id, id), eq(stockCounts.tenantId, tenantId), isNull(stockCounts.deletedAt)))
    .limit(1);
  if (!count) throw NotFound("count_not_found", "Stock count not found");

  const [unit] = await db.select({ name: units.name }).from(units).where(eq(units.id, count.unitId)).limit(1);
  const [actor] = await db
    .select({ name: users.fullName })
    .from(users)
    .where(eq(users.id, count.countedByUserId))
    .limit(1);

  const lines = await db
    .select()
    .from(stockCountItems)
    .where(eq(stockCountItems.countId, id))
    .orderBy(stockCountItems.sortOrder);

  return {
    id: count.id,
    countNumber: count.countNumber,
    status: count.status,
    companyId: count.companyId,
    unitId: count.unitId,
    unitName: unit?.name ?? "—",
    countedByName: actor?.name ?? "—",
    remarks: count.remarks,
    postedAt: count.postedAt ? count.postedAt.toISOString() : null,
    createdAt: count.createdAt.toISOString(),
    lines: lines.map((l) => ({
      id: l.id,
      itemId: l.itemId,
      itemName: l.itemName,
      uom: l.uom,
      systemQty: l.systemQtyScaled / 1000,
      countedQty: l.countedQtyScaled / 1000,
      varianceQty: l.varianceScaled / 1000,
      remarks: l.remarks,
    })),
  };
}

/* ---------------- Save counted quantities ---------------- */

export async function saveCountedQty(
  ctx: ActorContext,
  id: string,
  lines: Array<{ itemId: string; countedQty: number; remarks?: string | null }>,
) {
  const [count] = await db
    .select()
    .from(stockCounts)
    .where(and(eq(stockCounts.id, id), eq(stockCounts.tenantId, ctx.tenantId), isNull(stockCounts.deletedAt)))
    .limit(1);
  if (!count) throw NotFound("count_not_found", "Stock count not found");
  if (count.status === "completed" || count.status === "cancelled")
    throw BadRequest("count_locked", "This count is closed and can no longer be edited");

  const existing = await db.select().from(stockCountItems).where(eq(stockCountItems.countId, id));
  const byItem = new Map(existing.filter((l) => l.itemId).map((l) => [l.itemId as string, l]));

  await db.transaction(async (tx) => {
    for (const line of lines) {
      const row = byItem.get(line.itemId);
      if (!row) continue; // ignore items not on this sheet
      const countedScaled = Math.round((line.countedQty ?? 0) * 1000);
      const varianceScaled = countedScaled - row.systemQtyScaled;
      await tx
        .update(stockCountItems)
        .set({
          countedQtyScaled: countedScaled,
          varianceScaled,
          remarks: line.remarks?.trim() || null,
        })
        .where(eq(stockCountItems.id, row.id));
    }

    if (count.status === "draft") {
      await tx
        .update(stockCounts)
        .set({ status: "in_progress", updatedAt: new Date() })
        .where(eq(stockCounts.id, id));
    }
  });

  return getCount(ctx.tenantId, id);
}

/* ---------------- Post (write balancing adjustments to the ledger) ---------------- */

export async function postCount(ctx: ActorContext, id: string) {
  const [count] = await db
    .select()
    .from(stockCounts)
    .where(and(eq(stockCounts.id, id), eq(stockCounts.tenantId, ctx.tenantId), isNull(stockCounts.deletedAt)))
    .limit(1);
  if (!count) throw NotFound("count_not_found", "Stock count not found");
  if (count.status === "completed") throw BadRequest("already_posted", "This count is already posted");
  if (count.status === "cancelled") throw BadRequest("count_cancelled", "This count was cancelled");

  const lines = await db.select().from(stockCountItems).where(eq(stockCountItems.countId, id));
  // Only lines with a real variance and a linked item produce a ledger movement.
  const adjustments = lines.filter((l) => l.itemId && l.varianceScaled !== 0);

  const posted = await db.transaction(async (tx) => {
    if (adjustments.length > 0) {
      await tx.insert(stockMovements).values(
        adjustments.map((l) => ({
          tenantId: ctx.tenantId,
          companyId: count.companyId,
          unitId: count.unitId,
          itemId: l.itemId!,
          sourceType: "adjustment",
          sourceId: count.id, // ties the movement back to the count
          sourceRef: count.countNumber ? `Cycle count ${count.countNumber}` : "Cycle count",
          // variance is signed: positive = found extra (stock in), negative = shortage (out).
          qtyScaled: l.varianceScaled,
          uom: l.uom,
          unitPricePaise: "0",
          batchNumber: null as string | null,
          mfgDate: null as Date | null,
          expiryDate: null as Date | null,
          remarks: `Stock count adjustment${l.remarks ? ` — ${l.remarks}` : ""}`,
          createdByUserId: ctx.userId,
        })),
      );
    }

    const [updated] = await tx
      .update(stockCounts)
      .set({ status: "completed", postedAt: new Date(), updatedAt: new Date() })
      .where(eq(stockCounts.id, id))
      .returning();
    return updated!;
  });

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "post",
    resourceType: "stock_count",
    resourceId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    after: {
      countNumber: count.countNumber,
      adjustments: adjustments.length,
      totalVarianceScaled: adjustments.reduce((s, l) => s + l.varianceScaled, 0),
    } as Record<string, unknown>,
  });

  return { ...posted, adjustmentsPosted: adjustments.length };
}

/* ---------------- Cancel ---------------- */

export async function cancelCount(ctx: ActorContext, id: string) {
  const [count] = await db
    .select()
    .from(stockCounts)
    .where(and(eq(stockCounts.id, id), eq(stockCounts.tenantId, ctx.tenantId), isNull(stockCounts.deletedAt)))
    .limit(1);
  if (!count) throw NotFound("count_not_found", "Stock count not found");
  if (count.status === "completed")
    throw Forbidden("already_posted", "A posted count cannot be cancelled — reverse it with a new count instead");

  const [updated] = await db
    .update(stockCounts)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(stockCounts.id, id))
    .returning();

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "cancel",
    resourceType: "stock_count",
    resourceId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return updated!;
}
