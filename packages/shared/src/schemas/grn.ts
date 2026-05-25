import { z } from "zod";

export const grnStatusSchema = z.enum(["draft", "submitted", "qc_pending", "accepted", "partially_accepted", "rejected", "cancelled"]);
export type GrnStatus = z.infer<typeof grnStatusSchema>;

export const grnConditionSchema = z.enum(["good", "damaged", "shortage", "excess"]);
export type GrnCondition = z.infer<typeof grnConditionSchema>;

export const grnItemInputSchema = z.object({
  poItemId: z.string().uuid().optional().nullable(),
  itemId: z.string().uuid().optional().nullable(),
  itemName: z.string().trim().min(1, "Item name is required").max(200),
  uom: z.string().trim().min(1, "UOM is required").max(20),
  orderedQuantity: z.number().nonnegative("Quantity cannot be negative").default(0),
  receivedQuantity: z.number().nonnegative("Received quantity cannot be negative"),
  acceptedQuantity: z.number().nonnegative("Accepted quantity cannot be negative"),
  rejectedQuantity: z.number().nonnegative().default(0),
  unitPrice: z.number().nonnegative().default(0),
  condition: grnConditionSchema.default("good"),
  remarks: z.string().trim().max(500).optional().nullable().or(z.literal("")),
});
export type GrnItemInput = z.infer<typeof grnItemInputSchema>;

export const grnCreateSchema = z.object({
  companyId: z.string().uuid("Please select a company"),
  unitId: z.string().uuid("Please select a unit"),
  poId: z.string().uuid("Please select a PO"),
  gateEntryId: z.string().uuid().optional().nullable(),
  vendorId: z.string().uuid("Please select a vendor"),
  invoiceNumber: z.string().trim().max(50).optional().nullable().or(z.literal("")),
  invoiceDate: z.string().date().optional().nullable(),
  invoiceAmount: z.number().nonnegative("Invoice amount cannot be negative").optional().nullable(),
  receivedDate: z.string().date("Please pick a received date"),
  remarks: z.string().trim().max(1000).optional().nullable().or(z.literal("")),
  items: z.array(grnItemInputSchema).min(1, "Add at least one item"),
});
export type GrnCreateInput = z.infer<typeof grnCreateSchema>;

export const grnListItemSchema = z.object({
  id: z.string().uuid(),
  grnNumber: z.string().nullable(),
  status: grnStatusSchema,
  poId: z.string().uuid(),
  poNumber: z.string().nullable(),
  vendorId: z.string().uuid(),
  vendorName: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  invoiceAmountPaise: z.string().nullable(),
  receivedDate: z.string().datetime(),
  itemsCount: z.number(),
  createdAt: z.string().datetime(),
});
export type GrnListItem = z.infer<typeof grnListItemSchema>;
