import { Router } from "express";
import { customerCreateSchema, customerUpdateSchema } from "@indus/shared";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { requirePermission } from "../middleware/rbac";
import { Resources, Actions } from "@indus/shared";
import * as customerService from "../services/customer.service";

/**
 * Customer master routes — the sell-side mirror of vendor routes. There is no
 * dedicated "customer" RBAC resource yet, so these gate on the Vendor resource
 * (masters follow the same permission; tenant admins bypass regardless).
 */
export const customerRoutes: Router = Router();

customerRoutes.use(requireAuth, requireTenant);

customerRoutes.get("/", requirePermission(Resources.Vendor, Actions.Read), async (req, res, next) => {
  try {
    const page = req.query.page ? Number(req.query.page) : 1;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 25;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const result = await customerService.listCustomers(req.tenant!.id, { page, pageSize, search });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

customerRoutes.get("/:id", requirePermission(Resources.Vendor, Actions.Read), async (req, res, next) => {
  try {
    const customer = await customerService.getCustomer(req.tenant!.id, req.params.id!);
    res.json(customer);
  } catch (err) {
    next(err);
  }
});

customerRoutes.post("/", requirePermission(Resources.Vendor, Actions.Create), async (req, res, next) => {
  try {
    const input = customerCreateSchema.parse(req.body);
    const created = await customerService.createCustomer(input, ctx(req));
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

customerRoutes.patch("/:id", requirePermission(Resources.Vendor, Actions.Update), async (req, res, next) => {
  try {
    const input = customerUpdateSchema.parse(req.body);
    const updated = await customerService.updateCustomer(req.params.id!, input, ctx(req));
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

customerRoutes.delete("/:id", requirePermission(Resources.Vendor, Actions.Delete), async (req, res, next) => {
  try {
    await customerService.deleteCustomer(req.params.id!, ctx(req));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

function ctx(req: any) {
  return {
    tenantId: req.tenant!.id,
    userId: req.auth!.sub,
    userEmail: "",
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  };
}
