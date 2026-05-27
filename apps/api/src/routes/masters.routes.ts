import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import * as service from "../services/masters.service";

export const mastersRoutes: Router = Router();

mastersRoutes.use(requireAuth, requireTenant);

function ctx(req: any) {
  return {
    tenantId: req.tenant!.id,
    userId: req.auth!.sub,
    isTenantAdmin: req.auth!.ta,
  };
}

/* ----- HSN ----- */

mastersRoutes.get("/hsn", async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const rows = await service.listHsnCodes(req.tenant!.id, search);
    res.json(rows);
  } catch (err) { next(err); }
});

const hsnUpsertSchema = z.object({
  code: z.string().trim().min(2, "Code is required").max(20),
  description: z.string().trim().max(300).optional().nullable(),
  defaultGstRate: z.number().int().min(0).max(40).optional().nullable(),
});
mastersRoutes.post("/hsn", async (req, res, next) => {
  try {
    const input = hsnUpsertSchema.parse(req.body);
    const row = await service.upsertHsnCode(ctx(req), input);
    res.status(201).json(row);
  } catch (err) { next(err); }
});

mastersRoutes.delete("/hsn/:id", async (req, res, next) => {
  try {
    await service.deleteHsnCode(ctx(req), req.params.id!);
    res.status(204).end();
  } catch (err) { next(err); }
});

/* ----- UoM ----- */

mastersRoutes.get("/uoms", async (req, res, next) => {
  try {
    // Auto-seed defaults the first time a tenant hits this endpoint so the
    // dropdown isn't empty on fresh installs.
    await service.ensureDefaultUoms(req.tenant!.id);
    const rows = await service.listUoms(req.tenant!.id);
    res.json(rows);
  } catch (err) { next(err); }
});

const uomUpsertSchema = z.object({
  code: z.string().trim().min(1, "Code is required").max(20),
  name: z.string().trim().max(60).optional().nullable(),
});
mastersRoutes.post("/uoms", async (req, res, next) => {
  try {
    const input = uomUpsertSchema.parse(req.body);
    const row = await service.upsertUom(ctx(req), input);
    res.status(201).json(row);
  } catch (err) { next(err); }
});

mastersRoutes.delete("/uoms/:id", async (req, res, next) => {
  try {
    await service.deleteUom(ctx(req), req.params.id!);
    res.status(204).end();
  } catch (err) { next(err); }
});
