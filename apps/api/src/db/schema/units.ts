import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { companies } from "./companies";

/**
 * A Unit is a physical location/plant/branch under a Company.
 * Stock, PRs, and POs are scoped to Units.
 */
export const units = pgTable(
  "units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code"),
    type: text("type", { enum: ["plant", "warehouse", "branch", "office", "other"] })
      .notNull()
      .default("plant"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    pincode: text("pincode"),
    gstin: text("gstin"), // unit may have its own GST registration
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("units_tenant_idx").on(t.tenantId),
    companyIdx: index("units_company_idx").on(t.companyId),
  }),
);

export type Unit = typeof units.$inferSelect;
export type NewUnit = typeof units.$inferInsert;
