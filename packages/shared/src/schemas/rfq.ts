import { z } from "zod";

export const rfqStatusSchema = z.enum(["draft", "sent", "closed", "awarded", "cancelled"]);
export type RfqStatus = z.infer<typeof rfqStatusSchema>;

/** A single requested line. itemId optional — free-text items are allowed. */
export const rfqItemInputSchema = z.object({
  itemId: z.string().uuid().nullable().optional(),
  itemName: z.string().trim().min(1, "Item name is required").max(200, "Item name is too long"),
  description: z.string().max(500).optional().nullable(),
  quantity: z
    .number({ invalid_type_error: "Quantity must be a number" })
    .positive("Quantity must be greater than 0"),
  uom: z.string().trim().min(1, "UOM is required").max(20),
});
export type RfqItemInput = z.infer<typeof rfqItemInputSchema>;

export const rfqCreateSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(200, "Title is too long (max 200)"),
  description: z.string().max(2000, "Description is too long").optional().nullable(),
  /** ISO date (yyyy-mm-dd). Quote submission deadline. */
  dueDate: z.string().date().optional().nullable(),
  /** Vendors to invite up-front (can also invite later). */
  vendorIds: z.array(z.string().uuid()).default([]),
  items: z.array(rfqItemInputSchema).min(1, "Add at least one line item"),
});
export type RfqCreateInput = z.infer<typeof rfqCreateSchema>;

export const rfqInviteSchema = z.object({
  vendorIds: z.array(z.string().uuid()).min(1, "Pick at least one vendor"),
});
export type RfqInviteInput = z.infer<typeof rfqInviteSchema>;

export const rfqAwardSchema = z.object({
  vendorId: z.string().uuid("Pick the winning vendor"),
});
export type RfqAwardInput = z.infer<typeof rfqAwardSchema>;

/* ----- Read shapes (FE convenience types) ----- */
export const rfqListItemSchema = z.object({
  id: z.string().uuid(),
  rfqNumber: z.string().nullable(),
  title: z.string(),
  status: rfqStatusSchema,
  dueDate: z.string().nullable(),
  vendorCount: z.number().int().nonnegative(),
  responseCount: z.number().int().nonnegative(),
  itemsCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type RfqListItem = z.infer<typeof rfqListItemSchema>;
