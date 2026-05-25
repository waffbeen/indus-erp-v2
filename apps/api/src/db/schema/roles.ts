import { pgTable, uuid, text, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * Roles are scoped to a tenant (so each tenant can have custom roles).
 * `isSystem` flag marks the 6 seeded roles (tenant_admin, procurement, etc.) —
 * tenant admins can clone but not delete those.
 *
 * Permissions are stored inline as a JSONB array of { resource, action, scope }
 * triples — fast to read, simple to update via the role editor UI.
 */
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    key: text("key").notNull(), // e.g. "tenant_admin", or "custom_mumbai_approver_5L"
    name: text("name").notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    permissions: jsonb("permissions")
      .$type<Array<{ resource: string; action: string; scope: string }>>()
      .notNull()
      .default([]),
    // Optional spend cap for approver-type roles
    approvalCap: text("approval_cap"), // string for big-integer safety, parsed to BigInt in app
    // Module visibility — array of MODULE_KEYS; empty = inherit tenant's enabled modules
    moduleKeys: jsonb("module_keys").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("roles_tenant_idx").on(t.tenantId),
    tenantKeyUniq: index("roles_tenant_key_idx").on(t.tenantId, t.key),
  }),
);

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
