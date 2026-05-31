import { z } from "zod";

/**
 * Procurement anomaly flags — surfaced by the spend-integrity scan.
 * Each flag is advisory: it points a buyer/auditor at something worth a look,
 * never blocks a transaction.
 */

export const anomalyKindSchema = z.enum([
  /** Unit price jumped sharply vs the item's previous purchase. */
  "price_spike",
  /** Several POs to one vendor in a short window that look split to dodge a limit. */
  "split_po",
  /** Same vendor + invoice number + amount seen more than once. */
  "duplicate_invoice",
  /** Total is suspiciously round or sits just under an approval threshold. */
  "round_amount",
]);
export type AnomalyKind = z.infer<typeof anomalyKindSchema>;

export const anomalySeveritySchema = z.enum(["low", "medium", "high"]);
export type AnomalySeverity = z.infer<typeof anomalySeveritySchema>;

export const anomalyStatusSchema = z.enum(["open", "dismissed"]);
export type AnomalyStatus = z.infer<typeof anomalyStatusSchema>;

export const anomalyFlagSchema = z.object({
  id: z.string().uuid(),
  kind: anomalyKindSchema,
  severity: anomalySeveritySchema,
  status: anomalyStatusSchema,
  title: z.string(),
  /** Free-form structured evidence (amounts, ids, percentages). */
  detail: z.record(z.unknown()),
  resourceType: z.string().nullable(),
  resourceId: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type AnomalyFlag = z.infer<typeof anomalyFlagSchema>;

export const anomalyScanResultSchema = z.object({
  flags: z.array(anomalyFlagSchema),
  /** Count by kind, so the UI can show a summary strip. */
  countsByKind: z.record(z.number()),
  scannedAt: z.string(),
});
export type AnomalyScanResult = z.infer<typeof anomalyScanResultSchema>;

/** Dismiss / re-open a flag from the Insights feed. */
export const anomalyUpdateSchema = z.object({
  status: anomalyStatusSchema,
});
export type AnomalyUpdate = z.infer<typeof anomalyUpdateSchema>;
