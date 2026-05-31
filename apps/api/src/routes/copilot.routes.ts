import { Router } from "express";
import {
  draftPoRequestSchema,
  recommendVendorsRequestSchema,
  ocrInvoiceRequestSchema,
  anomalyUpdateSchema,
} from "@indus/shared";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import * as copilotService from "../services/copilot.service";
import * as scorecardService from "../services/vendor-scorecard.service";
import * as anomalyService from "../services/anomaly.service";
import * as forecastService from "../services/forecast.service";
import * as ocrService from "../services/ocr.service";

/**
 * AI Procurement Copilot + Insights (vendor scorecards, anomalies, forecasts)
 * + Document AI (invoice OCR). Same guard chain as every tenant module; all
 * endpoints are read/advisory and never mutate procurement records.
 */
export const copilotRoutes: Router = Router();

copilotRoutes.use(requireAuth, requireTenant);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ctx(req: any) {
  return {
    tenantId: req.tenant!.id,
    userId: req.auth!.sub,
    isTenantAdmin: req.auth!.ta,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  };
}

// --- Copilot ---------------------------------------------------------------

/** POST /copilot/draft-po — suggest a PO from a PR (does NOT create it). */
copilotRoutes.post("/draft-po", async (req, res, next) => {
  try {
    const { prId } = draftPoRequestSchema.parse(req.body);
    res.json(await copilotService.draftPoFromPr(req.tenant!.id, prId));
  } catch (err) {
    next(err);
  }
});

/** POST /copilot/recommend-vendors — rank vendors for an item or a whole PR. */
copilotRoutes.post("/recommend-vendors", async (req, res, next) => {
  try {
    const input = recommendVendorsRequestSchema.parse(req.body);
    res.json(await copilotService.recommendVendors(req.tenant!.id, input));
  } catch (err) {
    next(err);
  }
});

// --- Vendor scorecards -----------------------------------------------------

copilotRoutes.get("/scorecards", async (req, res, next) => {
  try {
    res.json(await scorecardService.getScorecards(req.tenant!.id));
  } catch (err) {
    next(err);
  }
});

copilotRoutes.get("/scorecards/:vendorId", async (req, res, next) => {
  try {
    const card = await scorecardService.getVendorScore(req.tenant!.id, req.params.vendorId!);
    if (!card) {
      res.status(404).json({ code: "vendor_not_scored", message: "No scorecard for this vendor yet" });
      return;
    }
    res.json(card);
  } catch (err) {
    next(err);
  }
});

// --- Anomalies -------------------------------------------------------------

/** GET /copilot/anomalies — current open feed + by-kind summary. */
copilotRoutes.get("/anomalies", async (req, res, next) => {
  try {
    res.json(await anomalyService.getFlagsWithSummary(req.tenant!.id));
  } catch (err) {
    next(err);
  }
});

/** POST /copilot/anomalies/scan — run the spend-integrity scan, return fresh feed. */
copilotRoutes.post("/anomalies/scan", async (req, res, next) => {
  try {
    res.json(await anomalyService.scan(ctx(req)));
  } catch (err) {
    next(err);
  }
});

/** PATCH /copilot/anomalies/:id — dismiss / re-open a flag. */
copilotRoutes.patch("/anomalies/:id", async (req, res, next) => {
  try {
    const input = anomalyUpdateSchema.parse(req.body);
    res.json(await anomalyService.updateFlag(req.params.id!, input, ctx(req)));
  } catch (err) {
    next(err);
  }
});

// --- Forecasts -------------------------------------------------------------

copilotRoutes.get("/forecasts", async (req, res, next) => {
  try {
    res.json(await forecastService.getForecasts(req.tenant!.id));
  } catch (err) {
    next(err);
  }
});

// --- Document AI (invoice OCR) --------------------------------------------

/** POST /copilot/ocr-invoice — extract fields from an uploaded vendor bill. */
copilotRoutes.post("/ocr-invoice", async (req, res, next) => {
  try {
    const input = ocrInvoiceRequestSchema.parse(req.body);
    res.json(await ocrService.extractInvoice({ tenantId: req.tenant!.id, ...input }));
  } catch (err) {
    next(err);
  }
});
