import { pgTable, uuid, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * Per-tenant outbound WhatsApp configuration ("bring your own WhatsApp number").
 *
 * Mirrors `tenant_mail_settings` exactly — each tenant plugs in their OWN
 * WhatsApp Business credentials so approval / receipt notifications send from
 * THEIR number, with no server env change or redeploy. Secrets (the provider
 * access token and the Meta app secret used to verify inbound webhooks) are
 * stored ENCRYPTED (AES-256-GCM, see lib/crypto.ts) and never returned to the
 * browser — only `hasApiToken` / `hasAppSecret` flags are surfaced.
 *
 * Supported providers (resolved + dispatched in whatsapp.service.ts):
 *   - "meta_cloud" (default) — Meta WhatsApp Cloud API. `phoneNumberId` is the
 *     Cloud API phone-number id; `apiTokenCipher` holds the permanent access token.
 *   - "gupshup"   — `phoneNumberId` doubles as the Gupshup app name; the token is
 *     the Gupshup API key; `fromNumber` is the registered source number.
 *   - "twilio"    — `phoneNumberId` doubles as the Twilio Account SID; the token is
 *     the Twilio Auth Token; `fromNumber` is the WhatsApp-enabled sender (E.164).
 *
 * One row per tenant (tenant_id is unique). When a tenant has no usable row,
 * whatsapp.service treats every send as a graceful no-op (logged).
 */
export const tenantWhatsappSettings = pgTable(
  "tenant_whatsapp_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .unique()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** "meta_cloud" | "gupshup" | "twilio" */
    provider: text("provider").notNull().default("meta_cloud"),
    /** Meta Cloud phone-number id (or Gupshup app name / Twilio Account SID — see header). */
    phoneNumberId: text("phone_number_id"),
    /** Encrypted access token / API key / auth token (ivB64:tagB64:dataB64). Null = none stored. */
    apiTokenCipher: text("api_token_cipher"),
    /** Sender number shown to recipients, E.164 (e.g. "+919876543210" / "whatsapp:+1..."). */
    fromNumber: text("from_number"),
    /**
     * Encrypted Meta App Secret — used to verify the X-Hub-Signature-256 on inbound
     * webhook POSTs. Optional; inbound approve-from-WhatsApp stays guarded either way.
     */
    appSecretCipher: text("app_secret_cipher"),
    /**
     * Webhook verify token (the handshake string the admin also pastes into the
     * provider dashboard). Used to answer the GET subscribe challenge and to map an
     * inbound verification request back to this tenant. Not a hard secret — stored plain.
     */
    verifyToken: text("verify_token"),
    isActive: boolean("is_active").notNull().default(true),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    lastTestOk: boolean("last_test_ok"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("tenant_whatsapp_settings_tenant_idx").on(t.tenantId),
    phoneNumberIdx: index("tenant_whatsapp_settings_phone_idx").on(t.phoneNumberId),
  }),
);

export type TenantWhatsappSettings = typeof tenantWhatsappSettings.$inferSelect;
export type NewTenantWhatsappSettings = typeof tenantWhatsappSettings.$inferInsert;
