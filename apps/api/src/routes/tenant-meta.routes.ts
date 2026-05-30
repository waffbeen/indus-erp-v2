import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { Forbidden } from "../lib/errors";
import * as service from "../services/tenant-meta.service";
import * as sampleData from "../services/sample-data.service";

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

const deptCreateSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  code: z.string().trim().max(20).optional().nullable(),
  unitId: z.string().uuid().optional().nullable(),
});
tenantMetaRoutes.post("/departments", async (req, res, next) => {
  try {
    if (!req.auth!.ta) throw Forbidden("admin_only", "Only tenant admins can add departments");
    const input = deptCreateSchema.parse(req.body);
    const row = await service.createDepartment(req.tenant!.id, input);
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

tenantMetaRoutes.delete("/departments/:id", async (req, res, next) => {
  try {
    if (!req.auth!.ta) throw Forbidden("admin_only", "Only tenant admins can remove departments");
    await service.deleteDepartment(req.tenant!.id, req.params.id!);
    res.status(204).end();
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

/** POST /tenant/sample-data — fill the workspace with demo vendors/items + a PR->PO chain. */
tenantMetaRoutes.post("/sample-data", async (req, res, next) => {
  try {
    if (!req.auth!.ta) throw Forbidden("admin_only", "Only workspace admins can load sample data");
    const result = await sampleData.seedSampleData({ tenantId: req.tenant!.id, userId: req.auth!.sub });
    res.json(result);
  } catch (err) {
    next(err);
  }
});
