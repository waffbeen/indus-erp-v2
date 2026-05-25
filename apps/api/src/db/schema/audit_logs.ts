import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * Audit log — append-only, fixes legacy pain point #20/#30
 * (incomplete audit trail). Every mutating action lands here:
 *   actor + action + resource + before + after + timestamp.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: text("actor_email"), // captured at log-time in case user is later deleted
    action: text("action").notNull(), // "create" | "update" | "delete" | "approve" | etc.
    resourceType: text("resource_type").notNull(), // "pr" | "po" | "vendor" | ...
    resourceId: uuid("resource_id"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    before: jsonb("before").$type<Record<string, unknown>>(),
    after: jsonb("after").$type<Record<string, unknown>>(),
    diff: jsonb("diff").$type<Record<string, unknown>>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("audit_logs_tenant_idx").on(t.tenantId),
    resourceIdx: index("audit_logs_resource_idx").on(t.resourceType, t.resourceId),
    actorIdx: index("audit_logs_actor_idx").on(t.actorUserId),
    createdAtIdx: index("audit_logs_created_at_idx").on(t.createdAt),
  }),
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
