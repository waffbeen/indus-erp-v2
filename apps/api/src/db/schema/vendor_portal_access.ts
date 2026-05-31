import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { vendors } from "./vendors";

/**
 * Opaque-token access for the PUBLIC vendor/supplier portal.
 *
 * A tenant admin issues a token for one of their vendors; the vendor opens
 * `/portal/<token>` (a non-tenant public page) and sees ONLY that vendor's
 * POs + open RFQs. The token resolves to { tenantId, vendorId } — every
 * portal read/write is constrained to that pair, so the request body can
 * never widen the scope. Mirrors the invites opaque-token pattern.
 */
export const vendorPortalAccess = pgTable(
  "vendor_portal_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    /** Opaque random token used in the public portal URL. */
    token: text("token").notNull().unique(),
    /** Coarse capability scope — reserved for future ("rfq", "po", "full"). */
    scope: text("scope").notNull().default("full"),
    /** Null = never expires. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenIdx: index("vendor_portal_access_token_idx").on(t.token),
    tenantIdx: index("vendor_portal_access_tenant_idx").on(t.tenantId),
    vendorIdx: index("vendor_portal_access_vendor_idx").on(t.tenantId, t.vendorId),
  }),
);

export type VendorPortalAccess = typeof vendorPortalAccess.$inferSelect;
export type NewVendorPortalAccess = typeof vendorPortalAccess.$inferInsert;
