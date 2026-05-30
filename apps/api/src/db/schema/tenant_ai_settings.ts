import { pgTable, uuid, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * Per-tenant AI provider configuration ("bring your own key").
 *
 * Each tenant can store their OWN AI provider + API key here so the assistant
 * works for them without any server env change or redeploy — a new client just
 * enters their key in Settings and it takes effect immediately. The key is
 * stored ENCRYPTED (AES-256-GCM, see lib/crypto.ts); only the last 4 chars are
 * ever returned to the UI. When a tenant has no row / no key, the service falls
 * back to a platform-level key from the environment (GEMINI/GOOGLE/ANTHROPIC).
 *
 * One row per tenant (tenant_id is unique).
 */
export const tenantAiSettings = pgTable(
  "tenant_ai_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .unique()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** "gemini" | "anthropic" | "openai" */
    provider: text("provider").notNull().default("gemini"),
    /** Encrypted API key (ivB64:tagB64:dataB64). Null = no tenant key set yet. */
    apiKeyCipher: text("api_key_cipher"),
    /** Last 4 chars of the key for a masked display ("…ending 1234"). */
    apiKeyLast4: text("api_key_last4"),
    /** Optional model override (e.g. "gemini-2.0-flash"). Null = provider default. */
    model: text("model"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("tenant_ai_settings_tenant_idx").on(t.tenantId),
  }),
);

export type TenantAiSettings = typeof tenantAiSettings.$inferSelect;
export type NewTenantAiSettings = typeof tenantAiSettings.$inferInsert;
