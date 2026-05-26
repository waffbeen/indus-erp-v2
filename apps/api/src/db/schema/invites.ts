import { pgTable, uuid, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { roles } from "./roles";

/**
 * Outstanding invitations. Created by a tenant admin; accepted by the invitee
 * via a shareable token URL.
 *
 * Why not email + signup separately:
 *   - During testing we don't have outbound email yet, so we hand the admin
 *     the invite link to share manually (Slack/WhatsApp/etc.).
 *   - When email is wired in, the same row drives the email — token + URL
 *     don't change.
 */
export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Opaque random token used in the public accept URL. */
    token: text("token").notNull().unique(),
    email: text("email").notNull(),
    fullName: text("full_name"),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    /** Whether the invitee should land as a tenant admin once they accept. */
    isTenantAdmin: boolean("is_tenant_admin").notNull().default(false),
    invitedByUserId: uuid("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("invites_tenant_idx").on(t.tenantId),
    tokenIdx: index("invites_token_idx").on(t.token),
    emailIdx: index("invites_email_idx").on(t.tenantId, t.email),
  }),
);

export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;
