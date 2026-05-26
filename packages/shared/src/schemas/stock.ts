import { z } from "zod";

export const stockMovementInputSchema = z.object({
  companyId: z.string().uuid("Please select a company"),
  unitId: z.string().uuid("Please select a warehouse"),
  itemId: z.string().uuid("Please pick an item"),
  qty: z.number().positive("Quantity must be greater than zero"),
  uom: z.string().trim().min(1).max(20),
  unitPrice: z.number().nonnegative().optional(),
  batchNumber: z.string().trim().max(60).optional().nullable().or(z.literal("")),
  mfgDate: z.string().date().optional().nullable(),
  expiryDate: z.string().date().optional().nullable(),
  remarks: z.string().trim().max(500).optional().nullable().or(z.literal("")),
});
export type StockMovementInput = z.infer<typeof stockMovementInputSchema>;

export const stockAdjustInputSchema = stockMovementInputSchema.extend({
  /** "in" = add to stock, "out" = remove from stock. Issue is always "out". */
  direction: z.enum(["in", "out"]),
});
export type StockAdjustInput = z.infer<typeof stockAdjustInputSchema>;
