import { z } from "zod";

/**
 * GSTIN verification contracts shared FE↔BE. validateFormat() is a pure regex
 * check; verify() looks the GSTIN up against a govt/GSP API (stubbed) and
 * caches the legal/trade name + taxpayer status. The canonical GSTIN_REGEX
 * lives in ./gst-settings (re-exported from the package root).
 */

export const gstinVerifyRequestSchema = z.object({
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .min(15, "GSTIN must be 15 characters")
    .max(15, "GSTIN must be 15 characters"),
});
export type GstinVerifyRequest = z.infer<typeof gstinVerifyRequestSchema>;

export const gstinViewSchema = z.object({
  gstin: z.string(),
  formatValid: z.boolean(),
  legalName: z.string().nullable(),
  tradeName: z.string().nullable(),
  /** Taxpayer status — "Active" / "Cancelled" / "format_valid" / "invalid". */
  status: z.string().nullable(),
  /** 2-digit state code parsed from the GSTIN, with its readable name. */
  stateCode: z.string().nullable(),
  stateName: z.string().nullable(),
  /** PAN embedded in the GSTIN (chars 3–12). */
  pan: z.string().nullable(),
  lastCheckedAt: z.string().nullable(),
});
export type GstinView = z.infer<typeof gstinViewSchema>;
