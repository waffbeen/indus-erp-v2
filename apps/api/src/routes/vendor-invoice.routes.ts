import { Router } from "express";
import { vendorInvoiceCreateSchema, vendorInvoiceApproveSchema } from "@indus/shared";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { requirePermission } from "../middleware/rbac";
import { Resources, Actions } from "@indus/shared";
import * as service from "../services/vendor-invoice.service";

/**
 * Vendor-invoice (AP bills) routes. There is no dedicated "invoice" RBAC
 * resource yet, so these gate on the PO resource — finance follows procurement
 * permissions for now (tenant admins bypass regardless).
 */
export const vendorInvoiceRoutes: Router = Router();

vendorInvoiceRoutes.use(requireAuth, requireTenant);

vendorInvoiceRoutes.get("/", requirePermission(Resources.PO, Actions.Read), async (req, res, next) => {
  try {
    const result = await service.listVendorInvoices(req.tenant!.id, {
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      vendorId: typeof req.query.vendorId === "string" ? req.query.vendorId : undefined,
      poId: typeof req.query.poId === "string" ? req.query.poId : undefined,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
    });
    res.json(result);
  } catch (err) { next(err); }
});

vendorInvoiceRoutes.get("/from-po/:poId", requirePermission(Resources.PO, Actions.Create), async (req, res, next) => {
  try {
    const data = await service.getInvoiceDraftFromPo(req.tenant!.id, req.params.poId!);
    res.json(data);
  } catch (err) { next(err); }
});

vendorInvoiceRoutes.get("/from-grn/:grnId", requirePermission(Resources.PO, Actions.Create), async (req, res, next) => {
  try {
    const data = await service.getInvoiceDraftFromGrn(req.tenant!.id, req.params.grnId!);
    res.json(data);
  } catch (err) { next(err); }
});

vendorInvoiceRoutes.get("/:id", requirePermission(Resources.PO, Actions.Read), async (req, res, next) => {
  try {
    const inv = await service.getVendorInvoice(req.tenant!.id, req.params.id!);
    res.json(inv);
  } catch (err) { next(err); }
});

vendorInvoiceRoutes.post("/", requirePermission(Resources.PO, Actions.Create), async (req, res, next) => {
  try {
    const input = vendorInvoiceCreateSchema.parse(req.body);
    const inv = await service.createVendorInvoice(input, ctx(req));
    res.status(201).json(inv);
  } catch (err) { next(err); }
});

vendorInvoiceRoutes.post("/:id/match", requirePermission(Resources.PO, Actions.Update), async (req, res, next) => {
  try {
    const inv = await service.runThreeWayMatch(req.tenant!.id, req.params.id!, ctx(req));
    res.json(inv);
  } catch (err) { next(err); }
});

vendorInvoiceRoutes.post("/:id/approve", requirePermission(Resources.PO, Actions.Approve), async (req, res, next) => {
  try {
    const input = vendorInvoiceApproveSchema.parse(req.body ?? {});
    const inv = await service.approveVendorInvoice(req.params.id!, ctx(req), input);
    res.json(inv);
  } catch (err) { next(err); }
});

vendorInvoiceRoutes.post("/:id/cancel", requirePermission(Resources.PO, Actions.Cancel), async (req, res, next) => {
  try {
    await service.cancelVendorInvoice(req.params.id!, ctx(req));
    res.status(204).end();
  } catch (err) { next(err); }
});

function ctx(req: any) {
  return {
    tenantId: req.tenant!.id,
    userId: req.auth!.sub,
    isTenantAdmin: req.auth!.ta,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  };
}
