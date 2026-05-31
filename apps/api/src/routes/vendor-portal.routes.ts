import { Router } from "express";
import { quoteSubmitSchema, portalAckSchema } from "@indus/shared";
import * as portalService from "../services/vendor-portal.service";

/**
 * PUBLIC vendor/supplier portal. NO requireAuth / requireTenant — the opaque
 * token in the path IS the credential. resolveToken() maps it to a single
 * { tenantId, vendorId }; every read/write below is constrained to that pair,
 * so a request body can never widen the scope to another tenant or vendor.
 */
export const vendorPortalRoutes: Router = Router();

function meta(req: any) {
  return { ipAddress: req.ip, userAgent: req.headers["user-agent"] };
}

/** Vendor dashboard: their POs + open RFQs. */
vendorPortalRoutes.get("/:token", async (req, res, next) => {
  try {
    const data = await portalService.getPortalDashboard(req.params.token!);
    res.json(data);
  } catch (err) { next(err); }
});

/** Acknowledge a purchase order. */
vendorPortalRoutes.post("/:token/po/:poId/ack", async (req, res, next) => {
  try {
    const input = portalAckSchema.parse(req.body ?? {});
    const result = await portalService.acknowledgePo(req.params.token!, req.params.poId!, input, meta(req));
    res.json(result);
  } catch (err) { next(err); }
});

/** View one RFQ the vendor was invited to (with any prior quote prefilled). */
vendorPortalRoutes.get("/:token/rfq/:rfqId", async (req, res, next) => {
  try {
    const data = await portalService.getPortalRfq(req.params.token!, req.params.rfqId!);
    res.json(data);
  } catch (err) { next(err); }
});

/** Submit (or revise) a quote for an RFQ. */
vendorPortalRoutes.post("/:token/rfq/:rfqId/quote", async (req, res, next) => {
  try {
    const input = quoteSubmitSchema.parse(req.body);
    const result = await portalService.submitPortalQuote(req.params.token!, req.params.rfqId!, input, meta(req));
    res.status(201).json(result);
  } catch (err) { next(err); }
});
