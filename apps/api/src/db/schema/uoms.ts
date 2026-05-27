import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * Unit-of-measure master. Same idea as hsn_codes — tenant-scoped, used as
 * the suggestion source for the UoM field on PR/PO/item lines.
 */
export const uoms = pgTable(
  "uoms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Short code as typed on line items, e.g. "nos", "kg", "ltr", "mtr". */
    code: text("code").notNull(),
    /** Friendly name shown in settings, e.g. "Numbers", "Kilograms". */
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("uoms_tenant_idx").on(t.tenantId),
    tenantCodeIdx: index("uoms_tenant_code_idx").on(t.tenantId, t.code),
  }),
);

export type Uom = typeof uoms.$inferSelect;
export type NewUom = typeof uoms.$inferInsert;
