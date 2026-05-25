import { Router } from "express";
import { authRoutes } from "./auth.routes";
import { healthRoutes } from "./health.routes";
import { prRoutes } from "./pr.routes";
import { poRoutes } from "./po.routes";
import { vendorRoutes } from "./vendor.routes";
import { itemRoutes } from "./item.routes";
import { tenantMetaRoutes } from "./tenant-meta.routes";
import { gateEntryRoutes } from "./gate-entry.routes";
import { grnRoutes } from "./grn.routes";
import { dashboardRoutes } from "./dashboard.routes";

export const apiRouter: Router = Router();

// Public
apiRouter.use(healthRoutes);
apiRouter.use("/auth", authRoutes);

// Tenant-scoped (middleware applied inside each module's router)
apiRouter.use("/tenant", tenantMetaRoutes);
apiRouter.use("/dashboard", dashboardRoutes);
apiRouter.use("/vendors", vendorRoutes);
apiRouter.use("/items", itemRoutes);
apiRouter.use("/pr", prRoutes);
apiRouter.use("/po", poRoutes);
apiRouter.use("/gate-entry", gateEntryRoutes);
apiRouter.use("/grn", grnRoutes);
