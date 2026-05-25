import { pgTable, uuid, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * Generic approval workflow engine — works for PRs, POs, and (future)
 * GRNs, CAPEX, etc. Each approval is tied to a resource by (type, id).
 *
 * `approvalMatrix` is per-tenant config that determines which roles need to
 * approve at which spend tier. Snapshotted onto the PR/PO at submit time
 * (see `approvalChain` column on each).
 */
export const approvalMatrix = pgTable(
  "approval_matrix",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    resourceType: text("resource_type", { enum: ["pr", "po", "grn", "capex"] }).notNull(),
    // Spend tier in paise; null = catch-all for everything above the highest tier
    minPaise: text("min_paise").notNull().default("0"),
    maxPaise: text("max_paise"),
    // Ordered chain of approver role keys
    chain: jsonb("chain")
      .$type<Array<{ level: number; roleKey: string; escalateAfterHours?: number }>>()
      .notNull()
      .default([]),
    isActive: integer("is_active").notNull().default(1), // boolean as int for tri-state if needed
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantTypeIdx: index("approval_matrix_tenant_type_idx").on(t.tenantId, t.resourceType),
  }),
);

export type ApprovalMatrix = typeof approvalMatrix.$inferSelect;
export type NewApprovalMatrix = typeof approvalMatrix.$inferInsert;

/**
 * Individual approval actions — append-only log of every approve/reject/etc.
 * The full history shows "Suresh raised → Priya approved L1 → Ramesh approved L2".
 */
export const approvalActions = pgTable(
  "approval_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    resourceType: text("resource_type", { enum: ["pr", "po", "grn", "capex"] }).notNull(),
    resourceId: uuid("resource_id").notNull(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    actorRoleKey: text("actor_role_key"),
    level: integer("level"),
    action: text("action", {
      enum: ["submit", "approve", "reject", "request_changes", "escalate", "cancel"],
    }).notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    resourceIdx: index("approval_actions_resource_idx").on(t.resourceType, t.resourceId),
    tenantIdx: index("approval_actions_tenant_idx").on(t.tenantId),
  }),
);

export type ApprovalAction = typeof approvalActions.$inferSelect;
export type NewApprovalAction = typeof approvalActions.$inferInsert;
