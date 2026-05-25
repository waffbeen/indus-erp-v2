import { pgTable, uuid, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { companies } from "./companies";
import { units } from "./units";
import { vendors } from "./vendors";
import { items } from "./items";
import { users } from "./users";
import { purchaseOrders } from "./po";

export const gateEntries = pgTable(
  "gate_entries",
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
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    gateEntryNumber: text("gate_entry_number"),
    type: text("type", { enum: ["inward", "outward", "service"] }).notNull().default("inward"),
    status: text("status", { enum: ["open", "closed", "cancelled"] }).notNull().default("open"),

    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    poId: uuid("po_id").references(() => purchaseOrders.id, { onDelete: "set null" }),

    vehicleNumber: text("vehicle_number"),
    driverName: text("driver_name"),
    driverPhone: text("driver_phone"),
    invoiceNumber: text("invoice_number"),
    invoiceDate: timestamp("invoice_date", { mode: "date" }),
    remarks: text("remarks"),

    gateInAt: timestamp("gate_in_at", { withTimezone: true }).notNull().defaultNow(),
    gateOutAt: timestamp("gate_out_at", { withTimezone: true }),

    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("gate_entries_tenant_idx").on(t.tenantId),
    tenantStatusIdx: index("gate_entries_tenant_status_idx").on(t.tenantId, t.status),
    vendorIdx: index("gate_entries_vendor_idx").on(t.vendorId),
    poIdx: index("gate_entries_po_idx").on(t.poId),
    numberIdx: index("gate_entries_number_idx").on(t.tenantId, t.gateEntryNumber),
    gateInIdx: index("gate_entries_gate_in_idx").on(t.gateInAt),
  }),
);

export type GateEntry = typeof gateEntries.$inferSelect;
export type NewGateEntry = typeof gateEntries.$inferInsert;

export const gateEntryItems = pgTable(
  "gate_entry_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gateEntryId: uuid("gate_entry_id")
      .notNull()
      .references(() => gateEntries.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    itemName: text("item_name").notNull(),
    description: text("description"),
    quantityScaled: integer("quantity_scaled").notNull(),
    uom: text("uom").notNull().default("nos"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    gateEntryIdx: index("gate_entry_items_ge_idx").on(t.gateEntryId),
  }),
);

export type GateEntryItem = typeof gateEntryItems.$inferSelect;
export type NewGateEntryItem = typeof gateEntryItems.$inferInsert;
