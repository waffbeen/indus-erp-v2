import { z } from "zod";

export const paymentMethodSchema = z.enum(["neft", "rtgs", "cheque", "upi", "cash"]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const paymentStatusSchema = z.enum(["draft", "posted", "cancelled"]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

/**
 * One allocation line. Settle an invoice (vendorInvoiceId) OR pay an advance
 * against a PO (poId). Exactly one of the two should be set; an allocation with
 * neither is treated as an on-account advance.
 */
export const paymentAllocationInputSchema = z.object({
  vendorInvoiceId: z.string().uuid().optional().nullable(),
  poId: z.string().uuid().optional().nullable(),
  amount: z.number().positive("Allocation amount must be greater than zero"),
});
export type PaymentAllocationInput = z.infer<typeof paymentAllocationInputSchema>;

export const paymentCreateSchema = z.object({
  companyId: z.string().uuid().optional().nullable(),
  unitId: z.string().uuid().optional().nullable(),
  vendorId: z.string().uuid("Please select a vendor"),
  paymentDate: z.string().date("Please pick a payment date"),
  method: paymentMethodSchema,
  amount: z.number().positive("Payment amount must be greater than zero"),
  reference: z.string().trim().max(80).optional().nullable().or(z.literal("")),
  remarks: z.string().trim().max(1000).optional().nullable().or(z.literal("")),
  allocations: z.array(paymentAllocationInputSchema).default([]),
});
export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;

export const paymentListItemSchema = z.object({
  id: z.string().uuid(),
  paymentNumber: z.string().nullable(),
  vendorId: z.string().uuid(),
  vendorName: z.string().nullable(),
  paymentDate: z.string().datetime(),
  method: paymentMethodSchema,
  amountPaise: z.string(),
  allocatedPaise: z.string(),
  status: paymentStatusSchema,
  reference: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type PaymentListItem = z.infer<typeof paymentListItemSchema>;

/** One vendor's outstanding payables split into ageing buckets (paise strings). */
export const apAgingRowSchema = z.object({
  vendorId: z.string().uuid(),
  vendorName: z.string().nullable(),
  bucket0to30Paise: z.string(),
  bucket31to60Paise: z.string(),
  bucket61to90Paise: z.string(),
  bucket90PlusPaise: z.string(),
  totalOutstandingPaise: z.string(),
  invoiceCount: z.number(),
});
export type ApAgingRow = z.infer<typeof apAgingRowSchema>;
