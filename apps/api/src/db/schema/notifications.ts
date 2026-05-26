import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * In-app notifications. One row per user × event.
 * Examples of "kind":
 *   - pr_submitted              -> approver gets notified to review
 *   - pr_approved               -> requester gets notified
 *   - pr_rejected               -> requester gets notified
 *   - pr_sent_back              -> requester gets notified to revise
 *   - po_submitted              -> approver gets notified to review
 *   - po_approved               -> creator gets notified
 *   - po_sent_to_vendor         -> creator + buyer get notified
 *   - grn_raised                -> PO creator gets notified
 *   - grn_cancelled             -> PO creator gets notified
 *   - user_invited              -> the invited user (once they accept)
 *   - amendment_recorded        -> PO creator + buyer get notified
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** The recipient who sees the bell badge. */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    /** Helps the FE build a click-through link without hardcoding URLs. */
    resourceType: text("resource_type"), // "pr" | "po" | "grn" | "user"
    resourceId: uuid("resource_id"),
    /** Optional structured payload (e.g. { prNumber, vendorName }). */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("notifications_user_idx").on(t.userId, t.readAt),
    tenantIdx: index("notifications_tenant_idx").on(t.tenantId),
    createdIdx: index("notifications_created_idx").on(t.createdAt),
  }),
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
