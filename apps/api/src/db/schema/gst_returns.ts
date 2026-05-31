import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * GST return summaries — a generated snapshot of a tenant's return for a tax
 * period. We don't file with the portal here; we compute the figures from the
 * tenant's own books (outward from sales, ITC from vendor invoices) and store
 * the summary so it can be reviewed, exported and compared against GSTR-2B.
 *
 * `period` is "YYYY-MM". `type` is gstr1 (outward), gstr3b (summary return) or
 * gstr2b (the auto-drafted inward statement we reconcile against). One logical
 * row per tenant + period + type (re-generating upserts the summary).
 */
export const gstReturns = pgTable(
  "gst_returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Tax period, "YYYY-MM" (e.g. "2026-05"). */
    period: text("period").notNull(),
    type: text("type", { enum: ["gstr1", "gstr3b", "gstr2b"] }).notNull(),

    /** draft (computed, not filed) | generated | filed. */
    status: text("status").notNull().default("generated"),

    /** The computed figures — shape depends on `type` (see gst-return.service). */
    summaryJson: jsonb("summary_json").$type<Record<string, unknown>>(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),

    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("gst_returns_tenant_idx").on(t.tenantId),
    periodIdx: index("gst_returns_period_idx").on(t.tenantId, t.period, t.type),
  }),
);

export type GstReturn = typeof gstReturns.$inferSelect;
export type NewGstReturn = typeof gstReturns.$inferInsert;
