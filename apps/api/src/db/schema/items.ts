import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: text("code"), // tenant-scoped item code
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    itemGroupName: text("item_group_name"),
    itemSubGroupName: text("item_sub_group_name"),
    uom: text("uom").notNull().default("nos"), // primary unit of measure
    stockUnit: text("stock_unit"),    // unit used in inventory (often same as uom)
    purchaseUnit: text("purchase_unit"), // unit used when buying (e.g. box, where uom=pcs)
    conversionFactor: integer("conversion_factor").notNull().default(1), // purchaseUnit × factor = stockUnit qty
    hsnCode: text("hsn_code"),
    defaultTaxRate: integer("default_tax_rate").notNull().default(18), // GST %
    specifications: jsonb("item_specifications").$type<Record<string, unknown>>().default({}),
    // Last known prices — informational
    lastPurchasePricePaise: text("last_purchase_price_paise"),
    standardPricePaise: text("standard_price_paise"),
    isStocked: boolean("is_stocked").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    isAsset: boolean("is_asset").notNull().default(false), // CAPEX vs OPEX
    isService: boolean("is_service").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("items_tenant_idx").on(t.tenantId),
    tenantNameIdx: index("items_tenant_name_idx").on(t.tenantId, t.name),
    tenantCodeIdx: index("items_tenant_code_idx").on(t.tenantId, t.code),
  }),
);

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
