import { Router } from "express";
import { z } from "zod";
import { prCreateSchema } from "@indus/shared";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { requirePermission } from "../middleware/rbac";
import { Resources, Actions } from "@indus/shared";
import * as prService from "../services/pr.service";

export const prRoutes: Router = Router();

prRoutes.use(requireAuth, requireTenant);

const decisionInput = z.object({ comment: z.string().max(1000).optional() });

prRoutes.get("/", requirePermission(Resources.PR, Actions.Read), async (req, res, next) => {
  try {
    const page = req.query.page ? Number(req.query.page) : 1;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 25;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const mine = req.query.mine === "true";
    const buyer = req.query.buyer === "me";
    const result = await prService.listPrs(req.tenant!.id, {
      page,
      pageSize,
      search,
      status,
      requesterId: mine ? req.auth!.sub : undefined,
      buyerUserId: buyer ? req.auth!.sub : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

prRoutes.get("/:id", requirePermission(Resources.PR, Actions.Read), async (req, res, next) => {
  try {
    const pr = await prService.getPr(req.tenant!.id, req.params.id!);
    res.json(pr);
  } catch (err) {
    next(err);
  }
});

prRoutes.post("/", requirePermission(Resources.PR, Actions.Create), async (req, res, next) => {
  try {
    const input = prCreateSchema.parse(req.body);
    const pr = await prService.createPr(input, {
      tenantId: req.tenant!.id,
      userId: req.auth!.sub,
      isTenantAdmin: req.auth!.ta,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json(pr);
  } catch (err) {
    next(err);
  }
});

prRoutes.patch("/:id", requirePermission(Resources.PR, Actions.Update), async (req, res, next) => {
  try {
    const input = prCreateSchema.parse(req.body);
    const updated = await prService.updatePr(req.params.id!, input, {
      tenantId: req.tenant!.id,
      userId: req.auth!.sub,
      isTenantAdmin: req.auth!.ta,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

prRoutes.post("/:id/submit", requirePermission(Resources.PR, Actions.Submit), async (req, res, next) => {
  try {
    const { comment } = decisionInput.parse(req.body ?? {});
    await prService.submitPr(req.params.id!, {
      tenantId: req.tenant!.id,
      userId: req.auth!.sub,
      isTenantAdmin: req.auth!.ta,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    }, comment);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

prRoutes.post("/:id/approve", requirePermission(Resources.PR, Actions.Approve), async (req, res, next) => {
  try {
    const { comment } = decisionInput.parse(req.body ?? {});
    await prService.approvePr(req.params.id!, {
      tenantId: req.tenant!.id,
      userId: req.auth!.sub,
      isTenantAdmin: req.auth!.ta,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    }, comment);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

prRoutes.post("/:id/send-back", requirePermission(Resources.PR, Actions.Reject), async (req, res, next) => {
  try {
    const { comment } = decisionInput.parse(req.body ?? {});
    await prService.sendBackPr(req.params.id!, {
      tenantId: req.tenant!.id,
      userId: req.auth!.sub,
      isTenantAdmin: req.auth!.ta,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    }, comment);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

prRoutes.post("/:id/clone", requirePermission(Resources.PR, Actions.Create), async (req, res, next) => {
  try {
    const cloned = await prService.clonePr(req.params.id!, {
      tenantId: req.tenant!.id,
      userId: req.auth!.sub,
      isTenantAdmin: req.auth!.ta,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json(cloned);
  } catch (err) {
    next(err);
  }
});

prRoutes.get("/:id/related-pos", requirePermission(Resources.PR, Actions.Read), async (req, res, next) => {
  try {
    // Lazy import to avoid circular dep with po.service
    const { listPosFromPr } = await import("../services/po.service");
    const pos = await listPosFromPr(req.tenant!.id, req.params.id!);
    res.json(pos);
  } catch (err) {
    next(err);
  }
});

prRoutes.post("/:id/reject", requirePermission(Resources.PR, Actions.Reject), async (req, res, next) => {
  try {
    const { comment } = decisionInput.parse(req.body ?? {});
    await prService.rejectPr(req.params.id!, {
      tenantId: req.tenant!.id,
      userId: req.auth!.sub,
      isTenantAdmin: req.auth!.ta,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    }, comment);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

prRoutes.post("/:id/cancel", requirePermission(Resources.PR, Actions.Cancel), async (req, res, next) => {
  try {
    const { comment } = decisionInput.parse(req.body ?? {});
    await prService.cancelPr(req.params.id!, {
      tenantId: req.tenant!.id,
      userId: req.auth!.sub,
      isTenantAdmin: req.auth!.ta,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    }, comment);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
