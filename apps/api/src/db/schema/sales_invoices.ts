import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { companies } from "./companies";
import { units } from "./units";
import { customers } from "./customers";
import { items } from "./items";
import { users } from "./users";
import { salesOrders, salesOrderItems } from "./sales_orders";

/**
 * Sales Invoices (AR) — the sell-side mirror of `vendor_invoices`, but OUTWARD.
 * The tax document WE raise on a customer. GST is outward (our liability), so
 * unlike vendor invoices the CGST/SGST/IGST is computed by us from the lines
 * (not captured from someone else's bill). Optionally raised from a Sales Order.
 *
 * `status` is the lifecycle; `paymentStatus` is rolled up from receipt
 * allocations; `amountPaidPaise` mirrors that roll-up. `dueDate` is derived from
 * the customer's credit days and powers AR ageing (0-30 / 30-60 / 60-90 / 90+).
 */
export const salesInvoices = pgTable(
  "sales_invoices",
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
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    /** Nullable — a direct/counter sale invoice may not reference an SO. */
    soId: uuid("so_id").references(() => salesOrders.id, { onDelete: "set null" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, { onDelete: "set null" }),

    /** Our own outward invoice number (auto-generated, e.g. SI-2026-00001). */
    invoiceNumber: text("invoice_number"),
    invoiceDate: timestamp("invoice_date", { mode: "date" }).notNull(),
    dueDate: timestamp("due_date", { mode: "date" }),

    /** Inter-state vs intra-state — drives IGST vs CGST+SGST split. */
    isInterstate: boolean("is_interstate").notNull().default(false),
    placeOfSupply: text("place_of_supply"),

    /** Financial breakup — all paise stored as text for big-int safety. */
    subtotalPaise: text("subtotal_paise").notNull().default("0"),
    discountTotalPaise: text("discount_total_paise").notNull().default("0"),
    taxableAmountPaise: text("taxable_amount_paise").notNull().default("0"),
    cgstTotalPaise: text("cgst_total_paise").notNull().default("0"),
    sgstTotalPaise: text("sgst_total_paise").notNull().default("0"),
    igstTotalPaise: text("igst_total_paise").notNull().default("0"),
    taxPaise: text("tax_paise").notNull().default("0"),
    roundOffPaise: text("round_off_paise").notNull().default("0"),
    totalPaise: text("total_paise").notNull().default("0"),
    currency: text("currency").notNull().default("INR"),

    status: text("status", {
      enum: ["draft", "issued", "partially_paid", "paid", "cancelled"],
    })
      .notNull()
      .default("draft"),

    /** Rolled up from sales_receipt_allocations. */
    paymentStatus: text("payment_status", { enum: ["unpaid", "partial", "paid"] })
      .notNull()
      .default("unpaid"),
    amountPaidPaise: text("amount_paid_paise").notNull().default("0"),

    remarks: text("remarks"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),

    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("sales_invoices_tenant_idx").on(t.tenantId),
    tenantStatusIdx: index("sales_invoices_tenant_status_idx").on(t.tenantId, t.status),
    customerIdx: index("sales_invoices_customer_idx").on(t.customerId),
    soIdx: index("sales_invoices_so_idx").on(t.soId),
    numberIdx: index("sales_invoices_number_idx").on(t.tenantId, t.invoiceNumber),
  }),
);

export type SalesInvoice = typeof salesInvoices.$inferSelect;
export type NewSalesInvoice = typeof salesInvoices.$inferInsert;

