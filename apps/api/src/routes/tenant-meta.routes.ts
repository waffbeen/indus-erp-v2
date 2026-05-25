import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import * as service from "../services/tenant-meta.service";

export const tenantMetaRoutes: Router = Router();

tenantMetaRoutes.use(requireAuth, requireTenant);

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
