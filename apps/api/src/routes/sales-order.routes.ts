import { Router } from "express";
import { z } from "zod";
import { salesOrderCreateSchema, salesOrderFulfilSchema } from "@indus/shared";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { requirePermission } from "../middleware/rbac";
import { Resources, Actions } from "@indus/shared";
import * as soService from "../services/sales-order.service";

/**
 * Sales Order routes — the sell-side mirror of PO routes. Gates on the PO RBAC
 * resource (there's no dedicated sales-order resource yet; tenant admins bypass).
 */
export const salesOrderRoutes: Router = Router();

salesOrderRoutes.use(requireAuth, requireTenant);

const decision = z.object({ comment: z.string().max(1000).optional() });

salesOrderRoutes.get("/", requirePermission(Resources.PO, Actions.Read), async (req, res, next) => {
  try {
    const result = await soService.listSalesOrders(req.tenant!.id, {
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      customerId: typeof req.query.customerId === "string" ? req.query.customerId : undefined,
    });
    res.json(result);
  } catch (err) { next(err); }
});

salesOrderRoutes.get("/:id", requirePermission(Resources.PO, Actions.Read), async (req, res, next) => {
  try {
    const so = await soService.getSalesOrder(req.tenant!.id, req.params.id!);
    res.json(so);
  } catch (err) { next(err); }
});

salesOrderRoutes.post("/", requirePermission(Resources.PO, Actions.Create), async (req, res, next) => {
  try {
    const input = salesOrderCreateSchema.parse(req.body);
    const so = await soService.createSalesOrder(input, ctx(req));
    res.status(201).json(so);
  } catch (err) { next(err); }
});

salesOrderRoutes.patch("/:id", requirePermission(Resources.PO, Actions.Update), async (req, res, next) => {
  try {
    const input = salesOrderCreateSchema.parse(req.body);
    const updated = await soService.updateSalesOrder(req.params.id!, input, ctx(req));
    res.json(updated);
  } catch (err) { next(err); }
});

salesOrderRoutes.post("/:id/submit", requirePermission(Resources.PO, Actions.Submit), async (req, res, next) => {
  try {
    const { comment } = decision.parse(req.body ?? {});
    await soService.submitSalesOrder(req.params.id!, ctx(req), comment);
    res.status(204).end();
  } catch (err) { next(err); }
});

salesOrderRoutes.post("/:id/approve", requirePermission(Resources.PO, Actions.Approve), async (req, res, next) => {
  try {
    const { comment } = decision.parse(req.body ?? {});
    await soService.approveSalesOrder(req.params.id!, ctx(req), comment);
    res.status(204).end();
  } catch (err) { next(err); }
});

salesOrderRoutes.post("/:id/reject", requirePermission(Resources.PO, Actions.Reject), async (req, res, next) => {
  try {
    const { comment } = decision.parse(req.body ?? {});
    await soService.rejectSalesOrder(req.params.id!, ctx(req), comment);
    res.status(204).end();
  } catch (err) { next(err); }
});

salesOrderRoutes.post("/:id/fulfil", requirePermission(Resources.PO, Actions.Update), async (req, res, next) => {
  try {
    const input = salesOrderFulfilSchema.parse(req.body ?? {});
    const so = await soService.fulfilSalesOrder(req.params.id!, input, ctx(req));
    res.json(so);
  } catch (err) { next(err); }
});

salesOrderRoutes.post("/:id/cancel", requirePermission(Resources.PO, Actions.Cancel), async (req, res, next) => {
  try {
    const { comment } = decision.parse(req.body ?? {});
    await soService.cancelSalesOrder(req.params.id!, ctx(req), comment);
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
