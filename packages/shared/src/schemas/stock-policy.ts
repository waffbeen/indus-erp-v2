import { z } from "zod";

/**
 * Stocking policy is captured from the UI in human units (e.g. "50 pcs"); the
 * service scales ×1000 before persisting. Hence the inputs here are plain
 * non-negative numbers, not the *_Scaled integers stored in the DB.
 */
export const stockPolicyUpsertSchema = z
  .object({
    id: z.string().uuid().optional(),
    itemId: z.string().uuid("Please pick an item"),
    unitId: z.string().uuid("Please select a unit / warehouse"),
    minQty: z.number().nonnegative("Cannot be negative").default(0),
    maxQty: z.number().nonnegative("Cannot be negative").default(0),
    reorderLevel: z.number().nonnegative("Cannot be negative").default(0),
    safetyStock: z.number().nonnegative("Cannot be negative").default(0),
    leadTimeDays: z.number().int("Whole days only").min(0).max(3650).default(0),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.maxQty === 0 || v.maxQty >= v.reorderLevel, {
    message: "Max level should be at or above the reorder level",
    path: ["maxQty"],
  });
export type StockPolicyUpsertInput = z.infer<typeof stockPolicyUpsertSchema>;
