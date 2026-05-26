import { Router } from "express";
import { grnCreateSchema } from "@indus/shared";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { requirePermission } from "../middleware/rbac";
import { Resources, Actions } from "@indus/shared";
import * as service from "../services/grn.service";

export const grnRoutes: Router = Router();

grnRoutes.use(requireAuth, requireTenant);

grnRoutes.get("/", requirePermission(Resources.GRN, Actions.Read), async (req, res, next) => {
  try {
    const result = await service.listGrns(req.tenant!.id, {
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      poId: typeof req.query.poId === "string" ? req.query.poId : undefined,
      vendorId: typeof req.query.vendorId === "string" ? req.query.vendorId : undefined,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
    });
    res.json(result);
  } catch (err) { next(err); }
});

grnRoutes.get("/from-po/:poId", requirePermission(Resources.GRN, Actions.Create), async (req, res, next) => {
  try {
    const data = await service.getGrnDraftFromPo(req.tenant!.id, req.params.poId!);
    res.json(data);
  } catch (err) { next(err); }
});

grnRoutes.get("/:id", requirePermission(Resources.GRN, Actions.Read), async (req, res, next) => {
  try {
    const grn = await service.getGrn(req.tenant!.id, req.params.id!);
    res.json(grn);
  } catch (err) { next(err); }
});

grnRoutes.post("/", requirePermission(Resources.GRN, Actions.Create), async (req, res, next) => {
  try {
    const input = grnCreateSchema.parse(req.body);
    const grn = await service.createGrn(input, ctx(req));
    res.status(201).json(grn);
  } catch (err) { next(err); }
});

grnRoutes.post("/:id/cancel", requirePermission(Resources.GRN, Actions.Cancel), async (req, res, next) => {
  try {
    await service.cancelGrn(req.params.id!, ctx(req));
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
