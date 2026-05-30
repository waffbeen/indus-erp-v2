import { pgTable, uuid, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { companies } from "./companies";
import { units } from "./units";
import { vendors } from "./vendors";
import { items } from "./items";
import { users } from "./users";
import { purchaseOrders, poItems } from "./po";
import { grns, grnItems } from "./grns";

/**
 * Vendor invoices (AP bills) — the document a supplier sends asking for payment.
 * Linked back to a PO (ordered price) and GRN (received/accepted qty) so the
 * system can run a 3-way match before the bill is approved for payment.
 *
 * `status` is the lifecycle; `matchStatus` is the result of the 3-way match.
 * They start coupled (status mirrors matchStatus) and diverge once a user
 * approves/cancels. `paymentStatus` is rolled up from payment allocations.
 */
export const vendorInvoices = pgTable(
  "vendor_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    /** Nullable — a direct/expense invoice may not reference a PO. */
    poId: uuid("po_id").references(() => purchaseOrders.id, { onDelete: "set null" }),
    /** Nullable — the GRN the goods arrived under (drives qty side of the match). */
    grnId: uuid("grn_id").references(() => grns.id, { onDelete: "set null" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, { onDelete: "set null" }),

    /** The vendor's own invoice number printed on their bill. */
    invoiceNumber: text("invoice_number").notNull(),
    invoiceDate: timestamp("invoice_date", { mode: "date" }).notNull(),

    /** Financial breakup — all paise stored as text for big-int safety. */
    subtotalPaise: text("subtotal_paise").notNull().default("0"),
    taxPaise: text("tax_paise").notNull().default("0"),
    totalPaise: text("total_paise").notNull().default("0"),

    status: text("status", {
      enum: ["draft", "matched", "price_variance", "qty_variance", "unmatched", "approved", "cancelled"],
    })
      .notNull()
      .default("draft"),
    /** Result of the 3-way match — recomputed on create/edit. */
    matchStatus: text("match_status", {
      enum: ["unmatched", "matched", "price_variance", "qty_variance"],
    })
      .notNull()
      .default("unmatched"),

    /** Rolled up from payment_allocations. */
    paymentStatus: text("payment_status", { enum: ["unpaid", "partial", "paid"] })
      .notNull()
      .default("unpaid"),
    amountPaidPaise: text("amount_paid_paise").notNull().default("0"),

    remarks: text("remarks"),
    /** Captured when a user approves an over-tolerance variance. */
    varianceApproved: integer("variance_approved").notNull().default(0), // 0/1 boolean (legacy compat)
    approvedAt: timestamp("approved_at", { withTimezone: true }),

    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("vendor_invoices_tenant_idx").on(t.tenantId),
    tenantStatusIdx: index("vendor_invoices_tenant_status_idx").on(t.tenantId, t.status),
    vendorIdx: index("vendor_invoices_vendor_idx").on(t.vendorId),
    poIdx: index("vendor_invoices_po_idx").on(t.poId),
    grnIdx: index("vendor_invoices_grn_idx").on(t.grnId),
    numberIdx: index("vendor_invoices_number_idx").on(t.tenantId, t.invoiceNumber),
  }),
);

export type VendorInvoice = typeof vendorInvoices.$inferSelect;
export type NewVendorInvoice = typeof vendorInvoices.$inferInsert;

export const vendorInvoiceItems = pgTable(
  "vendor_invoice_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => vendorInvoices.id, { onDelete: "cascade" }),
    poItemId: uuid("po_item_id").references(() => poItems.id, { onDelete: "set null" }),
    grnItemId: uuid("grn_item_id").references(() => grnItems.id, { onDelete: "set null" }),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    itemName: text("item_name").notNull(),
    uom: text("uom").notNull().default("nos"),
    /** Quantity billed, scaled ×1000 like the rest of the app. */
    qtyScaled: integer("qty_scaled").notNull().default(0),
    unitPricePaise: text("unit_price_paise").notNull().default("0"),
    taxPaise: text("tax_paise").notNull().default("0"),
    totalPaise: text("total_paise").notNull().default("0"),

    /**
     * 3-way match snapshots — what the PO ordered vs what the GRN accepted,
     * captured at match time so the detail panel can render the comparison
     * without re-joining. Nullable when the line can't be matched.
     */
    poUnitPricePaise: text("po_unit_price_paise"),
    grnAcceptedQtyScaled: integer("grn_accepted_qty_scaled"),
    lineMatchStatus: text("line_match_status", {
      enum: ["unmatched", "matched", "price_variance", "qty_variance"],
    })
      .notNull()
      .default("unmatched"),

    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    invoiceIdx: index("vendor_invoice_items_invoice_idx").on(t.invoiceId),
    poItemIdx: index("vendor_invoice_items_po_item_idx").on(t.poItemId),
    grnItemIdx: index("vendor_invoice_items_grn_item_idx").on(t.grnItemId),
  }),
);

export type VendorInvoiceItem = typeof vendorInvoiceItems.$inferSelect;
export type NewVendorInvoiceItem = typeof vendorInvoiceItems.$inferInsert;
