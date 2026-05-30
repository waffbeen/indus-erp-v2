import { z } from "zod";

export const vendorInvoiceStatusSchema = z.enum([
  "draft",
  "matched",
  "price_variance",
  "qty_variance",
  "unmatched",
  "approved",
  "cancelled",
]);
export type VendorInvoiceStatus = z.infer<typeof vendorInvoiceStatusSchema>;

/** Result of the 3-way match — PO price × GRN qty vs the invoice. */
export const matchStatusSchema = z.enum(["unmatched", "matched", "price_variance", "qty_variance"]);
export type MatchStatus = z.infer<typeof matchStatusSchema>;

/** Rolled up from payment allocations against the invoice. */
export const invoicePaymentStatusSchema = z.enum(["unpaid", "partial", "paid"]);
export type InvoicePaymentStatus = z.infer<typeof invoicePaymentStatusSchema>;

export const vendorInvoiceItemInputSchema = z.object({
  poItemId: z.string().uuid().optional().nullable(),
  grnItemId: z.string().uuid().optional().nullable(),
  itemId: z.string().uuid().optional().nullable(),
  itemName: z.string().trim().min(1, "Item name is required").max(200),
  uom: z.string().trim().min(1, "UOM is required").max(20),
  quantity: z.number().positive("Quantity must be greater than zero"),
  unitPrice: z.number().nonnegative("Unit price cannot be negative"),
  /** Tax for this line in rupees (already computed on the UI). */
  tax: z.number().nonnegative().default(0),
});
export type VendorInvoiceItemInput = z.infer<typeof vendorInvoiceItemInputSchema>;

export const vendorInvoiceCreateSchema = z.object({
  companyId: z.string().uuid("Please select a company"),
  unitId: z.string().uuid("Please select a unit"),
  vendorId: z.string().uuid("Please select a vendor"),
  poId: z.string().uuid().optional().nullable(),
  grnId: z.string().uuid().optional().nullable(),
  invoiceNumber: z.string().trim().min(1, "Invoice number is required").max(60),
  invoiceDate: z.string().date("Please pick an invoice date"),
  remarks: z.string().trim().max(1000).optional().nullable().or(z.literal("")),
  items: z.array(vendorInvoiceItemInputSchema).min(1, "Add at least one line"),
});
export type VendorInvoiceCreateInput = z.infer<typeof vendorInvoiceCreateSchema>;

/** Header/line edit — only allowed while the invoice is still a draft. */
export const vendorInvoiceUpdateSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(60).optional(),
  invoiceDate: z.string().date().optional(),
  remarks: z.string().trim().max(1000).optional().nullable().or(z.literal("")),
  items: z.array(vendorInvoiceItemInputSchema).min(1).optional(),
});
export type VendorInvoiceUpdateInput = z.infer<typeof vendorInvoiceUpdateSchema>;

/** Approve a matched invoice (or force-approve a variance with the override flag). */
export const vendorInvoiceApproveSchema = z.object({
  overrideVariance: z.boolean().default(false),
  remarks: z.string().trim().max(500).optional().nullable().or(z.literal("")),
});
export type VendorInvoiceApproveInput = z.infer<typeof vendorInvoiceApproveSchema>;

export const vendorInvoiceListItemSchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.string(),
  status: vendorInvoiceStatusSchema,
  matchStatus: matchStatusSchema,
  paymentStatus: invoicePaymentStatusSchema,
  vendorId: z.string().uuid(),
  vendorName: z.string().nullable(),
  poId: z.string().uuid().nullable(),
  poNumber: z.string().nullable(),
  grnId: z.string().uuid().nullable(),
  invoiceDate: z.string().datetime(),
  totalPaise: z.string(),
  amountPaidPaise: z.string(),
  itemsCount: z.number(),
  createdAt: z.string().datetime(),
});
export type VendorInvoiceListItem = z.infer<typeof vendorInvoiceListItemSchema>;
