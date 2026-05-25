import { Router } from "express";
import { itemCreateSchema, itemUpdateSchema } from "@indus/shared";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { requirePermission } from "../middleware/rbac";
import { Resources, Actions } from "@indus/shared";
import * as itemService from "../services/item.service";

export const itemRoutes: Router = Router();

itemRoutes.use(requireAuth, requireTenant);

itemRoutes.get("/", requirePermission(Resources.Item, Actions.Read), async (req, res, next) => {
  try {
    const page = req.query.page ? Number(req.query.page) : 1;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 25;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const result = await itemService.listItems(req.tenant!.id, { page, pageSize, search });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

itemRoutes.get("/:id", requirePermission(Resources.Item, Actions.Read), async (req, res, next) => {
  try {
    const item = await itemService.getItem(req.tenant!.id, req.params.id!);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

/** Last-purchase lookup — used by PR/PO forms to show historical rate. */
itemRoutes.get("/:id/last-purchase", requirePermission(Resources.Item, Actions.Read), async (req, res, next) => {
  try {
    const info = await itemService.getLastPurchaseInfo(req.tenant!.id, req.params.id!);
    res.json(info);
  } catch (err) {
    next(err);
  }
});

itemRoutes.post("/", requirePermission(Resources.Item, Actions.Create), async (req, res, next) => {
  try {
    const input = itemCreateSchema.parse(req.body);
    const created = await itemService.createItem(input, {
      tenantId: req.tenant!.id,
      userId: req.auth!.sub,
      userEmail: "",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

itemRoutes.patch("/:id", requirePermission(Resources.Item, Actions.Update), async (req, res, next) => {
  try {
    const input = itemUpdateSchema.parse(req.body);
    const updated = await itemService.updateItem(req.params.id!, input, {
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

itemRoutes.delete("/:id", requirePermission(Resources.Item, Actions.Delete), async (req, res, next) => {
  try {
    await itemService.deleteItem(req.params.id!, {
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
