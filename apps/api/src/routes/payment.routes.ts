import { Router } from "express";
import { paymentCreateSchema } from "@indus/shared";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { requirePermission } from "../middleware/rbac";
import { Resources, Actions } from "@indus/shared";
import * as service from "../services/payment.service";

/**
 * Vendor payment routes. CRUD gates on the PO resource (finance follows
 * procurement perms for now); the AP-ageing report gates on the Report resource.
 */
export const paymentRoutes: Router = Router();

paymentRoutes.use(requireAuth, requireTenant);

paymentRoutes.get("/", requirePermission(Resources.PO, Actions.Read), async (req, res, next) => {
  try {
    const result = await service.listPayments(req.tenant!.id, {
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      vendorId: typeof req.query.vendorId === "string" ? req.query.vendorId : undefined,
      method: typeof req.query.method === "string" ? req.query.method : undefined,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
    });
    res.json(result);
  } catch (err) { next(err); }
});

// AP ageing report — declared before "/:id" so the literal path wins.
paymentRoutes.get("/aging", requirePermission(Resources.Report, Actions.Read), async (req, res, next) => {
  try {
    const data = await service.getApAging(req.tenant!.id, {
      asOf: typeof req.query.asOf === "string" ? req.query.asOf : undefined,
    });
    res.json(data);
  } catch (err) { next(err); }
});

// Outstanding invoices for a vendor — feeds the payment allocator UI.
paymentRoutes.get("/outstanding/:vendorId", requirePermission(Resources.PO, Actions.Read), async (req, res, next) => {
  try {
    const data = await service.getOutstandingInvoices(req.tenant!.id, req.params.vendorId!);
    res.json({ items: data });
  } catch (err) { next(err); }
});

paymentRoutes.get("/:id", requirePermission(Resources.PO, Actions.Read), async (req, res, next) => {
  try {
    const pay = await service.getPayment(req.tenant!.id, req.params.id!);
    res.json(pay);
  } catch (err) { next(err); }
});

paymentRoutes.post("/", requirePermission(Resources.PO, Actions.Create), async (req, res, next) => {
  try {
    const input = paymentCreateSchema.parse(req.body);
    const pay = await service.recordPayment(input, ctx(req));
    res.status(201).json(pay);
  } catch (err) { next(err); }
});

paymentRoutes.post("/:id/cancel", requirePermission(Resources.PO, Actions.Cancel), async (req, res, next) => {
  try {
    await service.cancelPayment(req.params.id!, ctx(req));
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
