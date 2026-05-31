import { pgTable, uuid, text, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { vendors } from "./vendors";
import { items } from "./items";
import { purchaseOrders } from "./po";

/**
 * RFQ (Request for Quotation) — the sourcing step that sits BEFORE a PO.
 * A buyer drafts an RFQ with line items, invites a set of vendors, collects
 * their quotes (entered internally or via the public vendor portal), compares
 * them side-by-side, then AWARDS one vendor — which spins up a draft PO.
 *
 * Money is paise (text, big-int safe). Quantities are scaled ×1000.
 * Header rows carry tenantId + deletedAt; child rows are reached through the
 * tenant-scoped parent (rfqs) so we never leak across tenants.
 */
export const rfqs = pgTable(
  "rfqs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Tenant-scoped human-readable number, e.g. RFQ-2026-00001. */
    rfqNumber: text("rfq_number"),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", {
      enum: ["draft", "sent", "closed", "awarded", "cancelled"],
    })
      .notNull()
      .default("draft"),
    /** Quote submission deadline shown to vendors. */
    dueDate: timestamp("due_date", { mode: "date" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Set on award — the winning vendor + the draft PO we created from it. */
    awardedVendorId: uuid("awarded_vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    awardedPoId: uuid("awarded_po_id").references(() => purchaseOrders.id, { onDelete: "set null" }),
    awardedAt: timestamp("awarded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("rfqs_tenant_idx").on(t.tenantId),
    tenantStatusIdx: index("rfqs_tenant_status_idx").on(t.tenantId, t.status),
    numberIdx: index("rfqs_number_idx").on(t.tenantId, t.rfqNumber),
  }),
);

export type Rfq = typeof rfqs.$inferSelect;
export type NewRfq = typeof rfqs.$inferInsert;

/** Line items requested in the RFQ. itemId is optional (free-text allowed). */
export const rfqItems = pgTable(
  "rfq_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rfqId: uuid("rfq_id")
      .notNull()
      .references(() => rfqs.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    itemName: text("item_name").notNull(),
    description: text("description"),
    quantityScaled: integer("quantity_scaled").notNull(),
    uom: text("uom").notNull().default("nos"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    rfqIdx: index("rfq_items_rfq_idx").on(t.rfqId),
  }),
);

export type RfqItem = typeof rfqItems.$inferSelect;
export type NewRfqItem = typeof rfqItems.$inferInsert;

/** Vendors invited to quote on an RFQ. */
export const rfqVendors = pgTable(
  "rfq_vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rfqId: uuid("rfq_id")
      .notNull()
      .references(() => rfqs.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    rfqIdx: index("rfq_vendors_rfq_idx").on(t.rfqId),
    uniqRfqVendor: uniqueIndex("rfq_vendors_uniq_idx").on(t.rfqId, t.vendorId),
  }),
);

export type RfqVendor = typeof rfqVendors.$inferSelect;
export type NewRfqVendor = typeof rfqVendors.$inferInsert;

/** A vendor's quote against an RFQ (one row per vendor per RFQ). */
export const rfqResponses = pgTable(
  "rfq_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Denormalised for direct tenant-scoped queries + portal-write safety. */
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    rfqId: uuid("rfq_id")
      .notNull()
      .references(() => rfqs.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["draft", "submitted", "withdrawn"] })
      .notNull()
      .default("submitted"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    /** Quote grand total in paise (sum of line unitPrice × qty). */
    totalPaise: text("total_paise").notNull().default("0"),
    remarks: text("remarks"),
    /** True when entered by a buyer internally vs. submitted via vendor portal. */
    viaPortal: integer("via_portal").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    rfqIdx: index("rfq_responses_rfq_idx").on(t.rfqId),
    vendorIdx: index("rfq_responses_vendor_idx").on(t.vendorId),
    uniqRfqVendor: uniqueIndex("rfq_responses_uniq_idx").on(t.rfqId, t.vendorId),
  }),
);

export type RfqResponse = typeof rfqResponses.$inferSelect;
export type NewRfqResponse = typeof rfqResponses.$inferInsert;

/** Per-line pricing inside a vendor's quote. */
export const rfqResponseItems = pgTable(
  "rfq_response_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    responseId: uuid("response_id")
      .notNull()
      .references(() => rfqResponses.id, { onDelete: "cascade" }),
    rfqItemId: uuid("rfq_item_id")
      .notNull()
      .references(() => rfqItems.id, { onDelete: "cascade" }),
    unitPricePaise: text("unit_price_paise").notNull().default("0"),
    /** Promised lead time in days for this line. */
    deliveryDays: integer("delivery_days"),
    remarks: text("remarks"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    responseIdx: index("rfq_response_items_response_idx").on(t.responseId),
    rfqItemIdx: index("rfq_response_items_rfq_item_idx").on(t.rfqItemId),
  }),
);

export type RfqResponseItem = typeof rfqResponseItems.$inferSelect;
export type NewRfqResponseItem = typeof rfqResponseItems.$inferInsert;
