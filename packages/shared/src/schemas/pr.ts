import { z } from "zod";

export const prStatusSchema = z.enum([
  "draft",
  "submitted",
  "pending_l1",
  "pending_l2",
  "escalated",
  "approved",
  "rejected",
  "cancelled",
  "converted_to_po",
]);
export type PrStatus = z.infer<typeof prStatusSchema>;

export const prPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
export type PrPriority = z.infer<typeof prPrioritySchema>;

export const prItemInputSchema = z.object({
  itemId: z.string().uuid().nullable().optional(),
  itemName: z.string().trim().min(1, "Item name is required").max(200, "Item name is too long"),
  description: z.string().max(500).optional().nullable(),
  itemGroupName: z.string().max(80).optional().nullable(),
  itemSubGroupName: z.string().max(80).optional().nullable(),
  hsnCode: z.string().max(20).optional().nullable(),
  quantity: z.number({ invalid_type_error: "Quantity must be a number" }).positive("Quantity must be greater than 0"),
  uom: z.string().trim().min(1, "UOM is required").max(20).default("nos"),
  stockUnit: z.string().max(20).optional().nullable(),
  purchaseUnit: z.string().max(20).optional().nullable(),
  estimatedUnitPrice: z.number().nonnegative("Price cannot be negative").optional().nullable(),
  lastPurchaseRate: z.number().nonnegative().optional().nullable(),
  lastPurchaseDate: z.string().date().optional().nullable(),
  expectedDeliveryDate: z.string().date().optional().nullable(),
  itemNarration: z.string().max(500).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  lineBuyerUserId: z.string().uuid().optional().nullable(),
  specifications: z.record(z.unknown()).optional().nullable(),
});
export type PrItemInput = z.infer<typeof prItemInputSchema>;

export const prTypeSchema = z.enum(["stock", "job_specific", "capex", "amc", "maintenance", "service", "other"]);
export type PrType = z.infer<typeof prTypeSchema>;

export const prCreateSchema = z.object({
  companyId: z.string().uuid("Please select a company"),
  unitId: z.string().uuid("Please select a unit"),
  departmentId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(200, "Title is too long (max 200)"),
  description: z.string().max(2000, "Description is too long").optional().nullable(),
  prType: prTypeSchema.default("stock"),
  referenceNo: z.string().max(80).optional().nullable(),
  buyerUserId: z.string().uuid().optional().nullable(),
  priority: prPrioritySchema.default("normal"),
  neededBy: z.string().date().optional().nullable(),
  items: z.array(prItemInputSchema).min(1, "Add at least one line item"),
});
export type PrCreateInput = z.infer<typeof prCreateSchema>;

export const prUpdateSchema = prCreateSchema.partial().extend({
  // status changes go through dedicated endpoints, not generic update
});
export type PrUpdateInput = z.infer<typeof prUpdateSchema>;

export const prApprovalActionSchema = z.object({
  prId: z.string().uuid(),
  action: z.enum(["approve", "reject", "request_changes", "escalate"]),
  comment: z.string().max(1000).optional().nullable(),
});
export type PrApprovalActionInput = z.infer<typeof prApprovalActionSchema>;

/* ----- Read shapes ----- */
export const prListItemSchema = z.object({
  id: z.string().uuid(),
  prNumber: z.string(), // e.g. "PR-2451"
  title: z.string(),
  status: prStatusSchema,
  priority: prPrioritySchema,
  requesterId: z.string().uuid(),
  requesterName: z.string(),
  companyId: z.string().uuid(),
  unitId: z.string().uuid(),
  itemsCount: z.number().int().nonnegative(),
  estimatedTotal: z.number().nonnegative().nullable(),
  currency: z.string().default("INR"),
  createdAt: z.string().datetime(),
  neededBy: z.string().date().nullable(),
});
export type PrListItem = z.infer<typeof prListItemSchema>;
