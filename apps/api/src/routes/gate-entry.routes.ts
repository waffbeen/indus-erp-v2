import { Router } from "express";
import { gateEntryCreateSchema } from "@indus/shared";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { requirePermission } from "../middleware/rbac";
import { Resources, Actions } from "@indus/shared";
import * as service from "../services/gate-entry.service";

export const gateEntryRoutes: Router = Router();

gateEntryRoutes.use(requireAuth, requireTenant);

gateEntryRoutes.get("/", requirePermission(Resources.GateEntry, Actions.Read), async (req, res, next) => {
  try {
    const result = await service.listGateEntries(req.tenant!.id, {
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      type: typeof req.query.type === "string" ? req.query.type : undefined,
    });
    res.json(result);
  } catch (err) { next(err); }
});

gateEntryRoutes.get("/:id", requirePermission(Resources.GateEntry, Actions.Read), async (req, res, next) => {
  try {
    const ge = await service.getGateEntry(req.tenant!.id, req.params.id!);
    res.json(ge);
  } catch (err) { next(err); }
});

gateEntryRoutes.post("/", requirePermission(Resources.GateEntry, Actions.Create), async (req, res, next) => {
  try {
    const input = gateEntryCreateSchema.parse(req.body);
    const ge = await service.createGateEntry(input, ctx(req));
    res.status(201).json(ge);
  } catch (err) { next(err); }
});

gateEntryRoutes.post("/:id/close", requirePermission(Resources.GateEntry, Actions.Update), async (req, res, next) => {
  try {
    await service.closeGateEntry(req.params.id!, ctx(req));
    res.status(204).end();
  } catch (err) { next(err); }
});

gateEntryRoutes.post("/:id/cancel", requirePermission(Resources.GateEntry, Actions.Cancel), async (req, res, next) => {
  try {
    await service.cancelGateEntry(req.params.id!, ctx(req));
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
