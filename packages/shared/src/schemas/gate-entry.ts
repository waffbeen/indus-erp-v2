import { z } from "zod";

export const gateEntryTypeSchema = z.enum(["inward", "outward", "service"]);
export type GateEntryType = z.infer<typeof gateEntryTypeSchema>;

export const gateEntryStatusSchema = z.enum(["open", "closed", "cancelled"]);
export type GateEntryStatus = z.infer<typeof gateEntryStatusSchema>;

export const gateEntryItemInputSchema = z.object({
  itemId: z.string().uuid().nullable().optional(),
  itemName: z.string().trim().min(1, "Item name is required").max(200),
  description: z.string().trim().max(500).optional().nullable().or(z.literal("")),
  quantity: z.number({ invalid_type_error: "Quantity must be a number" }).positive("Quantity must be greater than 0"),
  uom: z.string().trim().min(1, "UOM is required").max(20).default("nos"),
  notes: z.string().trim().max(500).optional().nullable().or(z.literal("")),
});
export type GateEntryItemInput = z.infer<typeof gateEntryItemInputSchema>;

export const gateEntryCreateSchema = z.object({
  companyId: z.string().uuid("Please select a company"),
  unitId: z.string().uuid("Please select a unit"),
  type: gateEntryTypeSchema.default("inward"),
  vendorId: z.string().uuid().optional().nullable(),
  poId: z.string().uuid().optional().nullable(),
  vehicleNumber: z.string().trim().max(30).optional().nullable().or(z.literal("")),
  driverName: z.string().trim().max(80).optional().nullable().or(z.literal("")),
  driverPhone: z.string().trim().max(20).optional().nullable().or(z.literal("")),
  invoiceNumber: z.string().trim().max(50).optional().nullable().or(z.literal("")),
  invoiceDate: z.string().date().optional().nullable(),
  remarks: z.string().trim().max(1000).optional().nullable().or(z.literal("")),
  items: z.array(gateEntryItemInputSchema).default([]),
});
export type GateEntryCreateInput = z.infer<typeof gateEntryCreateSchema>;

export const gateEntryListItemSchema = z.object({
  id: z.string().uuid(),
  gateEntryNumber: z.string().nullable(),
  type: gateEntryTypeSchema,
  status: gateEntryStatusSchema,
  vendorId: z.string().uuid().nullable(),
  vendorName: z.string().nullable(),
  poId: z.string().uuid().nullable(),
  poNumber: z.string().nullable(),
  vehicleNumber: z.string().nullable(),
  driverName: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  itemsCount: z.number(),
  gateInAt: z.string().datetime(),
  gateOutAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type GateEntryListItem = z.infer<typeof gateEntryListItemSchema>;
