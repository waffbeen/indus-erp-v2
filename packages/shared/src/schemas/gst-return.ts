import { z } from "zod";

/**
 * GST returns + GSTR-2B reconciliation contracts shared FE↔BE.
 *
 * gstr1 = outward supplies summary, gstr3b = summary return (outward liability
 * + ITC), gstr2b = the inward statement we reconcile imported portal data
 * against the tenant's vendor invoices.
 */

export const gstReturnTypeSchema = z.enum(["gstr1", "gstr3b", "gstr2b"]);
export type GstReturnType = z.infer<typeof gstReturnTypeSchema>;

/** "YYYY-MM" tax period. */
export const PERIOD_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
export const periodSchema = z.string().regex(PERIOD_REGEX, "Period must be YYYY-MM");

/** A bucket of tax figures (all in paise, as strings for big-int safety). */
export const gstTaxBucketSchema = z.object({
  count: z.number(),
  taxablePaise: z.string(),
  igstPaise: z.string(),
  cgstPaise: z.string(),
  sgstPaise: z.string(),
  totalPaise: z.string(),
});
export type GstTaxBucket = z.infer<typeof gstTaxBucketSchema>;

export const gstr1SummarySchema = z.object({
  period: z.string(),
  type: z.literal("gstr1"),
  outward: gstTaxBucketSchema,
  note: z.string().optional(),
});
export type Gstr1Summary = z.infer<typeof gstr1SummarySchema>;

export const gstr3bSummarySchema = z.object({
  period: z.string(),
  type: z.literal("gstr3b"),
  outwardLiability: gstTaxBucketSchema,
  inwardItc: gstTaxBucketSchema,
  /** Net cash payable = outward tax − ITC (floored at 0), in paise. */
  netTaxPayablePaise: z.string(),
  note: z.string().optional(),
});
export type Gstr3bSummary = z.infer<typeof gstr3bSummarySchema>;

/** GET /returns?period= → both summaries computed live. */
export const gstReturnsSummaryResponseSchema = z.object({
  period: z.string(),
  gstr1: gstr1SummarySchema,
  gstr3b: gstr3bSummarySchema,
});
export type GstReturnsSummaryResponse = z.infer<typeof gstReturnsSummaryResponseSchema>;

/**
 * One row of vendor-side data imported from the GSTR-2B portal/JSON. Amounts in
 * rupees (as the portal reports them). Either `totalValue` or
 * `taxableValue`+`taxAmount` is enough to match.
 */
export const vendorGstRowSchema = z.object({
  gstin: z.string().trim().toUpperCase().min(1, "Supplier GSTIN is required"),
  invoiceNumber: z.string().trim().min(1, "Invoice number is required"),
  invoiceDate: z.string().optional(),
  taxableValue: z.coerce.number().optional(),
  taxAmount: z.coerce.number().optional(),
  totalValue: z.coerce.number().optional(),
});
export type VendorGstRow = z.infer<typeof vendorGstRowSchema>;

export const reconcile2bRequestSchema = z.object({
  period: periodSchema,
  /** The imported GSTR-2B rows (parsed from the uploaded JSON). */
  vendorGstData: z.array(vendorGstRowSchema).min(1, "Add at least one portal row to reconcile"),
});
export type Reconcile2bRequest = z.infer<typeof reconcile2bRequestSchema>;

/** One reconciliation line — links a portal row and/or a book invoice. */
export const reconcile2bLineSchema = z.object({
  gstin: z.string(),
  invoiceNumber: z.string(),
  vendorName: z.string().nullable(),
  /** Book (our records) total in paise, null when not in books. */
  bookTotalPaise: z.string().nullable(),
  /** Portal (GSTR-2B) total in paise, null when not in the portal data. */
  portalTotalPaise: z.string().nullable(),
  /** Absolute difference in paise (book − portal) when both present. */
  diffPaise: z.string().nullable(),
});
export type Reconcile2bLine = z.infer<typeof reconcile2bLineSchema>;

export const reconcile2bResultSchema = z.object({
  period: z.string(),
  /** Present on both sides, amounts agree (within ₹1). */
  matched: z.array(reconcile2bLineSchema),
  /** Present on both sides, amounts disagree. */
  mismatched: z.array(reconcile2bLineSchema),
  /** In the portal (GSTR-2B) but not in our books — likely a missing purchase entry. */
  missingInBooks: z.array(reconcile2bLineSchema),
  /** In our books but not in the portal — supplier may not have filed. */
  missingInPortal: z.array(reconcile2bLineSchema),
  counts: z.object({
    matched: z.number(),
    mismatched: z.number(),
    missingInBooks: z.number(),
    missingInPortal: z.number(),
  }),
});
export type Reconcile2bResult = z.infer<typeof reconcile2bResultSchema>;
