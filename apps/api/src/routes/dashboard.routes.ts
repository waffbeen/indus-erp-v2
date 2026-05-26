import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import * as service from "../services/dashboard.service";

export const dashboardRoutes: Router = Router();

dashboardRoutes.use(requireAuth, requireTenant);

dashboardRoutes.get("/stats", async (req, res, next) => {
  try {
    const data = await service.getDashboardStats(req.tenant!.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

dashboardRoutes.get("/reports/pr-aging", async (req, res, next) => {
  try {
    const data = await service.getPrAgingReport(req.tenant!.id);
    res.json(data);
  } catch (err) { next(err); }
});

dashboardRoutes.get("/reports/vendor-spend", async (req, res, next) => {
  try {
    const data = await service.getVendorSpendReport(req.tenant!.id);
    res.json(data);
  } catch (err) { next(err); }
});

dashboardRoutes.get("/reports/top-items", async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 25;
    const data = await service.getTopItemsReport(req.tenant!.id, limit);
    res.json(data);
  } catch (err) { next(err); }
});
