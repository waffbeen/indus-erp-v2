import { z } from "zod";

/** Create a new cycle-count sheet — system qty is snapshotted server-side. */
export const stockCountCreateSchema = z.object({
  companyId: z.string().uuid("Please select a company"),
  unitId: z.string().uuid("Please select a unit / warehouse"),
  remarks: z.string().trim().max(500).optional().nullable().or(z.literal("")),
});
export type StockCountCreateInput = z.infer<typeof stockCountCreateSchema>;

/** Save counted quantities for one or more lines. countedQty is in human units. */
export const stockCountEntrySchema = z.object({
  lines: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        countedQty: z.number().nonnegative("Cannot be negative"),
        remarks: z.string().trim().max(300).optional().nullable().or(z.literal("")),
      }),
    )
    .min(1, "Enter at least one counted line"),
});
export type StockCountEntryInput = z.infer<typeof stockCountEntrySchema>;
