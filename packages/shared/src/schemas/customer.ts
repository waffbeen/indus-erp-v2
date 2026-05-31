import { z } from "zod";
import { gstinSchema, panSchema } from "./vendor";

/**
 * Customer master — the sell-side mirror of the vendor schema. Reuses the same
 * GSTIN/PAN validators so buy-side and sell-side parties validate identically.
 */
export const customerCreateSchema = z.object({
  name: z.string().trim().min(2, "Customer name must be at least 2 characters").max(120, "Name is too long (max 120)"),
  legalName: z.string().trim().max(120, "Legal name is too long").optional().nullable().or(z.literal("")),
  gstin: gstinSchema,
  pan: panSchema,
  contactPerson: z.string().trim().max(80).optional().nullable().or(z.literal("")),
  email: z.string().trim().email("Please enter a valid email").optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(20).optional().nullable().or(z.literal("")),
  billingAddress: z.string().trim().max(500).optional().nullable().or(z.literal("")),
  shippingAddress: z.string().trim().max(500).optional().nullable().or(z.literal("")),
  city: z.string().trim().max(80).optional().nullable().or(z.literal("")),
  state: z.string().trim().max(80).optional().nullable().or(z.literal("")),
  pincode: z.string().trim().max(10).optional().nullable().or(z.literal("")),
  /** Default credit period — drives the sales-invoice due date. */
  creditDays: z.number().int().min(0).max(365, "Credit period feels unrealistic").default(0),
  /** Optional hard credit limit in ₹ (stored as paise). */
  creditLimit: z.number().nonnegative().optional().nullable(),
  paymentTerms: z.string().trim().max(80).optional().nullable().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().nullable().or(z.literal("")),
});
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;

export const customerUpdateSchema = customerCreateSchema.partial();
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

export const customerListItemSchema = z.object({
  id: z.string().uuid(),
  code: z.string().nullable(),
  name: z.string(),
  gstin: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  creditDays: z.number(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
});
export type CustomerListItem = z.infer<typeof customerListItemSchema>;
