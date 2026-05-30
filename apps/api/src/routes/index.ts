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
import { stockRoutes } from "./stock.routes";
import { notificationRoutes } from "./notification.routes";
import { inviteRoutes, inviteAcceptRoutes } from "./invite.routes";
import { mastersRoutes } from "./masters.routes";
import { dashboardRoutes } from "./dashboard.routes";
import { valuationRoutes, reorderRoutes, locationRoutes, stockCountRoutes } from "./inventory-extra.routes";
import { vendorInvoiceRoutes } from "./vendor-invoice.routes";
import { paymentRoutes } from "./payment.routes";
import { aiRoutes } from "./ai.routes";
import { mailRoutes } from "./mail.routes";

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
apiRouter.use("/stock", stockRoutes);
apiRouter.use("/notifications", notificationRoutes);
apiRouter.use("/masters", mastersRoutes);
apiRouter.use("/invites", inviteRoutes);
apiRouter.use("/accept-invite", inviteAcceptRoutes);
apiRouter.use("/valuation", valuationRoutes);
apiRouter.use("/reorder", reorderRoutes);
apiRouter.use("/locations", locationRoutes);
apiRouter.use("/stock-counts", stockCountRoutes);
apiRouter.use("/vendor-invoices", vendorInvoiceRoutes);
apiRouter.use("/payments", paymentRoutes);
apiRouter.use("/ai", aiRoutes);
apiRouter.use("/mail", mailRoutes);
