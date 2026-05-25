import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: text("code"), // tenant-scoped unique vendor code (auto-generated)
    name: text("name").notNull(),
    legalName: text("legal_name"),
    gstin: text("gstin"),
    pan: text("pan"),
    msmeNumber: text("msme_number"),
    contactPerson: text("contact_person"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    pincode: text("pincode"),
    country: text("country").notNull().default("IN"),
    paymentTerms: text("payment_terms"), // e.g. "Net 30"
    bankAccount: jsonb("bank_account").$type<{
      accountNumber?: string;
      ifsc?: string;
      accountHolder?: string;
      bankName?: string;
    }>(),
    // Rating averaged across PO closures — 0–5 scaled to integer 0–500
    ratingScaled: integer("rating_scaled").notNull().default(0),
    ratingCount: integer("rating_count").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("vendors_tenant_idx").on(t.tenantId),
    tenantNameIdx: index("vendors_tenant_name_idx").on(t.tenantId, t.name),
    gstinIdx: index("vendors_gstin_idx").on(t.gstin),
  }),
);

export type Vendor = typeof vendors.$inferSelect;
export type NewVendor = typeof vendors.$inferInsert;
