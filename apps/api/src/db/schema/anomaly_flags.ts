import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * Procurement anomaly flags raised by the spend-integrity scan
 * (anomaly.service). Append-only-ish: a re-scan soft-deletes the prior `open`
 * flags and inserts fresh ones, but flags a user has `dismissed` are preserved
 * so we don't keep re-surfacing something they've already judged.
 *
 * `detail` holds structured evidence (amounts in paise, related ids, pct, …)
 * so the feed can render specifics without re-querying.
 */
export const anomalyFlags = pgTable(
  "anomaly_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    kind: text("kind", {
      enum: ["price_spike", "split_po", "duplicate_invoice", "round_amount"],
    }).notNull(),
    severity: text("severity", { enum: ["low", "medium", "high"] }).notNull().default("low"),
    status: text("status", { enum: ["open", "dismissed"] }).notNull().default("open"),

    title: text("title").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),

    /** What the flag points at — "po" | "vendor_invoice" | "vendor" | "item". */
    resourceType: text("resource_type"),
    resourceId: uuid("resource_id"),
    /** Stable hash of (kind + resource + key facts) so re-scans can de-dupe. */
    fingerprint: text("fingerprint"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("anomaly_flags_tenant_idx").on(t.tenantId),
    tenantStatusIdx: index("anomaly_flags_tenant_status_idx").on(t.tenantId, t.status),
    fingerprintIdx: index("anomaly_flags_fingerprint_idx").on(t.tenantId, t.fingerprint),
  }),
);

export type AnomalyFlagRow = typeof anomalyFlags.$inferSelect;
export type NewAnomalyFlagRow = typeof anomalyFlags.$inferInsert;
