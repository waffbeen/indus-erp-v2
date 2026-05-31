import { z } from "zod";

export const salesOrderStatusSchema = z.enum([
  "draft",
  "pending_approval",
  "approved",
  "partially_fulfilled",
  "fulfilled",
  "closed",
  "cancelled",
]);
export type SalesOrderStatus = z.infer<typeof salesOrderStatusSchema>;

export const salesOrderItemInputSchema = z.object({
  itemId: z.string().uuid().nullable().optional(),
  itemName: z.string().trim().min(1, "Item name is required").max(200, "Item name is too long"),
  description: z.string().max(500).optional().nullable(),
  itemGroupName: z.string().max(80).optional().nullable(),
  itemSubGroupName: z.string().max(80).optional().nullable(),
  hsnCode: z.string().max(20).optional().nullable(),
  quantity: z.number({ invalid_type_error: "Quantity must be a number" }).positive("Quantity must be greater than 0"),
  uom: z.string().trim().min(1, "UOM is required").max(20),
  unitPrice: z.number({ invalid_type_error: "Unit price must be a number" }).positive("Unit price must be greater than 0"),
  discountPercent: z.number().min(0).max(100, "Discount cannot exceed 100%").default(0),
  taxRate: z.number().min(0, "Tax cannot be negative").max(100, "Tax cannot exceed 100%").default(18),
  committedDeliveryDate: z.string().date().optional().nullable(),
  itemNarration: z.string().max(500).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  specifications: z.record(z.unknown()).optional().nullable(),
});
export type SalesOrderItemInput = z.infer<typeof salesOrderItemInputSchema>;

export const salesOrderCreateSchema = z.object({
  companyId: z.string().uuid("Please select a company"),
  unitId: z.string().uuid("Please select a unit"),
  customerId: z.string().uuid("Please select a customer"),
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(200, "Title is too long (max 200)"),
  description: z.string().max(2000, "Description is too long").optional().nullable(),
  customerPoNumber: z.string().trim().max(80).optional().nullable().or(z.literal("")),
  /** Interstate vs intrastate — drives IGST vs CGST+SGST split. */
  isInterstate: z.boolean().default(false),
  placeOfSupply: z.string().max(20).optional().nullable(),
  expectedShipDate: z.string().date().optional().nullable(),
  validUntil: z.string().date().optional().nullable(),
  shippingAddress: z.string().max(500).optional().nullable(),
  billingAddress: z.string().max(500).optional().nullable(),
  deliveryTerms: z.string().max(200).optional().nullable(),
  paymentTerms: z.string().max(200).optional().nullable(),
  termsAndConditions: z.string().max(2000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  /** Header-level charges (in ₹, stored as paise). */
  freightCharges: z.number().nonnegative().default(0),
  otherCharges: z.number().nonnegative().default(0),
  roundOff: z.number().default(0),
  items: z.array(salesOrderItemInputSchema).min(1, "Add at least one line item"),
});
export type SalesOrderCreateInput = z.infer<typeof salesOrderCreateSchema>;

export const salesOrderUpdateSchema = salesOrderCreateSchema.partial();
export type SalesOrderUpdateInput = z.infer<typeof salesOrderUpdateSchema>;

/** Fulfil one or more SO lines — ship the given quantities out. Empty = fulfil all remaining. */
export const salesOrderFulfilSchema = z.object({
  lines: z
    .array(
      z.object({
        soItemId: z.string().uuid(),
        quantity: z.number().positive("Quantity must be greater than 0"),
      }),
    )
    .default([]),
  comment: z.string().max(1000).optional().nullable(),
});
export type SalesOrderFulfilInput = z.infer<typeof salesOrderFulfilSchema>;

/* ----- Read shapes ----- */
export const salesOrderListItemSchema = z.object({
  id: z.string().uuid(),
  soNumber: z.string().nullable(),
  title: z.string(),
  status: salesOrderStatusSchema,
  customerId: z.string().uuid(),
  customerName: z.string(),
  totalPaise: z.string(),
  currency: z.string().default("INR"),
  itemsCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  expectedShipDate: z.string().datetime().nullable(),
});
export type SalesOrderListItem = z.infer<typeof salesOrderListItemSchema>;
