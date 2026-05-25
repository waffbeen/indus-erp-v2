import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { units } from "./units";

/**
 * Departments live under Units. Examples: "Procurement", "Stores", "Production".
 * Useful for routing PRs to the right approval chain and for cost-center reporting.
 */
export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code"),
    costCenter: text("cost_center"),
    headUserId: uuid("head_user_id"), // FK to users — soft, no constraint to avoid cycle
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("departments_tenant_idx").on(t.tenantId),
    unitIdx: index("departments_unit_idx").on(t.unitId),
  }),
);

export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
