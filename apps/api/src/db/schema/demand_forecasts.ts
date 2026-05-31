import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { items } from "./items";

/**
 * Per-item demand forecast snapshots, derived from the stock-movement ledger
 * (forecast.service). Computed live on request; each run best-effort upserts a
 * snapshot here for trend history and reorder reporting.
 *
 * Quantities are ×1000 scaled (consistent with the rest of inventory).
 * `trendPctScaled` is signed percentage ×100 (e.g. 1250 = +12.5%).
 */
export const demandForecasts = pgTable(
  "demand_forecasts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    itemName: text("item_name").notNull(),
    uom: text("uom").notNull().default("nos"),

    method: text("method", { enum: ["moving_average", "trend"] }).notNull().default("moving_average"),
    historyMonths: integer("history_months").notNull().default(0),
    avgMonthlyConsumptionScaled: integer("avg_monthly_consumption_scaled").notNull().default(0),
    forecastNextMonthScaled: integer("forecast_next_month_scaled").notNull().default(0),
    /** Signed percentage ×100; null when there isn't enough history. */
    trendPctScaled: integer("trend_pct_scaled"),
    onHandScaled: integer("on_hand_scaled").notNull().default(0),
    suggestedReorderQtyScaled: integer("suggested_reorder_qty_scaled").notNull().default(0),

    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("demand_forecasts_tenant_idx").on(t.tenantId),
    itemIdx: index("demand_forecasts_item_idx").on(t.tenantId, t.itemId),
  }),
);

export type DemandForecastRow = typeof demandForecasts.$inferSelect;
export type NewDemandForecastRow = typeof demandForecasts.$inferInsert;
