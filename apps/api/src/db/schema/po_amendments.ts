import { pgTable, uuid, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { purchaseOrders } from "./po";
import { users } from "./users";

/**
 * PO amendment trail — every "amend" action after the PO is approved adds a row.
 * Lets the team see who changed what and why, with a counter badge on the PO page.
 *
 * Distinct from approval_actions (workflow events) and audit_logs (system-wide).
 * Amendments are a first-class business concept for post-approval edits.
 */
export const poAmendments = pgTable(
  "po_amendments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    poId: uuid("po_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    /** 1, 2, 3… increment per PO. Lets us label "Amendment #3". */
    amendmentNo: integer("amendment_no").notNull(),
    /** Short title for the change (e.g. "Rate revision", "Quantity update"). */
    summary: text("summary").notNull(),
    /** Free-form reason — why the amendment was raised. */
    remark: text("remark"),
    /** Optional structured snapshot of changed fields. */
    changedFields: jsonb("changed_fields").$type<Record<string, unknown>>().default({}),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    poIdx: index("po_amendments_po_idx").on(t.poId),
    tenantIdx: index("po_amendments_tenant_idx").on(t.tenantId),
  }),
);

export type PoAmendment = typeof poAmendments.$inferSelect;
export type NewPoAmendment = typeof poAmendments.$inferInsert;
