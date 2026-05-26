import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { companies } from "./companies";
import { units } from "./units";
import { vendors } from "./vendors";
import { items } from "./items";
import { users } from "./users";
import { purchaseRequisitions, prItems } from "./pr";

export const purchaseOrders = pgTable(
  "purchase_orders",
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
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    prId: uuid("pr_id").references(() => purchaseRequisitions.id, { onDelete: "set null" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    poNumber: text("po_number"),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", {
      enum: [
        "draft",
        "pending_approval",
        "approved",
        "sent_to_vendor",
        "partially_received",
        "received",
        "closed",
        "cancelled",
      ],
    })
      .notNull()
      .default("draft"),

    /** Inter-state vs intra-state — drives IGST vs CGST+SGST split. */
    isInterstate: boolean("is_interstate").notNull().default(false),
    /** Place of supply (state code, e.g. "27" for Maharashtra). Required for GST e-invoice. */
    placeOfSupply: text("place_of_supply"),

    /** Financial breakup — all in paise. */
    subtotalPaise: text("subtotal_paise").notNull().default("0"),
    discountTotalPaise: text("discount_total_paise").notNull().default("0"),
    taxableAmountPaise: text("taxable_amount_paise").notNull().default("0"),
    cgstTotalPaise: text("cgst_total_paise").notNull().default("0"),
    sgstTotalPaise: text("sgst_total_paise").notNull().default("0"),
    igstTotalPaise: text("igst_total_paise").notNull().default("0"),
    taxTotalPaise: text("tax_total_paise").notNull().default("0"),
    freightChargesPaise: text("freight_charges_paise").notNull().default("0"),
    otherChargesPaise: text("other_charges_paise").notNull().default("0"),
    roundOffPaise: text("round_off_paise").notNull().default("0"),
    totalPaise: text("total_paise").notNull().default("0"),
    currency: text("currency").notNull().default("INR"),

    /** Vendor & delivery terms. */
    deliveryDate: timestamp("delivery_date", { mode: "date" }),
    validUntil: timestamp("valid_until", { mode: "date" }),
    deliveryAddress: text("delivery_address"),
    deliveryTerms: text("delivery_terms"), // "FOR Mumbai", "Ex-works", "CIF Nhava Sheva"
    paymentTerms: text("payment_terms"),    // "Net 30", "50% advance", etc.
    termsAndConditions: text("terms_and_conditions"),
    notes: text("notes"),

    /**
     * Legacy parity — header dropdowns / fields the buyer often fills.
     * All nullable so existing rows stay valid.
     */
    poType: text("po_type"), // "capex" | "opex" | "amc" | "service" | "trading" | "import" | "other"
    forDelivery: text("for_delivery"), // "Ex Works" | "FOR Plant" | "CIF" | "Annexure"
    /** Days the vendor can take to invoice/get paid. */
    creditPeriodDays: integer("credit_period_days"),
    /** Plaintext clauses printed on the PO. Free-form. */
    insuranceTerms: text("insurance_terms"),
    penaltyTerms: text("penalty_terms"),
    packingTerms: text("packing_terms"),

    /** PO revision support — parent + revision number, optional remark. */
    parentPoId: uuid("parent_po_id"),
    revisionNo: integer("revision_no").notNull().default(0),
    revisionRemark: text("revision_remark"),

    approvalChain: jsonb("approval_chain")
      .$type<Array<{ level: number; roleKey?: string; userId?: string; status: string }>>()
      .notNull()
      .default([]),

    sentToVendorAt: timestamp("sent_to_vendor_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("po_tenant_idx").on(t.tenantId),
    tenantStatusIdx: index("po_tenant_status_idx").on(t.tenantId, t.status),
    vendorIdx: index("po_vendor_idx").on(t.vendorId),
    poNumberIdx: index("po_number_idx").on(t.tenantId, t.poNumber),
    createdAtIdx: index("po_created_at_idx").on(t.createdAt),
  }),
);

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type NewPurchaseOrder = typeof purchaseOrders.$inferInsert;

