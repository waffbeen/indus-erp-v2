import { pgTable, uuid, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { eInvoices } from "./e_invoices";

/**
 * E-Way Bills — the transport document required when goods above a threshold
 * value move between locations. Often generated off the back of an e-invoice
 * (the IRN can auto-populate the EWB), so we keep an optional link to the
 * e_invoices row plus the transporter / vehicle details and validity.
 *
 * Same stubbed-client approach as e-invoices: validity (validUpto) is derived
 * from the distance (~1 day per 200 km, min 1 day). `status` lifecycle:
 * pending → generated → cancelled (or failed).
 */
export const eWayBills = pgTable(
  "e_way_bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    sourceType: text("source_type", { enum: ["po", "sales_invoice"] }).notNull().default("po"),
    /** Source PO / sales invoice id (no FK — source table varies by type). */
    sourceId: uuid("source_id").notNull(),
    /** Optional link to the e-invoice this EWB was raised against. */
    eInvoiceId: uuid("e_invoice_id").references(() => eInvoices.id, { onDelete: "set null" }),

    /** E-Way Bill number returned by the EWB system (12-digit). */
    ewbNo: text("ewb_no"),
    transporterId: text("transporter_id"),
    transporterName: text("transporter_name"),
    /** Mode of transport: road | rail | air | ship. */
    transMode: text("trans_mode"),
    vehicleNo: text("vehicle_no"),
    /** Approximate distance in km — drives validity. */
    distanceKm: integer("distance_km").notNull().default(0),
    validUpto: timestamp("valid_upto", { withTimezone: true }),

    status: text("status", { enum: ["pending", "generated", "cancelled", "failed"] })
      .notNull()
      .default("pending"),

    requestJson: jsonb("request_json").$type<Record<string, unknown>>(),
    responseJson: jsonb("response_json").$type<Record<string, unknown>>(),
    errorMsg: text("error_msg"),

    cancelReason: text("cancel_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),

    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("e_way_bills_tenant_idx").on(t.tenantId),
    tenantStatusIdx: index("e_way_bills_tenant_status_idx").on(t.tenantId, t.status),
    sourceIdx: index("e_way_bills_source_idx").on(t.tenantId, t.sourceType, t.sourceId),
    ewbNoIdx: index("e_way_bills_ewb_no_idx").on(t.ewbNo),
  }),
);

export type EWayBill = typeof eWayBills.$inferSelect;
export type NewEWayBill = typeof eWayBills.$inferInsert;
