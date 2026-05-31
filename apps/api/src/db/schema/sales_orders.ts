import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { companies } from "./companies";
import { units } from "./units";
import { customers } from "./customers";
import { items } from "./items";
import { users } from "./users";

/**
 * Sales Orders — the sell-side mirror of `purchase_orders`. A confirmed order
 * FROM a customer. Same GST machinery (CGST/SGST vs IGST driven by the
 * inter-state flag), same money-in-paise / qty-×1000 conventions, same
 * draft → pending_approval → approved lifecycle. Fulfilment replaces receipt:
 * approved → partially_fulfilled → fulfilled as goods ship out, then closed.
 */
export const salesOrders = pgTable(
  "sales_orders",
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
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    soNumber: text("so_number"),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", {
      enum: [
        "draft",
        "pending_approval",
        "approved",
        "partially_fulfilled",
        "fulfilled",
        "closed",
        "cancelled",
      ],
    })
      .notNull()
      .default("draft"),

    /** Customer's own PO/reference number (the buyer's paperwork on their side). */
    customerPoNumber: text("customer_po_number"),

    /** Inter-state vs intra-state — drives IGST vs CGST+SGST split. */
    isInterstate: boolean("is_interstate").notNull().default(false),
    /** Place of supply (state code, e.g. "27" for Maharashtra). */
    placeOfSupply: text("place_of_supply"),

    /** Financial breakup — all in paise (text for big-int safety). */
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

    /** Order & delivery terms. */
    expectedShipDate: timestamp("expected_ship_date", { mode: "date" }),
    validUntil: timestamp("valid_until", { mode: "date" }),
    shippingAddress: text("shipping_address"),
    billingAddress: text("billing_address"),
    deliveryTerms: text("delivery_terms"), // "FOR Mumbai", "Ex-works", "CIF Nhava Sheva"
    paymentTerms: text("payment_terms"),    // "Net 30", "50% advance", etc.
    termsAndConditions: text("terms_and_conditions"),
    notes: text("notes"),

    approvalChain: jsonb("approval_chain")
      .$type<Array<{ level: number; roleKey?: string; userId?: string; status: string }>>()
      .notNull()
      .default([]),

    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("sales_orders_tenant_idx").on(t.tenantId),
    tenantStatusIdx: index("sales_orders_tenant_status_idx").on(t.tenantId, t.status),
    customerIdx: index("sales_orders_customer_idx").on(t.customerId),
    numberIdx: index("sales_orders_number_idx").on(t.tenantId, t.soNumber),
    createdAtIdx: index("sales_orders_created_at_idx").on(t.createdAt),
  }),
);

export type SalesOrder = typeof salesOrders.$inferSelect;
export type NewSalesOrder = typeof salesOrders.$inferInsert;

export const salesOrderItems = pgTable(
  "sales_order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    soId: uuid("so_id")
      .notNull()
      .references(() => salesOrders.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    itemName: text("item_name").notNull(),
    description: text("description"),

    /** Item master snapshot — preserved even if the master is later edited. */
    itemGroupName: text("item_group_name"),
    itemSubGroupName: text("item_sub_group_name"),
    hsnCode: text("hsn_code"),

    quantityScaled: integer("quantity_scaled").notNull(),
    uom: text("uom").notNull().default("nos"),
    unitPricePaise: text("unit_price_paise").notNull(),

    /** Per-line discount (whole percent). */
    discountPercent: integer("discount_percent").notNull().default(0),
    discountAmountPaise: text("discount_amount_paise").notNull().default("0"),

    /** GST: overall rate; CGST/SGST split decided at header level via isInterstate. */
    taxRate: integer("tax_rate").notNull().default(18),
    cgstRate: integer("cgst_rate").notNull().default(0),
    sgstRate: integer("sgst_rate").notNull().default(0),
    igstRate: integer("igst_rate").notNull().default(0),

    /** Computed amounts (paise). */
    subtotalPaise: text("subtotal_paise").notNull(),          // qty × unit price (before discount)
    taxableAmountPaise: text("taxable_amount_paise").notNull().default("0"), // subtotal − discount
    taxPaise: text("tax_paise").notNull(),                    // total tax (CGST+SGST or IGST)
    cgstPaise: text("cgst_paise").notNull().default("0"),
    sgstPaise: text("sgst_paise").notNull().default("0"),
    igstPaise: text("igst_paise").notNull().default("0"),
    totalPaise: text("total_paise").notNull(),                // final line total inc. tax

    /** Quantity already shipped/fulfilled against this line (scaled ×1000). */
    fulfilledQtyScaled: integer("fulfilled_qty_scaled").notNull().default(0),

    /** Committed ship date for this line. */
    committedDeliveryDate: timestamp("committed_delivery_date", { mode: "date" }),

    itemNarration: text("item_narration"),
    notes: text("notes"),
    specifications: jsonb("specifications").$type<Record<string, unknown>>().default({}),

    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    soIdx: index("sales_order_items_so_idx").on(t.soId),
  }),
);

export type SalesOrderItem = typeof salesOrderItems.$inferSelect;
export type NewSalesOrderItem = typeof salesOrderItems.$inferInsert;