export const poItems = pgTable(
  "po_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    poId: uuid("po_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    prItemId: uuid("pr_item_id").references(() => prItems.id, { onDelete: "set null" }),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    itemName: text("item_name").notNull(),
    description: text("description"),

    /** Item master snapshot — names/codes preserved even if master is later edited. */
    itemGroupName: text("item_group_name"),
    itemSubGroupName: text("item_sub_group_name"),
    hsnCode: text("hsn_code"),

    quantityScaled: integer("quantity_scaled").notNull(),
    uom: text("uom").notNull().default("nos"),
    unitPricePaise: text("unit_price_paise").notNull(),

    /** Per-line discount (percent OR absolute). Either may be 0. */
    discountPercent: integer("discount_percent").notNull().default(0), // 0–100 (× 100 for two decimals if needed later)
    discountAmountPaise: text("discount_amount_paise").notNull().default("0"),

    /** GST: stored as overall rate. CGST/SGST split happens at PO header level via isInterstate flag. */
    taxRate: integer("tax_rate").notNull().default(18),
    cgstRate: integer("cgst_rate").notNull().default(0),
    sgstRate: integer("sgst_rate").notNull().default(0),
    igstRate: integer("igst_rate").notNull().default(0),

    /** Computed amounts (paise). */
    subtotalPaise: text("subtotal_paise").notNull(),         // qty × unit price (before discount)
    taxableAmountPaise: text("taxable_amount_paise").notNull().default("0"), // subtotal − discount
    taxPaise: text("tax_paise").notNull(),                   // total tax (CGST+SGST or IGST)
    cgstPaise: text("cgst_paise").notNull().default("0"),
    sgstPaise: text("sgst_paise").notNull().default("0"),
    igstPaise: text("igst_paise").notNull().default("0"),
    totalPaise: text("total_paise").notNull(),               // final line total inc. tax

    /** Vendor's committed delivery for this line (can vary by line). */
    committedDeliveryDate: timestamp("committed_delivery_date", { mode: "date" }),

    /**
     * Per-line buyer assignment — the procurement user responsible for
     * executing this specific line. Legacy ERP requires this per row; we
     * keep it nullable so historical data and small-shop tenants work.
     */
    lineBuyerUserId: uuid("line_buyer_user_id").references(() => users.id, { onDelete: "set null" }),

    /** Allowed over/under-supply on receipt (e.g. 5 = ±5%). */
    tolerancePercent: integer("tolerance_percent").notNull().default(0),
    /** Vendor warranty in months for this item — printed on PO and recalled at GRN. */
    warrantyMonths: integer("warranty_months").notNull().default(0),
    /** Forecast / safety-stock purchase flag (different from job-specific). */
    isForStock: integer("is_for_stock").notNull().default(0), // 0/1 boolean stored as int for legacy compat
    /** Item to be returned to vendor as recovered/exchanged — affects costing rules. */
    isRecoveryRate: integer("is_recovery_rate").notNull().default(0),

    /** Line-level narration — separate from header notes. */
    itemNarration: text("item_narration"),
    notes: text("notes"),

    /** Specifications snapshot (paper GSM, voltage, etc.). */
    specifications: jsonb("specifications").$type<Record<string, unknown>>().default({}),

    /**
     * Split-delivery plan — for cases when a single PO line is delivered in
     * multiple drops. Each entry: { qtyScaled: integer, deliveryDate: ISO date }.
     * Sum of qtyScaled should equal the line's quantityScaled. Empty array
     * means single delivery on committedDeliveryDate. Mirrors legacy
     * largeModalSchedule + ScheduleGrid.
     */
    deliverySchedule: jsonb("delivery_schedule")
      .$type<Array<{ qtyScaled: number; deliveryDate: string }>>()
      .notNull()
      .default([]),

    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    poIdx: index("po_items_po_idx").on(t.poId),
  }),
);

export type PoItem = typeof poItems.$inferSelect;
export type NewPoItem = typeof poItems.$inferInsert;
