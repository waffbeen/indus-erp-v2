import { z } from "zod";

/**
 * E-Invoice (IRN / signed QR) contracts shared FE↔BE.
 *
 * Generation is sourced from an existing document (a PO today, a sales invoice
 * later). The backend builds the GST e-invoice JSON (schema v1.1), calls the
 * IRP/GSP behind an `IrpClient` interface, and persists the IRN + QR. The full
 * payload/response shapes are intentionally loose `record`s — we don't want the
 * UI coupled to every NIC field.
 */

export const eInvoiceSourceTypeSchema = z.enum(["po", "sales_invoice"]);
export type EInvoiceSourceType = z.infer<typeof eInvoiceSourceTypeSchema>;

export const eInvoiceStatusSchema = z.enum(["pending", "generated", "cancelled", "failed"]);
export type EInvoiceStatus = z.infer<typeof eInvoiceStatusSchema>;

/** Build (preview) or generate an e-invoice from a source document. */
export const eInvoiceGenerateSchema = z.object({
  sourceType: eInvoiceSourceTypeSchema.default("po"),
  sourceId: z.string().uuid("A valid source document id is required"),
});
export type EInvoiceGenerateInput = z.infer<typeof eInvoiceGenerateSchema>;

/**
 * Cancel an IRN. The IRP allows two reason codes: 1 = Duplicate,
 * 2 = Data entry mistake. A short remark is required.
 */
export const eInvoiceCancelSchema = z.object({
  reason: z.enum(["1", "2"]).default("2"),
  remark: z.string().trim().min(1, "A cancellation remark is required").max(100),
});
export type EInvoiceCancelInput = z.infer<typeof eInvoiceCancelSchema>;

/** List row (safe for the browser). */
export const eInvoiceListItemSchema = z.object({
  id: z.string(),
  sourceType: eInvoiceSourceTypeSchema,
  sourceId: z.string(),
  docNumber: z.string().nullable(),
  irn: z.string().nullable(),
  ackNo: z.string().nullable(),
  ackDate: z.string().nullable(),
  status: eInvoiceStatusSchema,
  errorMsg: z.string().nullable(),
  createdAt: z.string(),
});
export type EInvoiceListItem = z.infer<typeof eInvoiceListItemSchema>;

export const eInvoiceViewSchema = eInvoiceListItemSchema.extend({
  signedQrBase64: z.string().nullable(),
  requestJson: z.record(z.unknown()).nullable(),
  responseJson: z.record(z.unknown()).nullable(),
  cancelReason: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type EInvoiceView = z.infer<typeof eInvoiceViewSchema>;
