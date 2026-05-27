import { pgTable, uuid, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { itemGroups } from "./item_groups";

/**
 * Item sub-taxonomy hung off an item_group. Bearings under Spares, Belts
 * under Consumables, etc. groupId nullable so flat sub-groups also work.
 */
export const itemSubGroups = pgTable(
  "item_sub_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => itemGroups.id, { onDelete: "set null" }),
    code: text("code"),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("item_sub_groups_tenant_idx").on(t.tenantId),
    groupIdx: index("item_sub_groups_group_idx").on(t.groupId),
  }),
);

export type ItemSubGroup = typeof itemSubGroups.$inferSelect;
export type NewItemSubGroup = typeof itemSubGroups.$inferInsert;
