import { pgTable, uuid, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * Top-level item taxonomy — Raw Material, Spares, Consumables, etc.
 * Existing `items.itemGroupName` stays as a free-text snapshot; new items
 * are encouraged to pick from this master.
 */
export const itemGroups = pgTable(
  "item_groups",
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
    tenantIdx: index("item_groups_tenant_idx").on(t.tenantId),
  }),
);

export type ItemGroup = typeof itemGroups.$inferSelect;
export type NewItemGroup = typeof itemGroups.$inferInsert;
