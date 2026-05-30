import { pgTable, uuid, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { units } from "./units";
import { items } from "./items";

/**
 * Per (item, unit) stocking policy — the thresholds that drive reorder
 * automation. One row per item per warehouse: an item can be a fast-mover at
 * the main plant and slow at a branch, so levels are unit-scoped.
 *
 * All quantities are ×1000 scaled like the rest of inventory.
 *   - reorderLevel : on-hand at/below this → item shows on the reorder board.
 *   - max          : target level; suggested order qty tops the item back up to it.
 *   - safetyStock   : buffer kept below the reorder calc (informational + reporting).
 *   - leadTimeDays  : vendor lead time, used to contextualise urgency.
 */
export const itemStockPolicy = pgTable(
  "item_stock_policy",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),

    minQtyScaled: integer("min_qty_scaled").notNull().default(0),
    maxQtyScaled: integer("max_qty_scaled").notNull().default(0),
    reorderLevelScaled: integer("reorder_level_scaled").notNull().default(0),
    safetyStockScaled: integer("safety_stock_scaled").notNull().default(0),
    leadTimeDays: integer("lead_time_days").notNull().default(0),

    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("item_stock_policy_tenant_idx").on(t.tenantId),
    itemUnitIdx: index("item_stock_policy_item_unit_idx").on(t.tenantId, t.itemId, t.unitId),
  }),
);

export type ItemStockPolicy = typeof itemStockPolicy.$inferSelect;
export type NewItemStockPolicy = typeof itemStockPolicy.$inferInsert;
