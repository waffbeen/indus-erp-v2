import { Router, type Request } from "express";
import {
  eInvoiceGenerateSchema,
  eInvoiceCancelSchema,
  eWayBillGenerateSchema,
  eWayBillCancelSchema,
  reconcile2bRequestSchema,
  gstinVerifyRequestSchema,
  gstSettingsUpdateSchema,
  gstSettingsTestSchema,
  PERIOD_REGEX,
} from "@indus/shared";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { Forbidden, BadRequest } from "../lib/errors";
import * as einvoice from "../services/einvoice.service";
import * as eway from "../services/eway.service";
import * as returns from "../services/gst-return.service";
import * as gstin from "../services/gstin.service";
import * as gstSettings from "../services/tenant-gst-settings.service";

/**
 * India GST Compliance suite — e-invoicing (IRN/QR), e-way bills, GST returns +
 * GSTR-2B reconciliation, GSTIN verification, and the per-tenant GSP credentials.
 * Every route is tenant-scoped; /settings is tenant-admin only.
 */
export const complianceRoutes: Router = Router();

complianceRoutes.use(requireAuth, requireTenant);

function ctx(req: Request) {
  return {
    tenantId: req.tenant!.id,
    userId: req.auth!.sub,
    isTenantAdmin: req.auth!.ta,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  };
}

/** Current "YYYY-MM" in UTC. */
function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/* ----------------------------- E-Invoices ----------------------------- */

complianceRoutes.get("/e-invoices", async (req, res, next) => {
  try {
    res.json(
      await einvoice.listEInvoices(req.tenant!.id, {
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        sourceId: typeof req.query.sourceId === "string" ? req.query.sourceId : undefined,
      }),
    );
  } catch (err) { next(err); }
});

/** Preview the e-invoice JSON (schema v1.1) without generating. */
complianceRoutes.post("/e-invoices/preview", async (req, res, next) => {
  try {
    const input = eInvoiceGenerateSchema.parse(req.body ?? {});
    res.json(await einvoice.previewPayload(req.tenant!.id, input));
  } catch (err) { next(err); }
});

complianceRoutes.post("/e-invoices/generate", async (req, res, next) => {
  try {
    const input = eInvoiceGenerateSchema.parse(req.body ?? {});
    res.status(201).json(await einvoice.generateEInvoice(input, ctx(req)));
  } catch (err) { next(err); }
});

complianceRoutes.get("/e-invoices/:id", async (req, res, next) => {
  try {
    res.json(await einvoice.getEInvoice(req.tenant!.id, req.params.id!));
  } catch (err) { next(err); }
});

complianceRoutes.post("/e-invoices/:id/cancel", async (req, res, next) => {
  try {
    const input = eInvoiceCancelSchema.parse(req.body ?? {});
    res.json(await einvoice.cancelEInvoice(req.params.id!, input, ctx(req)));
  } catch (err) { next(err); }
});

/* ----------------------------- E-Way Bills ---------------------------- */

complianceRoutes.get("/e-way-bills", async (req, res, next) => {
  try {
    res.json(
      await eway.listEWayBills(req.tenant!.id, {
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        sourceId: typeof req.query.sourceId === "string" ? req.query.sourceId : undefined,
      }),
    );
  } catch (err) { next(err); }
});

complianceRoutes.post("/e-way-bills/generate", async (req, res, next) => {
  try {
    const input = eWayBillGenerateSchema.parse(req.body ?? {});
    res.status(201).json(await eway.generateEWayBill(input, ctx(req)));
  } catch (err) { next(err); }
});

complianceRoutes.get("/e-way-bills/:id", async (req, res, next) => {
  try {
    res.json(await eway.getEWayBill(req.tenant!.id, req.params.id!));
  } catch (err) { next(err); }
});

complianceRoutes.post("/e-way-bills/:id/cancel", async (req, res, next) => {
  try {
    const input = eWayBillCancelSchema.parse(req.body ?? {});
    res.json(await eway.cancelEWayBill(req.params.id!, input, ctx(req)));
  } catch (err) { next(err); }
});

/* ------------------------------- Returns ------------------------------ */

/** GET /returns?period=YYYY-MM — GSTR-1 + GSTR-3B summaries (computed + saved). */
complianceRoutes.get("/returns", async (req, res, next) => {
  try {
    const period = typeof req.query.period === "string" && req.query.period ? req.query.period : currentPeriod();
    if (!PERIOD_REGEX.test(period)) throw BadRequest("bad_period", "Period must be in YYYY-MM format.");
    res.json(await returns.getReturnsSummary(req.tenant!.id, period, ctx(req)));
  } catch (err) { next(err); }
});

/** GET /returns/history — previously generated snapshots. */
complianceRoutes.get("/returns/history", async (req, res, next) => {
  try {
    res.json(
      await returns.listGstReturns(req.tenant!.id, {
        period: typeof req.query.period === "string" ? req.query.period : undefined,
        type: typeof req.query.type === "string" ? req.query.type : undefined,
      }),
    );
  } catch (err) { next(err); }
});

/** POST /returns/reconcile-2b — match imported GSTR-2B data against vendor invoices. */
complianceRoutes.post("/returns/reconcile-2b", async (req, res, next) => {
  try {
    const input = reconcile2bRequestSchema.parse(req.body ?? {});
    res.json(await returns.reconcile2b(req.tenant!.id, input.period, input.vendorGstData, ctx(req)));
  } catch (err) { next(err); }
});

/* -------------------------------- GSTIN ------------------------------- */

complianceRoutes.get("/gstin", async (req, res, next) => {
  try {
    res.json(await gstin.listVerifications(req.tenant!.id));
  } catch (err) { next(err); }
});

complianceRoutes.post("/gstin/verify", async (req, res, next) => {
  try {
    const input = gstinVerifyRequestSchema.parse(req.body ?? {});
    res.json(await gstin.verify(req.tenant!.id, input.gstin));
  } catch (err) { next(err); }
});

/* ------------------------------ Settings ------------------------------ */

complianceRoutes.get("/settings", async (req, res, next) => {
  try {
    if (!req.auth!.ta) throw Forbidden("admin_only", "Only workspace admins can view GST settings");
    res.json(await gstSettings.getTenantGstSettings(req.tenant!.id));
  } catch (err) { next(err); }
});

complianceRoutes.put("/settings", async (req, res, next) => {
  try {
    if (!req.auth!.ta) throw Forbidden("admin_only", "Only workspace admins can change GST settings");
    const input = gstSettingsUpdateSchema.parse(req.body ?? {});
    res.json(await gstSettings.updateTenantGstSettings(req.tenant!.id, input));
  } catch (err) { next(err); }
});

complianceRoutes.post("/settings/test", async (req, res, next) => {
  try {
    if (!req.auth!.ta) throw Forbidden("admin_only", "Only workspace admins can test GST settings");
    const input = gstSettingsTestSchema.parse(req.body ?? {});
    res.json(await gstSettings.testTenantGstSettings(req.tenant!.id, input));
  } catch (err) { next(err); }
});
