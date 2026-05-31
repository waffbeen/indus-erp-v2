import { z } from "zod";

/**
 * Demand forecasts — per-item consumption projection from the stock-movement
 * ledger. Quantities here are HUMAN numbers (already divided by 1000) so the UI
 * can render them directly. A simple moving-average + trend model; advisory only.
 */

export const demandForecastSchema = z.object({
  itemId: z.string().uuid(),
  itemName: z.string(),
  uom: z.string(),
  /** Consumption model used — kept generic so we can swap it later. */
  method: z.enum(["moving_average", "trend"]),
  /** Months of history the model had to work with. */
  historyMonths: z.number(),
  /** Average monthly consumption (issues/transfers-out) over the window. */
  avgMonthlyConsumption: z.number(),
  /** Projected consumption for the next month. */
  forecastNextMonth: z.number(),
  /** Trend vs the prior period as a signed percentage (+/-). null if flat/no data. */
  trendPct: z.number().nullable(),
  /** Current on-hand quantity from the ledger. */
  onHand: z.number(),
  /** Suggested quantity to reorder now (0 if comfortably stocked). */
  suggestedReorderQty: z.number(),
  /** How many months of cover the current on-hand provides at the forecast rate. */
  coverMonths: z.number().nullable(),
});
export type DemandForecast = z.infer<typeof demandForecastSchema>;

export const demandForecastsResultSchema = z.object({
  forecasts: z.array(demandForecastSchema),
  generatedAt: z.string(),
});
export type DemandForecastsResult = z.infer<typeof demandForecastsResultSchema>;
