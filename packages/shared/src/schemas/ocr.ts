import { z } from "zod";

/**
 * Document AI — invoice OCR. The client uploads a scanned/photographed vendor
 * bill (base64); the server runs the tenant's vision-capable model and returns
 * the extracted fields to PREFILL the vendor-invoice form. Nothing is persisted
 * by this endpoint — the user reviews and saves the invoice themselves.
 */

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"] as const;

export const ocrInvoiceRequestSchema = z.object({
  /** Raw base64 of the file (no `data:` prefix). Kept under the API's 2 MB JSON
   *  body limit (~2M base64 chars ≈ 1.5 MB raw); the client downscales images
   *  before upload so photos comfortably fit. */
  fileBase64: z.string().min(16, "File looks empty").max(2_000_000, "File is too large — use a smaller image or PDF"),
  mimeType: z.enum(ALLOWED_MIME, {
    errorMap: () => ({ message: "Upload a PNG, JPG, WEBP or PDF" }),
  }),
});
export type OcrInvoiceRequest = z.infer<typeof ocrInvoiceRequestSchema>;

export const ocrLineItemSchema = z.object({
  description: z.string(),
  hsnCode: z.string().nullable(),
  quantity: z.number().nullable(),
  unitPrice: z.number().nullable(),
  amount: z.number().nullable(),
});
export type OcrLineItem = z.infer<typeof ocrLineItemSchema>;

export const ocrInvoiceResultSchema = z.object({
  /** False when no AI key is configured — UI shows a "set up AI" hint. */
  configured: z.boolean(),
  /** True when extraction produced at least the invoice number or a line. */
  extracted: z.boolean(),
  vendorName: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  /** ISO date string (YYYY-MM-DD) when the model could parse one. */
  invoiceDate: z.string().nullable(),
  lineItems: z.array(ocrLineItemSchema),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  total: z.number().nullable(),
  /** Provider that did the extraction, for transparency. */
  provider: z.string().nullable(),
  /** Human-readable note (e.g. why nothing was extracted). */
  message: z.string().nullable(),
});
export type OcrInvoiceResult = z.infer<typeof ocrInvoiceResultSchema>;
