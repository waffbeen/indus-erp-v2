import { z } from "zod";

/**
 * Vendor scorecards — supplier performance computed from PO + GRN history.
 * All percentages are 0–100 integers; null means "not enough data yet".
 *
 *  - onTimePct       : GRNs received on/before the PO's committed delivery date.
 *  - qualityPct      : accepted qty ÷ received qty across GRNs.
 *  - priceIndex      : this vendor's prices vs the cross-vendor item average
 *                      (100 = at market, <100 = cheaper, >100 = dearer).
 *  - responsivenessPct: how quickly the vendor acknowledges POs (mapped to 0–100).
 *  - overallScore    : weighted blend used for ranking.
 */

export const vendorScorecardSchema = z.object({
  vendorId: z.string().uuid(),
  vendorName: z.string(),
  vendorCode: z.string().nullable(),
  poCount: z.number(),
  grnCount: z.number(),
  /** Total ordered value across finalised POs (paise). */
  totalOrderedPaise: z.string(),
  onTimePct: z.number().nullable(),
  qualityPct: z.number().nullable(),
  priceIndex: z.number().nullable(),
  responsivenessPct: z.number().nullable(),
  avgLeadTimeDays: z.number().nullable(),
  /** Manual star rating from the vendor master (0–5), if any. */
  manualRating: z.number().nullable(),
  overallScore: z.number(),
  /** Letter grade derived from overallScore for an at-a-glance read. */
  grade: z.enum(["A", "B", "C", "D"]),
});
export type VendorScorecard = z.infer<typeof vendorScorecardSchema>;

export const vendorScorecardsResultSchema = z.object({
  scorecards: z.array(vendorScorecardSchema),
  generatedAt: z.string(),
});
export type VendorScorecardsResult = z.infer<typeof vendorScorecardsResultSchema>;
