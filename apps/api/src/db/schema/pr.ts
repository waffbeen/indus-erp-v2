import { pgTable, uuid, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { companies } from "./companies";
import { units } from "./units";
import { departments } from "./departments";
import { users } from "./users";
import { items } from "./items";

/**
 * Purchase Requisition header.
 * - Amounts stored as paise (integer) to avoid float drift.
 * - prNumber is tenant-scoped, formatted like "PR-2026-00251" — generated on submit.
 */
export const purchaseRequisitions = pgTable(
  "purchase_requisitions",
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
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    prNumber: text("pr_number"), // null until submitted; filled by service
    title: text("title").notNull(),
    description: text("description"),
    priority: text("priority", { enum: ["low", "normal", "high", "urgent"] })
      .notNull()
      .default("normal"),

    /** Type of requisition — drives approval routing and reporting. */
    prType: text("pr_type", {
      enum: ["stock", "job_specific", "capex", "amc", "maintenance", "service", "other"],
    })
      .notNull()
      .default("stock"),

    /** External / business reference (client PO, work order no, etc). */
    referenceNo: text("reference_no"),

    /** Buyer responsible for executing this PR (often different from requester). */
    buyerUserId: uuid("buyer_user_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status", {
      enum: [
        "draft",
        "submitted",
        "pending_l1",
        "pending_l2",
        "escalated",
        "approved",
        "rejected",
        "cancelled",
        "converted_to_po",
      ],
    })
      .notNull()
      .default("draft"),

    estimatedTotalPaise: text("estimated_total_paise").notNull().default("0"),
    currency: text("currency").notNull().default("INR"),

    neededBy: timestamp("needed_by", { withTimezone: true, mode: "date" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),

    // Snapshot of approval matrix at submit-time (so changes to config don't
    // affect in-flight PRs).
    approvalChain: jsonb("approval_chain")
      .$type<Array<{ level: number; roleKey?: string; userId?: string; status: string }>>()
      .notNull()
      .default([]),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("pr_tenant_idx").on(t.tenantId),
    tenantStatusIdx: index("pr_tenant_status_idx").on(t.tenantId, t.status),
    requesterIdx: index("pr_requester_idx").on(t.requesterId),
    prNumberIdx: index("pr_number_idx").on(t.tenantId, t.prNumber),
    createdAtIdx: index("pr_created_at_idx").on(t.createdAt),
  }),
);

export type PurchaseRequisition = typeof purchaseRequisitions.$inferSelect;
export type NewPurchaseRequisition = typeof purchaseRequisitions.$inferInsert;

export const prItems = pgTable(
  "pr_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    prId: uuid("pr_id")
      .notNull()
      .references(() => purchaseRequisitions.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    itemName: text("item_name").notNull(),
    description: text("description"),

    /** Snapshot fields from items master at request time. */
    itemGroupName: text("item_group_name"),
    itemSubGroupName: text("item_sub_group_name"),
    hsnCode: text("hsn_code"),

    quantityScaled: integer("quantity_scaled").notNull(), // qty * 1000 (3-decimal)
    uom: text("uom").notNull().default("nos"),
    stockUnit: text("stock_unit"),
    purchaseUnit: text("purchase_unit"),

    estimatedUnitPricePaise: text("estimated_unit_price_paise"),
    estimatedTotalPaise: text("estimated_total_paise").notNull().default("0"),

    /** Historical hint shown to requester — last purchased rate for this item. */
    lastPurchaseRatePaise: text("last_purchase_rate_paise"),
    lastPurchaseDate: timestamp("last_purchase_date", { mode: "date" }),

    expectedDeliveryDate: timestamp("expected_delivery_date", { mode: "date" }),

    /** Line-level narration — distinct from PR.description (header) and notes (internal). */
    itemNarration: text("item_narration"),
    notes: text("notes"),

    /** Per-line buyer override (else inherit PR.buyerUserId). */
    lineBuyerUserId: uuid("line_buyer_user_id").references(() => users.id, { onDelete: "set null" }),

    /** Industry-specific specs snapshot (GSM, sizes, density for paper; voltage/rating for electrical, etc). */
    specifications: jsonb("specifications").$type<Record<string, unknown>>().default({}),

    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    prIdx: index("pr_items_pr_idx").on(t.prId),
  }),
);

export type PrItem = typeof prItems.$inferSelect;
export type NewPrItem = typeof prItems.$inferInsert;
