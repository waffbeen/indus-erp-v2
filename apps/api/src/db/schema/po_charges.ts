import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { purchaseOrders } from "./po";

/**
 * Additional header-level charges on a PO — freight, insurance, packing,
 * loading, unloading, etc. Each row is a labelled line that adds to the
 * grand total. Mirrors the legacy AdditionalChargesGrid behaviour.
 *
 * We keep the legacy single-value freightChargesPaise / otherChargesPaise
 * on the PO header for back-compat, but new POs should prefer this table
 * so finance can see the breakup.
 */
export const poCharges = pgTable(
  "po_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    poId: uuid("po_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    amountPaise: text("amount_paise").notNull().default("0"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    poIdx: index("po_charges_po_idx").on(t.poId),
  }),
);

export type PoCharge = typeof poCharges.$inferSelect;
export type NewPoCharge = typeof poCharges.$inferInsert;