export const salesInvoiceItems = pgTable(
  "sales_invoice_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => salesInvoices.id, { onDelete: "cascade" }),
    soItemId: uuid("so_item_id").references(() => salesOrderItems.id, { onDelete: "set null" }),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    itemName: text("item_name").notNull(),
    description: text("description"),
    hsnCode: text("hsn_code"),
    uom: text("uom").notNull().default("nos"),
    /** Quantity billed, scaled ×1000. */
    qtyScaled: integer("qty_scaled").notNull().default(0),
    unitPricePaise: text("unit_price_paise").notNull().default("0"),

    discountPercent: integer("discount_percent").notNull().default(0),
    discountAmountPaise: text("discount_amount_paise").notNull().default("0"),

    /** Outward GST split. */
    taxRate: integer("tax_rate").notNull().default(18),
    cgstRate: integer("cgst_rate").notNull().default(0),
    sgstRate: integer("sgst_rate").notNull().default(0),
    igstRate: integer("igst_rate").notNull().default(0),

    subtotalPaise: text("subtotal_paise").notNull().default("0"),
    taxableAmountPaise: text("taxable_amount_paise").notNull().default("0"),
    cgstPaise: text("cgst_paise").notNull().default("0"),
    sgstPaise: text("sgst_paise").notNull().default("0"),
    igstPaise: text("igst_paise").notNull().default("0"),
    taxPaise: text("tax_paise").notNull().default("0"),
    totalPaise: text("total_paise").notNull().default("0"),

    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    invoiceIdx: index("sales_invoice_items_invoice_idx").on(t.invoiceId),
    soItemIdx: index("sales_invoice_items_so_item_idx").on(t.soItemId),
  }),
);

export type SalesInvoiceItem = typeof salesInvoiceItems.$inferSelect;
export type NewSalesInvoiceItem = typeof salesInvoiceItems.$inferInsert;

/**
 * Sales Receipts — money coming IN from a customer. The AR mirror of vendor
 * `payments`. One receipt can settle many invoices (and an invoice across many
 * receipts) via `sales_receipt_allocations`. Allocations may also point at an
 * SO (advance received before the invoice is raised).
 */
export const salesReceipts = pgTable(
  "sales_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "restrict" }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    receiptNumber: text("receipt_number"),
    receiptDate: timestamp("receipt_date", { mode: "date" }).notNull(),
    method: text("method", { enum: ["neft", "rtgs", "cheque", "upi", "cash"] }).notNull(),

    amountPaise: text("amount_paise").notNull().default("0"),
    /** Sum of allocations (advance = amount − allocated). */
    allocatedPaise: text("allocated_paise").notNull().default("0"),

    /** UTR / cheque number / UPI ref. */
    reference: text("reference"),
    status: text("status", { enum: ["draft", "posted", "cancelled"] }).notNull().default("posted"),
    remarks: text("remarks"),

    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("sales_receipts_tenant_idx").on(t.tenantId),
    tenantStatusIdx: index("sales_receipts_tenant_status_idx").on(t.tenantId, t.status),
    customerIdx: index("sales_receipts_customer_idx").on(t.customerId),
    numberIdx: index("sales_receipts_number_idx").on(t.tenantId, t.receiptNumber),
  }),
);

export type SalesReceipt = typeof salesReceipts.$inferSelect;
export type NewSalesReceipt = typeof salesReceipts.$inferInsert;

export const salesReceiptAllocations = pgTable(
  "sales_receipt_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => salesReceipts.id, { onDelete: "cascade" }),
    /** Either an invoice (settle an AR bill) ... */
    salesInvoiceId: uuid("sales_invoice_id").references(() => salesInvoices.id, { onDelete: "set null" }),
    /** ... or an SO (advance against an order before the invoice exists). */
    soId: uuid("so_id").references(() => salesOrders.id, { onDelete: "set null" }),
    allocatedPaise: text("allocated_paise").notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    receiptIdx: index("sales_receipt_allocations_receipt_idx").on(t.receiptId),
    invoiceIdx: index("sales_receipt_allocations_invoice_idx").on(t.salesInvoiceId),
    soIdx: index("sales_receipt_allocations_so_idx").on(t.soId),
  }),
);

export type SalesReceiptAllocation = typeof salesReceiptAllocations.$inferSelect;
export type NewSalesReceiptAllocation = typeof salesReceiptAllocations.$inferInsert;
