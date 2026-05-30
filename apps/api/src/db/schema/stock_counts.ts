import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { companies } from "./companies";
import { units } from "./units";
import { items } from "./items";
import { users } from "./users";

/**
 * Cycle-count / physical-verification sheets. Workflow:
 *   1. Create a count for a unit  -> we snapshot system on-hand from the
 *      stock-movement ledger into stock_count_items (status "draft").
 *   2. Warehouse team enters counted qty per line     (status "in_progress").
 *   3. Post the count -> for every line with a variance we insert a balancing
 *      "adjustment" stock movement so the ledger matches reality, and the
 *      count is locked  (status "completed").
 *
 * Quantities are ×1000 scaled. variance = counted − system.
 */
export const stockCounts = pgTable(
  "stock_counts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),

    countNumber: text("count_number"), // human reference, e.g. "CNT-2026-0007"
    status: text("status", { enum: ["draft", "in_progress", "completed", "cancelled"] })
      .notNull()
      .default("draft"),
    countedByUserId: uuid("counted_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    remarks: text("remarks"),

    /** Set when the count is posted and adjustments are written to the ledger. */
    postedAt: timestamp("posted_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("stock_counts_tenant_idx").on(t.tenantId),
    tenantStatusIdx: index("stock_counts_tenant_status_idx").on(t.tenantId, t.status),
    unitIdx: index("stock_counts_unit_idx").on(t.unitId),
  }),
);

export type StockCount = typeof stockCounts.$inferSelect;
export type NewStockCount = typeof stockCounts.$inferInsert;

export const stockCountItems = pgTable(
  "stock_count_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countId: uuid("count_id")
      .notNull()
      .references(() => stockCounts.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    /** Snapshot of item name so the sheet stays readable if the master changes. */
    itemName: text("item_name").notNull(),
    uom: text("uom").notNull(),

    /** System on-hand snapshotted at count creation (×1000). */
    systemQtyScaled: integer("system_qty_scaled").notNull().default(0),
    /** Physically counted qty entered by the team (×1000). */
    countedQtyScaled: integer("counted_qty_scaled").notNull().default(0),
    /** counted − system (×1000). Positive = found extra, negative = shortage. */
    varianceScaled: integer("variance_scaled").notNull().default(0),

    remarks: text("remarks"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    countIdx: index("stock_count_items_count_idx").on(t.countId),
    itemIdx: index("stock_count_items_item_idx").on(t.itemId),
  }),
);

export type StockCountItem = typeof stockCountItems.$inferSelect;
export type NewStockCountItem = typeof stockCountItems.$inferInsert;
