import { pgTable, uuid, text, timestamp, boolean, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { units } from "./units";

/**
 * Physical storage locations inside a Unit (warehouse/plant). Hierarchical:
 * a warehouse contains zones, zones contain racks, racks contain bins. The
 * `parentId` self-reference models that tree; top-level rows (a whole
 * warehouse) have parentId = null.
 *
 * Stock is still tracked at the (item, unit) grain by the ledger — locations
 * are a finer-grained organisational layer the warehouse team can stamp onto
 * counts and put-away later without changing the ledger model.
 */
export const storageLocations = pgTable(
  "storage_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),
    code: text("code"), // short locator, e.g. "A-12-03"
    name: text("name").notNull(),
    /** "warehouse" (top) > "zone" > "rack" > "bin". */
    type: text("type", { enum: ["warehouse", "zone", "rack", "bin"] })
      .notNull()
      .default("warehouse"),
    /** Self-reference for hierarchy. Null = top-level location under the unit. */
    parentId: uuid("parent_id").references((): AnyPgColumn => storageLocations.id, {
      onDelete: "set null",
    }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("storage_locations_tenant_idx").on(t.tenantId),
    unitIdx: index("storage_locations_unit_idx").on(t.unitId),
    parentIdx: index("storage_locations_parent_idx").on(t.parentId),
  }),
);

export type StorageLocation = typeof storageLocations.$inferSelect;
export type NewStorageLocation = typeof storageLocations.$inferInsert;
