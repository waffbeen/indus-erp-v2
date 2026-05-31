import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * E-Invoices (IRN / signed QR) generated against a source document.
 *
 * The Indian e-invoicing flow: we build a GST e-invoice JSON (schema v1.1) from
 * a source doc (a PO today, a sales invoice later), POST it to the IRP/GSP, and
 * get back an Invoice Reference Number (IRN), acknowledgement no/date and a
 * digitally-signed QR code. We persist both the request payload and the IRP
 * response so the document is fully auditable and the QR can be re-rendered.
 *
 * `status` lifecycle: pending → generated → cancelled (or failed on error).
 * Soft-deleted via deletedAt like every other business table.
 */
export const eInvoices = pgTable(
  "e_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** What this e-invoice was generated from. */
    sourceType: text("source_type", { enum: ["po", "sales_invoice"] }).notNull(),
    /** Id of the source PO / sales invoice (no FK — source table varies by type). */
    sourceId: uuid("source_id").notNull(),
    /** The human document number captured at generation (PO number, etc.). */
    docNumber: text("doc_number"),

    /** Invoice Reference Number returned by the IRP (64-char hash). */
    irn: text("irn"),
    /** IRP acknowledgement number + date. */
    ackNo: text("ack_no"),
    ackDate: timestamp("ack_date", { withTimezone: true }),
    /** Base64 of the digitally-signed QR code string (rendered on the invoice). */
    signedQrBase64: text("signed_qr_base64"),

    status: text("status", { enum: ["pending", "generated", "cancelled", "failed"] })
      .notNull()
      .default("pending"),

    /** The e-invoice JSON we sent (schema v1.1) and the IRP's raw response. */
    requestJson: jsonb("request_json").$type<Record<string, unknown>>(),
    responseJson: jsonb("response_json").$type<Record<string, unknown>>(),
    errorMsg: text("error_msg"),

    /** Cancellation audit (IRN can be cancelled within 24h on the real IRP). */
    cancelReason: text("cancel_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),

    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("e_invoices_tenant_idx").on(t.tenantId),
    tenantStatusIdx: index("e_invoices_tenant_status_idx").on(t.tenantId, t.status),
    sourceIdx: index("e_invoices_source_idx").on(t.tenantId, t.sourceType, t.sourceId),
    irnIdx: index("e_invoices_irn_idx").on(t.irn),
  }),
);

export type EInvoice = typeof eInvoices.$inferSelect;
export type NewEInvoice = typeof eInvoices.$inferInsert;
