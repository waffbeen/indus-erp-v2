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

/* ----- Payment Terms ----- */

const paymentTermSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(120),
  isActive: z.boolean().optional(),
});

mastersRoutes.get("/payment-terms", async (req, res, next) => {
  try {
    await service.ensureDefaultPaymentTerms(req.tenant!.id);
    res.json(await service.listPaymentTerms(req.tenant!.id));
  } catch (err) { next(err); }
});
mastersRoutes.post("/payment-terms", async (req, res, next) => {
  try {
    const row = await service.upsertPaymentTerm(ctx(req), paymentTermSchema.parse(req.body));
    res.status(201).json(row);
  } catch (err) { next(err); }
});
mastersRoutes.delete("/payment-terms/:id", async (req, res, next) => {
  try {
    await service.deletePaymentTerm(ctx(req), req.params.id!);
    res.status(204).end();
  } catch (err) { next(err); }
});

/* ----- Delivery Terms ----- */

const deliveryTermSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(120),
  isActive: z.boolean().optional(),
});

mastersRoutes.get("/delivery-terms", async (req, res, next) => {
  try {
    await service.ensureDefaultDeliveryTerms(req.tenant!.id);
    res.json(await service.listDeliveryTerms(req.tenant!.id));
  } catch (err) { next(err); }
});
mastersRoutes.post("/delivery-terms", async (req, res, next) => {
  try {
    const row = await service.upsertDeliveryTerm(ctx(req), deliveryTermSchema.parse(req.body));
    res.status(201).json(row);
  } catch (err) { next(err); }
});
mastersRoutes.delete("/delivery-terms/:id", async (req, res, next) => {
  try {
    await service.deleteDeliveryTerm(ctx(req), req.params.id!);
    res.status(204).end();
  } catch (err) { next(err); }
});

/* ----- Cancellation Reasons ----- */

const cancelReasonSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(200),
  isActive: z.boolean().optional(),
});

mastersRoutes.get("/cancel-reasons", async (req, res, next) => {
  try {
    await service.ensureDefaultCancelReasons(req.tenant!.id);
    res.json(await service.listCancelReasons(req.tenant!.id));
  } catch (err) { next(err); }
});
mastersRoutes.post("/cancel-reasons", async (req, res, next) => {
  try {
    const row = await service.upsertCancelReason(ctx(req), cancelReasonSchema.parse(req.body));
    res.status(201).json(row);
  } catch (err) { next(err); }
});
mastersRoutes.delete("/cancel-reasons/:id", async (req, res, next) => {
  try {
    await service.deleteCancelReason(ctx(req), req.params.id!);
    res.status(204).end();
  } catch (err) { next(err); }
});

/* ----- Item Groups ----- */

const nameCodeSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().max(40).optional().nullable(),
  name: z.string().trim().min(1).max(120),
  isActive: z.boolean().optional(),
});

mastersRoutes.get("/item-groups", async (req, res, next) => {
  try { res.json(await service.listItemGroups(req.tenant!.id)); } catch (err) { next(err); }
});
mastersRoutes.post("/item-groups", async (req, res, next) => {
  try {
    const row = await service.upsertItemGroup(ctx(req), nameCodeSchema.parse(req.body));
    res.status(201).json(row);
  } catch (err) { next(err); }
});
mastersRoutes.delete("/item-groups/:id", async (req, res, next) => {
  try {
    await service.deleteItemGroup(ctx(req), req.params.id!);
    res.status(204).end();
  } catch (err) { next(err); }
});

/* ----- Item Sub-Groups ----- */

const subGroupSchema = z.object({
  id: z.string().uuid().optional(),
  groupId: z.string().uuid().optional().nullable(),
  code: z.string().trim().max(40).optional().nullable(),
  name: z.string().trim().min(1).max(120),
  isActive: z.boolean().optional(),
});

mastersRoutes.get("/item-sub-groups", async (req, res, next) => {
  try { res.json(await service.listItemSubGroups(req.tenant!.id)); } catch (err) { next(err); }
});
mastersRoutes.post("/item-sub-groups", async (req, res, next) => {
  try {
    const row = await service.upsertItemSubGroup(ctx(req), subGroupSchema.parse(req.body));
    res.status(201).json(row);
  } catch (err) { next(err); }
});
mastersRoutes.delete("/item-sub-groups/:id", async (req, res, next) => {
  try {
    await service.deleteItemSubGroup(ctx(req), req.params.id!);
    res.status(204).end();
  } catch (err) { next(err); }
});

/* ----- Item Categories ----- */

mastersRoutes.get("/item-categories", async (req, res, next) => {
  try { res.json(await service.listItemCategories(req.tenant!.id)); } catch (err) { next(err); }
});
mastersRoutes.post("/item-categories", async (req, res, next) => {
  try {
    const row = await service.upsertItemCategory(ctx(req), nameCodeSchema.parse(req.body));
    res.status(201).json(row);
  } catch (err) { next(err); }
});
mastersRoutes.delete("/item-categories/:id", async (req, res, next) => {
  try {
    await service.deleteItemCategory(ctx(req), req.params.id!);
    res.status(204).end();
  } catch (err) { next(err); }
});

/* ----- Brands ----- */

const brandSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  isActive: z.boolean().optional(),
});

mastersRoutes.get("/brands", async (req, res, next) => {
  try { res.json(await service.listBrands(req.tenant!.id)); } catch (err) { next(err); }
});
mastersRoutes.post("/brands", async (req, res, next) => {
  try {
    const row = await service.upsertBrand(ctx(req), brandSchema.parse(req.body));
    res.status(201).json(row);
  } catch (err) { next(err); }
});
mastersRoutes.delete("/brands/:id", async (req, res, next) => {
  try {
    await service.deleteBrand(ctx(req), req.params.id!);
    res.status(204).end();
  } catch (err) { next(err); }
});

/* ----- Cost Centres ----- */

mastersRoutes.get("/cost-centers", async (req, res, next) => {
  try { res.json(await service.listCostCenters(req.tenant!.id)); } catch (err) { next(err); }
});
mastersRoutes.post("/cost-centers", async (req, res, next) => {
  try {
    const row = await service.upsertCostCenter(ctx(req), nameCodeSchema.parse(req.body));
    res.status(201).json(row);
  } catch (err) { next(err); }
});
mastersRoutes.delete("/cost-centers/:id", async (req, res, next) => {
  try {
    await service.deleteCostCenter(ctx(req), req.params.id!);
    res.status(204).end();
  } catch (err) { next(err); }
});
