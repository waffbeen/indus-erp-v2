import { z } from "zod";

/**
 * Shapes used by BOTH the internal "record a vendor quote" flow and the PUBLIC
 * vendor portal quote submission. Prices are entered in ₹ (human) and converted
 * to paise server-side. A vendor may quote a subset of lines; un-quoted lines
 * are simply omitted.
 */
export const quoteItemInputSchema = z.object({
  rfqItemId: z.string().uuid(),
  /** Unit price in ₹ (will be stored as paise). */
  unitPrice: z
    .number({ invalid_type_error: "Unit price must be a number" })
    .nonnegative("Unit price cannot be negative"),
  deliveryDays: z.number().int().min(0).max(3650).optional().nullable(),
  remarks: z.string().max(500).optional().nullable(),
});
export type QuoteItemInput = z.infer<typeof quoteItemInputSchema>;

export const quoteSubmitSchema = z.object({
  remarks: z.string().max(1000).optional().nullable(),
  items: z.array(quoteItemInputSchema).min(1, "Quote at least one line"),
});
export type QuoteSubmitInput = z.infer<typeof quoteSubmitSchema>;

/** Internal: record a quote on behalf of a vendor (buyer-entered). */
export const internalQuoteSubmitSchema = quoteSubmitSchema.extend({
  vendorId: z.string().uuid("Pick the vendor this quote is from"),
});
export type InternalQuoteSubmitInput = z.infer<typeof internalQuoteSubmitSchema>;

/** Issue a portal access link for a vendor. */
export const portalIssueSchema = z.object({
  vendorId: z.string().uuid(),
  /** Optional expiry in days (omit / null = never). */
  expiresInDays: z.number().int().min(1).max(365).optional().nullable(),
});
export type PortalIssueInput = z.infer<typeof portalIssueSchema>;

export const portalAckSchema = z.object({
  note: z.string().max(500).optional().nullable(),
});
export type PortalAckInput = z.infer<typeof portalAckSchema>;
