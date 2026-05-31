import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/index";
import { items as itemsTable } from "../db/schema/items";
import { itemStockPolicy } from "../db/schema/item_stock_policy";
import { demandForecasts } from "../db/schema/demand_forecasts";
import { logger } from "../lib/logger";
import type { DemandForecast, DemandForecastsResult } from "@indus/shared";

/**
 * Per-item demand forecasting from the stock-movement ledger.
 *
 * Model (deliberately simple + explainable): consumption = the magnitude of
 * outward movements (issues / transfers-out) per calendar month over the last
 * 6 months. We take the moving average, nudge it by the recent trend (last 3
 * months vs the prior 3), and suggest a reorder quantity that tops on-hand back
 * up to ~1.5× the next-month forecast (or the configured reorder level).
 *
 * Quantities returned are HUMAN numbers (scaled ÷ 1000). Advisory only.
 */

const WINDOW_MONTHS = 6;

type MonthlyRow = {
  item_id: string;
  ym: string;
  consumed: string;
};
type OnHandRow = {
  item_id: string;
  on_hand: string;
  first_at: string | null;
};

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** The last `WINDOW_MONTHS` calendar-month keys, most recent first. */
function recentMonthKeys(now: Date): string[] {
  const keys: string[] = [];
  for (let i = 0; i < WINDOW_MONTHS; i++) {
    keys.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return keys;
}

function round3(scaled: number): number {
  return Math.round((scaled / 1000) * 1000) / 1000;
}

export async function getForecasts(tenantId: string): Promise<DemandForecastsResult> {
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth() - (WINDOW_MONTHS - 1), 1);

  const [monthly, onHandRows, itemRows, policyRows] = await Promise.all([
    db.execute<MonthlyRow>(sql`
      SELECT item_id,
             to_char(date_trunc('month', created_at), 'YYYY-MM') AS ym,
             COALESCE(SUM(GREATEST(-qty_scaled, 0)), 0)::text AS consumed
      FROM stock_movements
      WHERE tenant_id = ${tenantId}
        AND created_at >= ${windowStart}
      GROUP BY item_id, ym`),

    db.execute<OnHandRow>(sql`
      SELECT item_id,
             COALESCE(SUM(qty_scaled), 0)::text AS on_hand,
             MIN(created_at)::text AS first_at
      FROM stock_movements
      WHERE tenant_id = ${tenantId}
      GROUP BY item_id`),

    db
      .select({ id: itemsTable.id, name: itemsTable.name, uom: itemsTable.uom })
      .from(itemsTable)
      .where(and(eq(itemsTable.tenantId, tenantId), isNull(itemsTable.deletedAt))),

    db
      .select({
        itemId: itemStockPolicy.itemId,
        reorder: sql<number>`MAX(${itemStockPolicy.reorderLevelScaled})::int`.as("reorder"),
      })
      .from(itemStockPolicy)
      .where(and(eq(itemStockPolicy.tenantId, tenantId), isNull(itemStockPolicy.deletedAt)))
      .groupBy(itemStockPolicy.itemId),
  ]);

  // item_id -> { ym -> consumedScaled }
  const consumptionByItem = new Map<string, Map<string, number>>();
  for (const r of monthly.rows) {
    const m = consumptionByItem.get(r.item_id) ?? new Map<string, number>();
    m.set(r.ym, Number(r.consumed));
    consumptionByItem.set(r.item_id, m);
  }
  const onHandByItem = new Map(onHandRows.rows.map((r) => [r.item_id, r]));
  const reorderByItem = new Map(policyRows.map((r) => [r.itemId, r.reorder]));
  const itemMeta = new Map(itemRows.map((i) => [i.id, i]));

  const keys = recentMonthKeys(now); // [m0(latest) .. m5]
  const forecasts: DemandForecast[] = [];

  for (const [itemId, monthMap] of consumptionByItem) {
    const meta = itemMeta.get(itemId);
    if (!meta) continue; // item soft-deleted / not in master

    const perMonth = keys.map((k) => monthMap.get(k) ?? 0); // scaled
    const total = perMonth.reduce((s, v) => s + v, 0);
    if (total <= 0) continue; // no real demand signal

    const onHandRow = onHandByItem.get(itemId);
    const onHandScaled = onHandRow ? Math.max(0, Number(onHandRow.on_hand)) : 0;

    // How many months of history we actually have (caps the divisor so a brand
    // new item with one big issue isn't averaged across six empty months).
    let historyMonths = WINDOW_MONTHS;
    if (onHandRow?.first_at) {
      const first = new Date(onHandRow.first_at);
      const span =
        (now.getFullYear() - first.getFullYear()) * 12 + (now.getMonth() - first.getMonth()) + 1;
      historyMonths = Math.min(WINDOW_MONTHS, Math.max(1, span));
    }

    const avgMonthlyScaled = total / historyMonths;

    // Trend: last 3 months vs the prior 3.
    const last3 = perMonth.slice(0, 3).reduce((s, v) => s + v, 0);
    const prior3 = perMonth.slice(3, 6).reduce((s, v) => s + v, 0);
    const trendPct = prior3 > 0 ? Math.round(((last3 - prior3) / prior3) * 1000) / 10 : null;

    // Dampened trend adjustment on the moving average.
    const method: DemandForecast["method"] = trendPct !== null ? "trend" : "moving_average";
    const forecastScaled =
      trendPct !== null ? avgMonthlyScaled * (1 + (trendPct / 100) * 0.5) : avgMonthlyScaled;

    const reorderLevel = reorderByItem.get(itemId) ?? 0;
    const targetScaled = Math.max(forecastScaled * 1.5, reorderLevel);
    const suggestedReorderScaled = Math.max(0, Math.round(targetScaled - onHandScaled));

    const forecastNextMonth = round3(forecastScaled);
    const coverMonths = forecastScaled > 0 ? Math.round((onHandScaled / forecastScaled) * 10) / 10 : null;

    forecasts.push({
      itemId,
      itemName: meta.name,
      uom: meta.uom,
      method,
      historyMonths,
      avgMonthlyConsumption: round3(avgMonthlyScaled),
      forecastNextMonth,
      trendPct,
      onHand: round3(onHandScaled),
      suggestedReorderQty: round3(suggestedReorderScaled),
      coverMonths,
    });
  }

  forecasts.sort((a, b) => b.forecastNextMonth - a.forecastNextMonth);

  void persistSnapshot(tenantId, forecasts);

  return { forecasts, generatedAt: new Date().toISOString() };
}

async function persistSnapshot(tenantId: string, forecasts: DemandForecast[]): Promise<void> {
  if (!forecasts.length) return;
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(demandForecasts)
        .set({ deletedAt: new Date() })
        .where(and(eq(demandForecasts.tenantId, tenantId), isNull(demandForecasts.deletedAt)));
      await tx.insert(demandForecasts).values(
        forecasts.map((f) => ({
          tenantId,
          itemId: f.itemId,
          itemName: f.itemName,
          uom: f.uom,
          method: f.method,
          historyMonths: f.historyMonths,
          avgMonthlyConsumptionScaled: Math.round(f.avgMonthlyConsumption * 1000),
          forecastNextMonthScaled: Math.round(f.forecastNextMonth * 1000),
          trendPctScaled: f.trendPct === null ? null : Math.round(f.trendPct * 100),
          onHandScaled: Math.round(f.onHand * 1000),
          suggestedReorderQtyScaled: Math.round(f.suggestedReorderQty * 1000),
        })),
      );
    });
  } catch (err) {
    logger.warn({ err, tenantId }, "demand_forecast_snapshot_skipped");
  }
}
