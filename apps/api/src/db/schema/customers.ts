import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * Customers — the sell-side mirror of `vendors`. The directory of who we ship
 * to and bill. Used by Sales Orders and Sales Invoices (outward GST / AR).
 *
 * Like vendors: tenant-scoped, soft-deleted, GSTIN tracked for the inter/intra
 * state GST split. Adds billing vs shipping address (an outward invoice prints
 * "Bill To" + "Ship To") and `creditDays` to drive AR ageing / due dates.
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: text("code"), // tenant-scoped customer code (auto-generated, e.g. C-0001)
    name: text("name").notNull(),
    legalName: text("legal_name"),
    gstin: text("gstin"),
    pan: text("pan"),
    contactPerson: text("contact_person"),
    email: text("email"),
    phone: text("phone"),
    billingAddress: text("billing_address"),
    shippingAddress: text("shipping_address"),
    city: text("city"),
    state: text("state"),
    pincode: text("pincode"),
    country: text("country").notNull().default("IN"),
    /** Default credit period — feeds the sales-invoice due date + AR ageing. */
    creditDays: integer("credit_days").notNull().default(0),
    /** Optional AR control: hard credit limit in paise (null = no limit). */
    creditLimitPaise: text("credit_limit_paise"),
    paymentTerms: text("payment_terms"), // e.g. "Net 30"
    bankAccount: jsonb("bank_account").$type<{
      accountNumber?: string;
      ifsc?: string;
      accountHolder?: string;
      bankName?: string;
    }>(),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("customers_tenant_idx").on(t.tenantId),
    tenantNameIdx: index("customers_tenant_name_idx").on(t.tenantId, t.name),
    gstinIdx: index("customers_gstin_idx").on(t.gstin),
  }),
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
