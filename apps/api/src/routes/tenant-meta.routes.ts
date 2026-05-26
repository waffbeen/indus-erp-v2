import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { Forbidden } from "../lib/errors";
import * as service from "../services/tenant-meta.service";

export const tenantMetaRoutes: Router = Router();

tenantMetaRoutes.use(requireAuth, requireTenant);

const settingsPatchSchema = z.object({
  grn: z.object({ batchMode: z.boolean().optional() }).optional(),
  approval: z.object({
    prLevels: z.number().int().min(1).max(3).optional(),
    poLevels: z.number().int().min(1).max(3).optional(),
  }).optional(),
});

tenantMetaRoutes.get("/companies", async (req, res, next) => {
  try {
    const rows = await service.listCompanies(req.tenant!.id);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

tenantMetaRoutes.get("/units", async (req, res, next) => {
  try {
    const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
    const rows = await service.listUnits(req.tenant!.id, companyId);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

tenantMetaRoutes.get("/users", async (req, res, next) => {
  try {
    const rows = await service.listTenantUsers(req.tenant!.id);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

tenantMetaRoutes.get("/departments", async (req, res, next) => {
  try {
    const unitId = typeof req.query.unitId === "string" ? req.query.unitId : undefined;
    const rows = await service.listDepartments(req.tenant!.id, unitId);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

tenantMetaRoutes.get("/settings", async (req, res, next) => {
  try {
    const settings = await service.getTenantSettings(req.tenant!.id);
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

tenantMetaRoutes.patch("/settings", async (req, res, next) => {
  try {
    if (!req.auth!.ta) {
      throw Forbidden("admin_only", "Only tenant admins can change settings");
    }
    const patch = settingsPatchSchema.parse(req.body ?? {});
    const next = await service.updateTenantSettings(req.tenant!.id, patch);
    res.json(next);
  } catch (err) {
    next(err);
  }
});
