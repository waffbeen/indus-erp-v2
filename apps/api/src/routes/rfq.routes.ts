import { Router } from "express";
import { z } from "zod";
import {
  rfqCreateSchema,
  rfqInviteSchema,
  rfqAwardSchema,
  internalQuoteSubmitSchema,
  portalIssueSchema,
} from "@indus/shared";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import * as rfqService from "../services/rfq.service";
import * as portalService from "../services/vendor-portal.service";
import { appUrl } from "../config/env";

/** Internal RFQ / Sourcing endpoints — require auth + tenant. */
export const rfqRoutes: Router = Router();

rfqRoutes.use(requireAuth, requireTenant);

function ctx(req: any) {
  return {
    tenantId: req.tenant!.id,
    userId: req.auth!.sub,
    isTenantAdmin: req.auth!.ta,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  };
}

rfqRoutes.get("/", async (req, res, next) => {
  try {
    const result = await rfqService.listRfqs(req.tenant!.id, {
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
    });
    res.json(result);
  } catch (err) { next(err); }
});

rfqRoutes.post("/", async (req, res, next) => {
  try {
    const input = rfqCreateSchema.parse(req.body);
    const rfq = await rfqService.createRfq(input, ctx(req));
    res.status(201).json(rfq);
  } catch (err) { next(err); }
});

rfqRoutes.get("/:id", async (req, res, next) => {
  try {
    const rfq = await rfqService.getRfq(req.tenant!.id, req.params.id!);
    res.json(rfq);
  } catch (err) { next(err); }
});

rfqRoutes.get("/:id/compare", async (req, res, next) => {
  try {
    const data = await rfqService.compareQuotes(req.tenant!.id, req.params.id!);
    res.json(data);
  } catch (err) { next(err); }
});

rfqRoutes.post("/:id/invite", async (req, res, next) => {
  try {
    const { vendorIds } = rfqInviteSchema.parse(req.body);
    const result = await rfqService.inviteVendors(req.params.id!, vendorIds, ctx(req));
    res.json(result);
  } catch (err) { next(err); }
});

/** Buyer records a quote on behalf of a vendor (phone/email/paper quote). */
rfqRoutes.post("/:id/quote", async (req, res, next) => {
  try {
    const input = internalQuoteSubmitSchema.parse(req.body);
    const { vendorId, ...quote } = input;
    const saved = await rfqService.recordQuote(req.params.id!, vendorId, quote, {
      tenantId: req.tenant!.id,
      userId: req.auth!.sub,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      viaPortal: false,
    });
    res.status(201).json(saved);
  } catch (err) { next(err); }
});

rfqRoutes.post("/:id/award", async (req, res, next) => {
  try {
    const { vendorId } = rfqAwardSchema.parse(req.body);
    const result = await rfqService.award(req.params.id!, vendorId, ctx(req));
    res.status(201).json(result);
  } catch (err) { next(err); }
});

rfqRoutes.post("/:id/close", async (req, res, next) => {
  try {
    await rfqService.setRfqStatus(req.params.id!, "closed", ctx(req));
    res.status(204).end();
  } catch (err) { next(err); }
});

rfqRoutes.post("/:id/cancel", async (req, res, next) => {
  try {
    await rfqService.setRfqStatus(req.params.id!, "cancelled", ctx(req));
    res.status(204).end();
  } catch (err) { next(err); }
});

/**
 * Issue (or reuse) a public vendor-portal link for a vendor. Tenant-admin only.
 * Returns the opaque token plus the full shareable `/portal/<token>` URL.
 */
rfqRoutes.post("/portal-access/issue", async (req, res, next) => {
  try {
    const input = portalIssueSchema.parse(req.body);
    const result = await portalService.issueToken(
      input.vendorId,
      { expiresInDays: input.expiresInDays ?? null },
      ctx(req),
    );
    res.status(201).json({ ...result, url: appUrl(`portal/${result.token}`) });
  } catch (err) { next(err); }
});

rfqRoutes.post("/portal-access/revoke", async (req, res, next) => {
  try {
    const { vendorId } = z.object({ vendorId: z.string().uuid() }).parse(req.body);
    await portalService.revokeToken(vendorId, ctx(req));
    res.status(204).end();
  } catch (err) { next(err); }
});
