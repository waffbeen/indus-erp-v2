import { Router } from "express";
import { vendorCreateSchema, vendorUpdateSchema } from "@indus/shared";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { requirePermission } from "../middleware/rbac";
import { Resources, Actions } from "@indus/shared";
import * as vendorService from "../services/vendor.service";

export const vendorRoutes: Router = Router();

vendorRoutes.use(requireAuth, requireTenant);

vendorRoutes.get("/", requirePermission(Resources.Vendor, Actions.Read), async (req, res, next) => {
  try {
    const page = req.query.page ? Number(req.query.page) : 1;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 25;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const result = await vendorService.listVendors(req.tenant!.id, { page, pageSize, search });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

vendorRoutes.get("/:id", requirePermission(Resources.Vendor, Actions.Read), async (req, res, next) => {
  try {
    const vendor = await vendorService.getVendor(req.tenant!.id, req.params.id!);
    res.json(vendor);
  } catch (err) {
    next(err);
  }
});

vendorRoutes.post("/", requirePermission(Resources.Vendor, Actions.Create), async (req, res, next) => {
  try {
    const input = vendorCreateSchema.parse(req.body);
    const created = await vendorService.createVendor(input, {
      tenantId: req.tenant!.id,
      userId: req.auth!.sub,
      userEmail: "", // captured lazily — could lookup user but skipping for perf
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

vendorRoutes.patch("/:id", requirePermission(Resources.Vendor, Actions.Update), async (req, res, next) => {
  try {
    const input = vendorUpdateSchema.parse(req.body);
    const updated = await vendorService.updateVendor(req.params.id!, input, {
      tenantId: req.tenant!.id,
      userId: req.auth!.sub,
      userEmail: "",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

vendorRoutes.delete("/:id", requirePermission(Resources.Vendor, Actions.Delete), async (req, res, next) => {
  try {
    await vendorService.deleteVendor(req.params.id!, {
      tenantId: req.tenant!.id,
      userId: req.auth!.sub,
      userEmail: "",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
