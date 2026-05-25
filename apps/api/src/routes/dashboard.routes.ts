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
