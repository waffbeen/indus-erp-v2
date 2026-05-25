import { z } from "zod";

export const itemCreateSchema = z.object({
  name: z.string().trim().min(2, "Item name must be at least 2 characters").max(200, "Item name is too long"),
  description: z.string().trim().max(500, "Description is too long").optional().nullable().or(z.literal("")),
  category: z.string().trim().max(80).optional().nullable().or(z.literal("")),
  itemGroupName: z.string().trim().max(80).optional().nullable().or(z.literal("")),
  itemSubGroupName: z.string().trim().max(80).optional().nullable().or(z.literal("")),
  uom: z.string().trim().min(1, "Unit of measure is required").max(20).default("nos"),
  stockUnit: z.string().trim().max(20).optional().nullable().or(z.literal("")),
  purchaseUnit: z.string().trim().max(20).optional().nullable().or(z.literal("")),
  conversionFactor: z.coerce.number().int().positive("Conversion factor must be positive").default(1),
  hsnCode: z.string().trim().max(20).optional().nullable().or(z.literal("")),
  defaultTaxRate: z.coerce.number().min(0, "Tax cannot be negative").max(100, "Tax cannot exceed 100%").default(18),
  isStocked: z.boolean().default(false),
  isAsset: z.boolean().default(false),
  isService: z.boolean().default(false),
  specifications: z.record(z.unknown()).optional(),
});
export type ItemCreateInput = z.infer<typeof itemCreateSchema>;

export const itemUpdateSchema = itemCreateSchema.partial();
export type ItemUpdateInput = z.infer<typeof itemUpdateSchema>;

export const itemListItemSchema = z.object({
  id: z.string().uuid(),
  code: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  category: z.string().nullable(),
  itemGroupName: z.string().nullable(),
  itemSubGroupName: z.string().nullable(),
  uom: z.string(),
  stockUnit: z.string().nullable(),
  purchaseUnit: z.string().nullable(),
  hsnCode: z.string().nullable(),
  defaultTaxRate: z.number(),
  isStocked: z.boolean(),
  isAsset: z.boolean().default(false),
  isService: z.boolean().default(false),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
});
export type ItemListItem = z.infer<typeof itemListItemSchema>;
