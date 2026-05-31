import { z } from "zod";

export const salesInvoiceStatusSchema = z.enum([
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "cancelled",
]);
export type SalesInvoiceStatus = z.infer<typeof salesInvoiceStatusSchema>;

/** Rolled up from receipt allocations against the invoice. */
export const salesInvoicePaymentStatusSchema = z.enum(["unpaid", "partial", "paid"]);
export type SalesInvoicePaymentStatus = z.infer<typeof salesInvoicePaymentStatusSchema>;

export const salesInvoiceItemInputSchema = z.object({
  soItemId: z.string().uuid().optional().nullable(),
  itemId: z.string().uuid().optional().nullable(),
  itemName: z.string().trim().min(1, "Item name is required").max(200),
  hsnCode: z.string().max(20).optional().nullable(),
  uom: z.string().trim().min(1, "UOM is required").max(20),
  quantity: z.number().positive("Quantity must be greater than zero"),
  unitPrice: z.number().nonnegative("Unit price cannot be negative"),
  discountPercent: z.number().min(0).max(100, "Discount cannot exceed 100%").default(0),
  /** Whole-percent GST rate (e.g. 18, 12, 5). Outward GST is computed server-side. */
  taxRate: z.number().min(0).max(100, "Tax cannot exceed 100%").default(18),
});
export type SalesInvoiceItemInput = z.infer<typeof salesInvoiceItemInputSchema>;

export const salesInvoiceCreateSchema = z.object({
  companyId: z.string().uuid("Please select a company"),
  unitId: z.string().uuid("Please select a unit"),
  customerId: z.string().uuid("Please select a customer"),
  soId: z.string().uuid().optional().nullable(),
  invoiceDate: z.string().date("Please pick an invoice date"),
  /** Optional explicit due date; otherwise derived from the customer's credit days. */
  dueDate: z.string().date().optional().nullable(),
  isInterstate: z.boolean().default(false),
  placeOfSupply: z.string().max(20).optional().nullable(),
  freightCharges: z.number().nonnegative().default(0),
  otherCharges: z.number().nonnegative().default(0),
  roundOff: z.number().default(0),
  remarks: z.string().trim().max(1000).optional().nullable().or(z.literal("")),
  items: z.array(salesInvoiceItemInputSchema).min(1, "Add at least one line"),
});
export type SalesInvoiceCreateInput = z.infer<typeof salesInvoiceCreateSchema>;

export const salesInvoiceUpdateSchema = salesInvoiceCreateSchema.partial();
export type SalesInvoiceUpdateInput = z.infer<typeof salesInvoiceUpdateSchema>;

/** Record a customer receipt against one or more invoices (AR). */
export const salesReceiptAllocationInputSchema = z.object({
  salesInvoiceId: z.string().uuid().optional().nullable(),
  soId: z.string().uuid().optional().nullable(),
  amount: z.number().positive("Allocation amount must be greater than zero"),
});
export type SalesReceiptAllocationInput = z.infer<typeof salesReceiptAllocationInputSchema>;

export const salesReceiptMethodSchema = z.enum(["neft", "rtgs", "cheque", "upi", "cash"]);
export type SalesReceiptMethod = z.infer<typeof salesReceiptMethodSchema>;

export const salesReceiptCreateSchema = z.object({
  companyId: z.string().uuid().optional().nullable(),
  unitId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid("Please select a customer"),
  receiptDate: z.string().date("Please pick a receipt date"),
  method: salesReceiptMethodSchema,
  amount: z.number().positive("Receipt amount must be greater than zero"),
  reference: z.string().trim().max(80).optional().nullable().or(z.literal("")),
  remarks: z.string().trim().max(1000).optional().nullable().or(z.literal("")),
  allocations: z.array(salesReceiptAllocationInputSchema).default([]),
});
export type SalesReceiptCreateInput = z.infer<typeof salesReceiptCreateSchema>;

export const salesInvoiceListItemSchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.string().nullable(),
  status: salesInvoiceStatusSchema,
  paymentStatus: salesInvoicePaymentStatusSchema,
  customerId: z.string().uuid(),
  customerName: z.string().nullable(),
  soId: z.string().uuid().nullable(),
  soNumber: z.string().nullable(),
  invoiceDate: z.string().datetime(),
  dueDate: z.string().datetime().nullable(),
  totalPaise: z.string(),
  amountPaidPaise: z.string(),
  itemsCount: z.number(),
  createdAt: z.string().datetime(),
});
export type SalesInvoiceListItem = z.infer<typeof salesInvoiceListItemSchema>;

/** One customer's outstanding receivables split into ageing buckets (paise strings). */
export const arAgingRowSchema = z.object({
  customerId: z.string().uuid(),
  customerName: z.string().nullable(),
  bucket0to30Paise: z.string(),
  bucket31to60Paise: z.string(),
  bucket61to90Paise: z.string(),
  bucket90PlusPaise: z.string(),
  totalOutstandingPaise: z.string(),
  invoiceCount: z.number(),
});
export type ArAgingRow = z.infer<typeof arAgingRowSchema>;
