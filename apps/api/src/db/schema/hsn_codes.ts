import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * HSN/SAC master — tenant-scoped catalogue of HSN codes the team has used.
 * The PO/PR line "HSN" field is a free-text input today; once this table is
 * populated, the same field becomes a typeahead so users pick from history
 * instead of retyping. New codes typed inline can be saved to the master.
 */
export const hsnCodes = pgTable(
  "hsn_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** The actual HSN/SAC code, e.g. "8482" or "998314". */
    code: text("code").notNull(),
    description: text("description"),
    /** Default GST % for this code. Buyer can still override per PO line. */
    defaultGstRate: integer("default_gst_rate"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("hsn_codes_tenant_idx").on(t.tenantId),
    /** Unique-per-tenant code so we don't end up with dupes. */
    tenantCodeIdx: index("hsn_codes_tenant_code_idx").on(t.tenantId, t.code),
  }),
);

export type HsnCode = typeof hsnCodes.$inferSelect;
export type NewHsnCode = typeof hsnCodes.$inferInsert;
