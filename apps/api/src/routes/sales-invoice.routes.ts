import { Router } from "express";
import { salesInvoiceCreateSchema, salesReceiptCreateSchema } from "@indus/shared";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { requirePermission } from "../middleware/rbac";
import { Resources, Actions } from "@indus/shared";
import * as service from "../services/sales-invoice.service";

/**
 * Sales Invoice (AR) routes — the sell-side mirror of vendor-invoice routes.
 * Gates on the PO RBAC resource (finance follows procurement permissions for
 * now; tenant admins bypass regardless).
 */
export const salesInvoiceRoutes: Router = Router();

salesInvoiceRoutes.use(requireAuth, requireTenant);

salesInvoiceRoutes.get("/", requirePermission(Resources.PO, Actions.Read), async (req, res, next) => {
  try {
    const result = await service.listSalesInvoices(req.tenant!.id, {
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      customerId: typeof req.query.customerId === "string" ? req.query.customerId : undefined,
      soId: typeof req.query.soId === "string" ? req.query.soId : undefined,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
    });
    res.json(result);
  } catch (err) { next(err); }
});

salesInvoiceRoutes.get("/ar-aging", requirePermission(Resources.PO, Actions.Read), async (req, res, next) => {
  try {
    const asOf = typeof req.query.asOf === "string" ? req.query.asOf : undefined;
    const data = await service.getArAging(req.tenant!.id, { asOf });
    res.json(data);
  } catch (err) { next(err); }
});

salesInvoiceRoutes.get("/from-so/:soId", requirePermission(Resources.PO, Actions.Create), async (req, res, next) => {
  try {
    const data = await service.getInvoiceDraftFromSo(req.tenant!.id, req.params.soId!);
    res.json(data);
  } catch (err) { next(err); }
});

salesInvoiceRoutes.get("/outstanding/:customerId", requirePermission(Resources.PO, Actions.Read), async (req, res, next) => {
  try {
    const data = await service.getOutstandingInvoices(req.tenant!.id, req.params.customerId!);
    res.json(data);
  } catch (err) { next(err); }
});

salesInvoiceRoutes.get("/:id", requirePermission(Resources.PO, Actions.Read), async (req, res, next) => {
  try {
    const inv = await service.getSalesInvoice(req.tenant!.id, req.params.id!);
    res.json(inv);
  } catch (err) { next(err); }
});

salesInvoiceRoutes.post("/", requirePermission(Resources.PO, Actions.Create), async (req, res, next) => {
  try {
    const input = salesInvoiceCreateSchema.parse(req.body);
    const inv = await service.createSalesInvoice(input, ctx(req));
    res.status(201).json(inv);
  } catch (err) { next(err); }
});

salesInvoiceRoutes.post("/:id/issue", requirePermission(Resources.PO, Actions.Approve), async (req, res, next) => {
  try {
    const inv = await service.issueSalesInvoice(req.params.id!, ctx(req));
    res.json(inv);
  } catch (err) { next(err); }
});

salesInvoiceRoutes.post("/:id/cancel", requirePermission(Resources.PO, Actions.Cancel), async (req, res, next) => {
  try {
    await service.cancelSalesInvoice(req.params.id!, ctx(req));
    res.status(204).end();
  } catch (err) { next(err); }
});

salesInvoiceRoutes.post("/receipts", requirePermission(Resources.PO, Actions.Create), async (req, res, next) => {
  try {
    const input = salesReceiptCreateSchema.parse(req.body);
    const receipt = await service.recordReceipt(input, ctx(req));
    res.status(201).json(receipt);
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
