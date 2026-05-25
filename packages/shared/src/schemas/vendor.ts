import { z } from "zod";

export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, "Invalid GSTIN format")
  .optional()
  .nullable()
  .or(z.literal(""));

export const panSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Invalid PAN format")
  .optional()
  .nullable()
  .or(z.literal(""));

export const vendorCreateSchema = z.object({
  name: z.string().trim().min(2, "Vendor name must be at least 2 characters").max(120, "Name is too long (max 120)"),
  legalName: z.string().trim().max(120, "Legal name is too long").optional().nullable().or(z.literal("")),
  gstin: gstinSchema,
  pan: panSchema,
  msmeNumber: z.string().trim().max(50).optional().nullable().or(z.literal("")),
  contactPerson: z.string().trim().max(80).optional().nullable().or(z.literal("")),
  email: z.string().trim().email("Please enter a valid email").optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(20).optional().nullable().or(z.literal("")),
  address: z.string().trim().max(500).optional().nullable().or(z.literal("")),
  city: z.string().trim().max(80).optional().nullable().or(z.literal("")),
  state: z.string().trim().max(80).optional().nullable().or(z.literal("")),
  pincode: z.string().trim().max(10).optional().nullable().or(z.literal("")),
  paymentTerms: z.string().trim().max(80).optional().nullable().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().nullable().or(z.literal("")),
});
export type VendorCreateInput = z.infer<typeof vendorCreateSchema>;

export const vendorUpdateSchema = vendorCreateSchema.partial();
export type VendorUpdateInput = z.infer<typeof vendorUpdateSchema>;

export const vendorListItemSchema = z.object({
  id: z.string().uuid(),
  code: z.string().nullable(),
  name: z.string(),
  gstin: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  ratingScaled: z.number(),
  ratingCount: z.number(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
});
export type VendorListItem = z.infer<typeof vendorListItemSchema>;
