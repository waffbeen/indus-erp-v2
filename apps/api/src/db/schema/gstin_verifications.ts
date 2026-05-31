import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * GSTIN verification cache — the result of looking a GSTIN up against the
 * government / GSP taxpayer API. We cache per tenant + GSTIN so repeated checks
 * (vendor onboarding, e-invoice pre-flight) don't re-hit the API, and so the
 * legal/trade name + registration status are available offline.
 *
 * `status` is the taxpayer status reported by the portal ("Active",
 * "Cancelled", …) or "format_valid" when only a regex check was done (stub).
 */
export const gstinVerifications = pgTable(
  "gstin_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    gstin: text("gstin").notNull(),
    legalName: text("legal_name"),
    tradeName: text("trade_name"),
    /** Taxpayer status from the portal, or "format_valid" / "invalid" (stub). */
    status: text("status"),

    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }).notNull().defaultNow(),
    responseJson: jsonb("response_json").$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("gstin_verifications_tenant_idx").on(t.tenantId),
    tenantGstinIdx: index("gstin_verifications_tenant_gstin_idx").on(t.tenantId, t.gstin),
  }),
);

export type GstinVerification = typeof gstinVerifications.$inferSelect;
export type NewGstinVerification = typeof gstinVerifications.$inferInsert;
