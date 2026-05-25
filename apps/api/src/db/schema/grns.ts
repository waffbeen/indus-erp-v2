import { pgTable, uuid, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { companies } from "./companies";
import { units } from "./units";
import { vendors } from "./vendors";
import { items } from "./items";
import { users } from "./users";
import { purchaseOrders, poItems } from "./po";
import { gateEntries } from "./gate_entries";

export const grns = pgTable(
  "grns",
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
    poId: uuid("po_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "restrict" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    gateEntryId: uuid("gate_entry_id").references(() => gateEntries.id, { onDelete: "set null" }),
    receivedByUserId: uuid("received_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    grnNumber: text("grn_number"),
    status: text("status", {
      enum: ["draft", "submitted", "qc_pending", "accepted", "partially_accepted", "rejected", "cancelled"],
    }).notNull().default("submitted"),

    invoiceNumber: text("invoice_number"),
    invoiceDate: timestamp("invoice_date", { mode: "date" }),
    invoiceAmountPaise: text("invoice_amount_paise"),
    receivedDate: timestamp("received_date", { mode: "date" }).notNull(),
    remarks: text("remarks"),

    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("grns_tenant_idx").on(t.tenantId),
    tenantStatusIdx: index("grns_tenant_status_idx").on(t.tenantId, t.status),
    poIdx: index("grns_po_idx").on(t.poId),
    vendorIdx: index("grns_vendor_idx").on(t.vendorId),
    numberIdx: index("grns_number_idx").on(t.tenantId, t.grnNumber),
  }),
);

export type Grn = typeof grns.$inferSelect;
export type NewGrn = typeof grns.$inferInsert;

export const grnItems = pgTable(
  "grn_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    grnId: uuid("grn_id")
      .notNull()
      .references(() => grns.id, { onDelete: "cascade" }),
    poItemId: uuid("po_item_id").references(() => poItems.id, { onDelete: "set null" }),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    itemName: text("item_name").notNull(),
    uom: text("uom").notNull(),
    orderedQuantityScaled: integer("ordered_quantity_scaled").notNull().default(0),
    receivedQuantityScaled: integer("received_quantity_scaled").notNull(),
    acceptedQuantityScaled: integer("accepted_quantity_scaled").notNull(),
    rejectedQuantityScaled: integer("rejected_quantity_scaled").notNull().default(0),
    unitPricePaise: text("unit_price_paise").notNull().default("0"),
    condition: text("condition", { enum: ["good", "damaged", "shortage", "excess"] })
      .notNull()
      .default("good"),
    remarks: text("remarks"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    grnIdx: index("grn_items_grn_idx").on(t.grnId),
    poItemIdx: index("grn_items_po_item_idx").on(t.poItemId),
  }),
);

export type GrnItem = typeof grnItems.$inferSelect;
export type NewGrnItem = typeof grnItems.$inferInsert;
