import { pgTable, uuid, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * Item categorization orthogonal to groups — typically business-level
 * tags (Engineering, Stationery, Safety, etc.). Currently items.category
 * is a free-text column; this master provides a curated dropdown.
 */
export const itemCategories = pgTable(
  "item_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: text("code"),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("item_categories_tenant_idx").on(t.tenantId),
  }),
);

export type ItemCategory = typeof itemCategories.$inferSelect;
export type NewItemCategory = typeof itemCategories.$inferInsert;
