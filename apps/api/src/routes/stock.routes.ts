import { Router } from "express";
import { stockMovementInputSchema, stockAdjustInputSchema } from "@indus/shared";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import * as stockService from "../services/stock.service";

export const stockRoutes: Router = Router();

stockRoutes.use(requireAuth, requireTenant);

function ctx(req: any) {
  return {
    tenantId: req.tenant!.id,
    userId: req.auth!.sub,
    isTenantAdmin: req.auth!.ta,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  };
}

stockRoutes.get("/by-item", async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const unitId = typeof req.query.unitId === "string" ? req.query.unitId : undefined;
    const itemGroup = typeof req.query.itemGroup === "string" ? req.query.itemGroup : undefined;
    const nonZeroOnly = req.query.nonZeroOnly === "true";
    const rows = await stockService.getStockByItem(req.tenant!.id, { search, unitId, itemGroup, nonZeroOnly });
    res.json(rows);
  } catch (err) { next(err); }
});

stockRoutes.get("/ledger/:itemId", async (req, res, next) => {
  try {
    const unitId = typeof req.query.unitId === "string" ? req.query.unitId : undefined;
    const data = await stockService.getItemLedger(req.tenant!.id, req.params.itemId!, { unitId });
    res.json(data);
  } catch (err) { next(err); }
});

stockRoutes.post("/issue", async (req, res, next) => {
  try {
    const input = stockMovementInputSchema.parse(req.body);
    const row = await stockService.issueStock(input, ctx(req));
    res.status(201).json(row);
  } catch (err) { next(err); }
});

stockRoutes.post("/adjust", async (req, res, next) => {
  try {
    const input = stockAdjustInputSchema.parse(req.body);
    const row = await stockService.adjustStock(input, ctx(req));
    res.status(201).json(row);
  } catch (err) { next(err); }
});
