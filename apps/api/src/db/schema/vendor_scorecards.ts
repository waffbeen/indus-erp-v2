import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { vendors } from "./vendors";

/**
 * Vendor scorecard snapshots. The live numbers are computed on demand from PO +
 * GRN history (see vendor-scorecard.service), but each `getScorecards` run also
 * upserts a snapshot here so we have a cheap history of supplier performance
 * over time (and a fallback when the live computation is heavy).
 *
 * Percentages are stored as integers 0–100. `priceIndex` is an integer where
 * 100 = at the cross-vendor item average (<100 cheaper, >100 dearer).
 */
export const vendorScorecards = pgTable(
  "vendor_scorecards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),

    poCount: integer("po_count").notNull().default(0),
    grnCount: integer("grn_count").notNull().default(0),
    totalOrderedPaise: text("total_ordered_paise").notNull().default("0"),

    onTimePct: integer("on_time_pct"),
    qualityPct: integer("quality_pct"),
    priceIndex: integer("price_index"),
    responsivenessPct: integer("responsiveness_pct"),
    avgLeadTimeDays: integer("avg_lead_time_days"),
    overallScore: integer("overall_score").notNull().default(0),
    grade: text("grade", { enum: ["A", "B", "C", "D"] }).notNull().default("C"),

    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("vendor_scorecards_tenant_idx").on(t.tenantId),
    vendorIdx: index("vendor_scorecards_vendor_idx").on(t.tenantId, t.vendorId),
  }),
);

export type VendorScorecardRow = typeof vendorScorecards.$inferSelect;
export type NewVendorScorecardRow = typeof vendorScorecards.$inferInsert;
