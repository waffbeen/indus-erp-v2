import { Router } from "express";
import {
  locationUpsertSchema,
  stockPolicyUpsertSchema,
  stockCountCreateSchema,
  stockCountEntrySchema,
} from "@indus/shared";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import * as valuationService from "../services/valuation.service";
import * as reorderService from "../services/reorder.service";
import * as locationService from "../services/location.service";
import * as stockCountService from "../services/stock-count.service";

/**
 * Phase-2 inventory depth: valuation, reorder, locations, cycle counts.
 * Mounted under NEW base paths so it never collides with the existing
 * "/stock" router. Four routers, one per resource, exported separately.
 */

function ctx(req: any) {
  return {
    tenantId: req.tenant!.id,
    userId: req.auth!.sub,
    isTenantAdmin: req.auth!.ta,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  };
}

/* =================== Valuation =================== */

export const valuationRoutes: Router = Router();
valuationRoutes.use(requireAuth, requireTenant);

valuationRoutes.get("/", async (req, res, next) => {
  try {
    const unitId = typeof req.query.unitId === "string" ? req.query.unitId : undefined;
    const itemGroup = typeof req.query.itemGroup === "string" ? req.query.itemGroup : undefined;
    const method = req.query.method === "fifo" ? "fifo" : "wac";
    const asOf = typeof req.query.asOf === "string" ? req.query.asOf : undefined;
    const data = await valuationService.getStockValuation(req.tenant!.id, { unitId, itemGroup, method, asOf });
    res.json(data);
  } catch (err) { next(err); }
});

/* =================== Reorder =================== */

export const reorderRoutes: Router = Router();
reorderRoutes.use(requireAuth, requireTenant);

// Suggestions board
reorderRoutes.get("/", async (req, res, next) => {
  try {
    const unitId = typeof req.query.unitId === "string" ? req.query.unitId : undefined;
    const data = await reorderService.getReorderSuggestions(req.tenant!.id, { unitId });
    res.json(data);
  } catch (err) { next(err); }
});

// Stocking policies that drive the board
reorderRoutes.get("/policies", async (req, res, next) => {
  try {
    const unitId = typeof req.query.unitId === "string" ? req.query.unitId : undefined;
    const itemId = typeof req.query.itemId === "string" ? req.query.itemId : undefined;
    res.json(await reorderService.listStockPolicies(req.tenant!.id, { unitId, itemId }));
  } catch (err) { next(err); }
});

reorderRoutes.post("/policies", async (req, res, next) => {
  try {
    const input = stockPolicyUpsertSchema.parse(req.body);
    const row = await reorderService.upsertStockPolicy(ctx(req), input);
    res.status(201).json(row);
  } catch (err) { next(err); }
});

reorderRoutes.delete("/policies/:id", async (req, res, next) => {
  try {
    await reorderService.deleteStockPolicy(ctx(req), req.params.id!);
    res.status(204).end();
  } catch (err) { next(err); }
});

/* =================== Locations =================== */

export const locationRoutes: Router = Router();
locationRoutes.use(requireAuth, requireTenant);

locationRoutes.get("/", async (req, res, next) => {
  try {
    const unitId = typeof req.query.unitId === "string" ? req.query.unitId : undefined;
    const includeInactive = req.query.includeInactive === "true";
    res.json(await locationService.listLocations(req.tenant!.id, { unitId, includeInactive }));
  } catch (err) { next(err); }
});

locationRoutes.post("/", async (req, res, next) => {
  try {
    const input = locationUpsertSchema.parse(req.body);
    const row = await locationService.upsertLocation(ctx(req), input);
    res.status(201).json(row);
  } catch (err) { next(err); }
});

locationRoutes.delete("/:id", async (req, res, next) => {
  try {
    await locationService.deleteLocation(ctx(req), req.params.id!);
    res.status(204).end();
  } catch (err) { next(err); }
});

/* =================== Stock counts (cycle count) =================== */

export const stockCountRoutes: Router = Router();
stockCountRoutes.use(requireAuth, requireTenant);

stockCountRoutes.get("/", async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const unitId = typeof req.query.unitId === "string" ? req.query.unitId : undefined;
    res.json(await stockCountService.listCounts(req.tenant!.id, { status, unitId }));
  } catch (err) { next(err); }
});

stockCountRoutes.get("/:id", async (req, res, next) => {
  try {
    res.json(await stockCountService.getCount(req.tenant!.id, req.params.id!));
  } catch (err) { next(err); }
});

stockCountRoutes.post("/", async (req, res, next) => {
  try {
    const input = stockCountCreateSchema.parse(req.body);
    const row = await stockCountService.createCount(ctx(req), input);
    res.status(201).json(row);
  } catch (err) { next(err); }
});

stockCountRoutes.put("/:id/entries", async (req, res, next) => {
  try {
    const input = stockCountEntrySchema.parse(req.body);
    const data = await stockCountService.saveCountedQty(ctx(req), req.params.id!, input.lines);
    res.json(data);
  } catch (err) { next(err); }
});

stockCountRoutes.post("/:id/post", async (req, res, next) => {
  try {
    const row = await stockCountService.postCount(ctx(req), req.params.id!);
    res.json(row);
  } catch (err) { next(err); }
});

stockCountRoutes.post("/:id/cancel", async (req, res, next) => {
  try {
    const row = await stockCountService.cancelCount(ctx(req), req.params.id!);
    res.json(row);
  } catch (err) { next(err); }
});
