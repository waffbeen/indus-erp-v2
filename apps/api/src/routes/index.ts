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
import { whatsappRoutes } from "./whatsapp.routes";
import { rfqRoutes } from "./rfq.routes";
import { vendorPortalRoutes } from "./vendor-portal.routes";
// Sales / Distribution (sell-side)
import { customerRoutes } from "./customer.routes";
import { salesOrderRoutes } from "./sales-order.routes";
import { salesInvoiceRoutes } from "./sales-invoice.routes";
// GST & Compliance suite
import { complianceRoutes } from "./compliance.routes";
// AI Procurement Copilot + Insights + Document AI
import { copilotRoutes } from "./copilot.routes";

export const apiRouter: Router = Router();

// Public
apiRouter.use(healthRoutes);
apiRouter.use("/auth", authRoutes);
// Public vendor/supplier portal — auth is the opaque token in the path
apiRouter.use("/portal", vendorPortalRoutes);

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
apiRouter.use("/whatsapp", whatsappRoutes);
apiRouter.use("/rfq", rfqRoutes);
// Sales / Distribution (sell-side)
apiRouter.use("/customers", customerRoutes);
apiRouter.use("/sales-orders", salesOrderRoutes);
apiRouter.use("/sales-invoices", salesInvoiceRoutes);
// GST & Compliance suite
apiRouter.use("/compliance", complianceRoutes);
// AI Procurement Copilot + Insights + Document AI
apiRouter.use("/copilot", copilotRoutes);
