import { pgTable, uuid, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * Free-on-Rail (F.O.R) / delivery-term catalogue per tenant. Replaces the
 * earlier hardcoded enum (Ex Works / FOR Plant / CIF / Annexure / Upto Destination).
 */
export const deliveryTerms = pgTable(
  "delivery_terms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Short code used on the PO record, e.g. "ex_works". */
    code: text("code").notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("delivery_terms_tenant_idx").on(t.tenantId),
    tenantCodeIdx: index("delivery_terms_tenant_code_idx").on(t.tenantId, t.code),
  }),
);

export type DeliveryTerm = typeof deliveryTerms.$inferSelect;
export type NewDeliveryTerm = typeof deliveryTerms.$inferInsert;
