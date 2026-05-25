import { pgTable, uuid, text, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { companies } from "./companies";
import { units } from "./units";
import { roles } from "./roles";

/**
 * A Membership joins a User to a Tenant with a specific Role and (optional)
 * Company/Unit scope. One user can have multiple memberships (e.g. roles in
 * different units), but for MVP we expect mostly 1:1.
 *
 * `enabledModules` lets the Tenant Admin further restrict which modules a
 * user sees, beyond what their role grants — addresses the user's pain
 * point #33 (button-level RBAC).
 */
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "cascade" }),
    isTenantAdmin: boolean("is_tenant_admin").notNull().default(false),
    // Override module visibility — if empty array, inherit from role / tenant
    enabledModules: jsonb("enabled_modules").$type<string[]>().notNull().default([]),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    status: text("status", { enum: ["active", "invited", "suspended"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("memberships_tenant_idx").on(t.tenantId),
    userIdx: index("memberships_user_idx").on(t.userId),
    tenantUserIdx: index("memberships_tenant_user_idx").on(t.tenantId, t.userId),
  }),
);

export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
