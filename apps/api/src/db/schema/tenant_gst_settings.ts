import { pgTable, uuid, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * Per-tenant GST / GSP (GST Suvidha Provider) credentials — the "bring your own
 * GSP account" config used to call the e-invoice (IRP), e-way-bill and GSTIN
 * lookup APIs on the tenant's behalf.
 *
 * Mirrors the tenant_ai_settings / tenant_mail_settings pattern: the GSP/portal
 * password is stored ENCRYPTED (AES-256-GCM, see lib/crypto.ts) and never
 * returned to the browser — only a `hasPassword` flag + the GSTIN are surfaced.
 * When a tenant has no active row, the compliance services fall back to the
 * built-in SANDBOX/stub client so the flows still demo end-to-end.
 *
 * One row per tenant (tenant_id is unique).
 */
export const tenantGstSettings = pgTable(
  "tenant_gst_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .unique()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** GSP / IRP provider — "nic_sandbox" | "masters_india" | "cleartax". */
    provider: text("provider").notNull().default("nic_sandbox"),
    /** GSP API username / client id. */
    username: text("username"),
    /** Encrypted GSP password / API secret (ivB64:tagB64:dataB64). Null = none stored. */
    passwordCipher: text("password_cipher"),
    /** The GSTIN this tenant transacts under (15-char). Drives SellerDtls on the e-invoice. */
    gstin: text("gstin"),
    isActive: boolean("is_active").notNull().default(true),
    /** Outcome of the last connection test. */
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    lastTestOk: boolean("last_test_ok"),
    lastTestMessage: text("last_test_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("tenant_gst_settings_tenant_idx").on(t.tenantId),
  }),
);

export type TenantGstSettings = typeof tenantGstSettings.$inferSelect;
export type NewTenantGstSettings = typeof tenantGstSettings.$inferInsert;
