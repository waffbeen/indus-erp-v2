import { pgTable, uuid, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * Per-tenant outbound email (SMTP) configuration.
 *
 * Each tenant can plug in their OWN mailbox (host / port / credentials / from
 * address) so notifications send from their domain — no server env change or
 * redeploy. The SMTP password is stored ENCRYPTED (AES-256-GCM, lib/crypto.ts)
 * and never returned to the browser. When a tenant has no row, mail.service
 * falls back to the platform SMTP/Resend env config.
 *
 * One row per tenant (tenant_id is unique).
 */
export const tenantMailSettings = pgTable(
  "tenant_mail_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .unique()
      .references(() => tenants.id, { onDelete: "cascade" }),
    host: text("host"),
    port: integer("port").notNull().default(587),
    secure: boolean("secure").notNull().default(false), // true for 465, false for 587/STARTTLS
    username: text("username"),
    /** Encrypted SMTP password (ivB64:tagB64:dataB64). Null = none stored. */
    passwordCipher: text("password_cipher"),
    /** From address, e.g. "Acme ERP <noreply@acme.in>" or a plain email. */
    fromAddress: text("from_address"),
    isActive: boolean("is_active").notNull().default(true),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    lastTestOk: boolean("last_test_ok"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("tenant_mail_settings_tenant_idx").on(t.tenantId),
  }),
);

export type TenantMailSettings = typeof tenantMailSettings.$inferSelect;
export type NewTenantMailSettings = typeof tenantMailSettings.$inferInsert;
