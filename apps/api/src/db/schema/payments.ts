import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { companies } from "./companies";
import { units } from "./units";
import { vendors } from "./vendors";
import { users } from "./users";
import { purchaseOrders } from "./po";
import { vendorInvoices } from "./vendor_invoices";

/**
 * Vendor payments — money going out to a supplier. One payment can settle many
 * invoices (and a single invoice can be settled across several payments) via the
 * payment_allocations join table. Allocations may also point at a PO instead of
 * an invoice, which models an advance paid before the bill arrives.
 *
 * `allocatedPaise` mirrors the sum of its allocations; anything in
 * `amountPaise` beyond that is an on-account / unallocated advance.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Optional — a payment can be company/unit specific for reporting. */
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "restrict" }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "restrict" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    paymentNumber: text("payment_number"),
    paymentDate: timestamp("payment_date", { mode: "date" }).notNull(),
    method: text("method", { enum: ["neft", "rtgs", "cheque", "upi", "cash"] }).notNull(),

    amountPaise: text("amount_paise").notNull().default("0"),
    /** Sum of payment_allocations for this payment (advance = amount − allocated). */
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
    tenantIdx: index("payments_tenant_idx").on(t.tenantId),
    tenantStatusIdx: index("payments_tenant_status_idx").on(t.tenantId, t.status),
    vendorIdx: index("payments_vendor_idx").on(t.vendorId),
    numberIdx: index("payments_number_idx").on(t.tenantId, t.paymentNumber),
  }),
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    /** Either an invoice (settle a bill) ... */
    vendorInvoiceId: uuid("vendor_invoice_id").references(() => vendorInvoices.id, { onDelete: "set null" }),
    /** ... or a PO (advance against an order before the invoice exists). */
    poId: uuid("po_id").references(() => purchaseOrders.id, { onDelete: "set null" }),
    allocatedPaise: text("allocated_paise").notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    paymentIdx: index("payment_allocations_payment_idx").on(t.paymentId),
    invoiceIdx: index("payment_allocations_invoice_idx").on(t.vendorInvoiceId),
    poIdx: index("payment_allocations_po_idx").on(t.poId),
  }),
);

export type PaymentAllocation = typeof paymentAllocations.$inferSelect;
export type NewPaymentAllocation = typeof paymentAllocations.$inferInsert;
