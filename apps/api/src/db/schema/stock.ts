import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { companies } from "./companies";
import { units } from "./units";
import { items } from "./items";
import { users } from "./users";

/**
 * Append-only stock-movement ledger. ON-HAND quantity for any (item, unit,
 * batch) is the running sum of qty_scaled across rows — we never UPDATE,
 * just INSERT another row with a positive or negative qty.
 *
 * Why a ledger and not a stock_levels table:
 *   - History is preserved without a separate audit table.
 *   - Reversing a wrong movement = insert the inverse row; no destructive
 *     updates and the audit trail stays accurate.
 *   - Per-batch tracking falls out for free when batch_number is set.
 *
 * Movement sources:
 *   - grn        : GRN accepted -> positive
 *   - issue      : material issued / consumed -> negative
 *   - transfer   : warehouse -> warehouse (two rows, equal magnitude)
 *   - adjustment : manual correction (positive or negative)
 *   - opening    : opening balance at tenant onboarding (positive)
 */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),

    /** "grn" | "issue" | "transfer_in" | "transfer_out" | "adjustment" | "opening". */
    sourceType: text("source_type").notNull(),
    /** ID of the GRN / issue / etc. that produced this movement. Nullable for opening / adjustment. */
    sourceId: uuid("source_id"),
    /** Optional human-readable reference (e.g. "ISSUE-2026-0042"). */
    sourceRef: text("source_ref"),

    /** Signed quantity in milli-units (×1000 for 3-decimal precision). Positive = in, negative = out. */
    qtyScaled: integer("qty_scaled").notNull(),
    /** Snapshot of UoM so historical movements remain readable if the item master is later edited. */
    uom: text("uom").notNull(),
    /** Unit price at the time of movement (for valuation) — paise stored as text for bigint safety. */
    unitPricePaise: text("unit_price_paise").notNull().default("0"),

    /** Batch tracking — populated when the tenant has settings.grn.batchMode on, else null. */
    batchNumber: text("batch_number"),
    mfgDate: timestamp("mfg_date", { mode: "date" }),
    expiryDate: timestamp("expiry_date", { mode: "date" }),

    remarks: text("remarks"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("stock_movements_tenant_idx").on(t.tenantId),
    itemIdx: index("stock_movements_item_idx").on(t.itemId, t.unitId),
    sourceIdx: index("stock_movements_source_idx").on(t.sourceType, t.sourceId),
    createdAtIdx: index("stock_movements_created_at_idx").on(t.createdAt),
  }),
);

export type StockMovement = typeof stockMovements.$inferSelect;
export type NewStockMovement = typeof stockMovements.$inferInsert;
