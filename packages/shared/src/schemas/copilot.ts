import { z } from "zod";

/**
 * AI Procurement Copilot — advisory contracts shared FE↔BE.
 *
 * The Copilot NEVER mutates: every endpoint returns a SUGGESTION for a human to
 * review and act on (it does not create the PO, pick the vendor, etc.). All
 * money is paise (string for big-int safety); quantities are human numbers here
 * (the UI shows them directly), not the ×1000 scaled integers used at rest.
 */

// --- Draft PO from a PR ----------------------------------------------------

export const draftPoRequestSchema = z.object({
  prId: z.string().uuid("A valid requisition id is required"),
});
export type DraftPoRequest = z.infer<typeof draftPoRequestSchema>;

export const suggestedPoLineSchema = z.object({
  prItemId: z.string().uuid().nullable(),
  itemId: z.string().uuid().nullable(),
  itemName: z.string(),
  uom: z.string(),
  quantity: z.number(),
  /** Suggested unit price in paise (string). */
  suggestedUnitPricePaise: z.string(),
  /** Where the price came from — last purchase, vendor history, or PR estimate. */
  priceBasis: z.enum(["vendor_history", "last_purchase", "pr_estimate", "ai", "none"]),
  lineTotalPaise: z.string(),
  reason: z.string().nullable(),
});
export type SuggestedPoLine = z.infer<typeof suggestedPoLineSchema>;

export const suggestedPoSchema = z.object({
  prId: z.string().uuid(),
  prNumber: z.string().nullable(),
  prTitle: z.string(),
  companyId: z.string().uuid(),
  unitId: z.string().uuid(),
  /** Recommended vendor (may be null if no history exists to suggest one). */
  vendorId: z.string().uuid().nullable(),
  vendorName: z.string().nullable(),
  vendorReason: z.string().nullable(),
  paymentTerms: z.string().nullable(),
  deliveryTerms: z.string().nullable(),
  notes: z.string().nullable(),
  lines: z.array(suggestedPoLineSchema),
  estimatedTotalPaise: z.string(),
  /** True when a model produced the narrative; false when it's a pure-data heuristic. */
  aiGenerated: z.boolean(),
  /** Surfaced so the UI can show "add an AI key for richer suggestions". */
  aiConfigured: z.boolean(),
  /** Caveats the user should verify before raising the real PO. */
  caveats: z.array(z.string()).default([]),
});
export type SuggestedPo = z.infer<typeof suggestedPoSchema>;

// --- Vendor recommendation -------------------------------------------------

export const recommendVendorsRequestSchema = z
  .object({
    itemId: z.string().uuid().optional(),
    prId: z.string().uuid().optional(),
  })
  .refine((v) => Boolean(v.itemId) || Boolean(v.prId), {
    message: "Provide either an itemId or a prId",
  });
export type RecommendVendorsRequest = z.infer<typeof recommendVendorsRequestSchema>;

export const vendorRecommendationSchema = z.object({
  vendorId: z.string().uuid(),
  vendorName: z.string(),
  /** 0–100 blended score (price + quality + on-time + relationship). */
  score: z.number(),
  rank: z.number(),
  /** Avg unit price this vendor charged for the target item(s), paise. */
  avgUnitPricePaise: z.string().nullable(),
  onTimePct: z.number().nullable(),
  qualityPct: z.number().nullable(),
  avgLeadTimeDays: z.number().nullable(),
  poCount: z.number(),
  /** Human-readable bullet reasons backing the ranking. */
  reasons: z.array(z.string()),
});
export type VendorRecommendation = z.infer<typeof vendorRecommendationSchema>;

export const recommendVendorsResultSchema = z.object({
  /** The item names the recommendation is scoped to. */
  scope: z.array(z.string()),
  recommendations: z.array(vendorRecommendationSchema),
});
export type RecommendVendorsResult = z.infer<typeof recommendVendorsResultSchema>;
