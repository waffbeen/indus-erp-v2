import { Router } from "express";
import { z } from "zod";
import { poCreateSchema } from "@indus/shared";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { requirePermission } from "../middleware/rbac";
import { Resources, Actions } from "@indus/shared";
import * as poService from "../services/po.service";

export const poRoutes: Router = Router();

poRoutes.use(requireAuth, requireTenant);

const decision = z.object({ comment: z.string().max(1000).optional() });

poRoutes.get("/", requirePermission(Resources.PO, Actions.Read), async (req, res, next) => {
  try {
    const result = await poService.listPos(req.tenant!.id, {
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      vendorId: typeof req.query.vendorId === "string" ? req.query.vendorId : undefined,
    });
    res.json(result);
  } catch (err) { next(err); }
});

poRoutes.get("/from-pr/:prId", requirePermission(Resources.PO, Actions.Create), async (req, res, next) => {
  try {
    const data = await poService.getPoDraftFromPr(req.tenant!.id, req.params.prId!);
    res.json(data);
  } catch (err) { next(err); }
});

poRoutes.get("/:id", requirePermission(Resources.PO, Actions.Read), async (req, res, next) => {
  try {
    const po = await poService.getPo(req.tenant!.id, req.params.id!);
    res.json(po);
  } catch (err) { next(err); }
});

poRoutes.post("/", requirePermission(Resources.PO, Actions.Create), async (req, res, next) => {
  try {
    const input = poCreateSchema.parse(req.body);
    const po = await poService.createPo(input, ctx(req));
    res.status(201).json(po);
  } catch (err) { next(err); }
});

poRoutes.post("/:id/submit", requirePermission(Resources.PO, Actions.Submit), async (req, res, next) => {
  try {
    const { comment } = decision.parse(req.body ?? {});
    await poService.submitPo(req.params.id!, ctx(req), comment);
    res.status(204).end();
  } catch (err) { next(err); }
});

poRoutes.post("/:id/approve", requirePermission(Resources.PO, Actions.Approve), async (req, res, next) => {
  try {
    const { comment } = decision.parse(req.body ?? {});
    await poService.approvePo(req.params.id!, ctx(req), comment);
    res.status(204).end();
  } catch (err) { next(err); }
});

poRoutes.post("/:id/reject", requirePermission(Resources.PO, Actions.Reject), async (req, res, next) => {
  try {
    const { comment } = decision.parse(req.body ?? {});
    await poService.rejectPo(req.params.id!, ctx(req), comment);
    res.status(204).end();
  } catch (err) { next(err); }
});

poRoutes.post("/:id/send", requirePermission(Resources.PO, Actions.Update), async (req, res, next) => {
  try {
    const { comment } = decision.parse(req.body ?? {});
    await poService.sendToVendor(req.params.id!, ctx(req), comment);
    res.status(204).end();
  } catch (err) { next(err); }
});

poRoutes.post("/:id/cancel", requirePermission(Resources.PO, Actions.Cancel), async (req, res, next) => {
  try {
    const { comment } = decision.parse(req.body ?? {});
    await poService.cancelPo(req.params.id!, ctx(req), comment);
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
