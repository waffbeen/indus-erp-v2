import { pgTable, uuid, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * Cost-centre catalogue — used to tag PR/PO line items for management
 * accounting (Production / Maintenance / Admin / R&D, etc.).
 */
export const costCenters = pgTable(
  "cost_centers",
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
    tenantIdx: index("cost_centers_tenant_idx").on(t.tenantId),
  }),
);

export type CostCenter = typeof costCenters.$inferSelect;
export type NewCostCenter = typeof costCenters.$inferInsert;
