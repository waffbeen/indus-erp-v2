import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "../db/index";
import { companies } from "../db/schema/companies";
import { units } from "../db/schema/units";
import { vendors } from "../db/schema/vendors";
import { items } from "../db/schema/items";
import { purchaseRequisitions } from "../db/schema/pr";
import { prCreateSchema, poCreateSchema } from "@indus/shared";
import * as prService from "./pr.service";
import * as poService from "./po.service";
import { BadRequest } from "../lib/errors";
import { logger } from "../lib/logger";

/**
 * One-click "Load sample data" — fills a fresh workspace with realistic vendors,
 * items, and a flowing PR -> approval -> PO -> sent chain so the whole product is
 * visible in a demo. Reuses the real create services (correct numbering, GST,
 * approvals) rather than fake inserts. Idempotent for masters; transactions are
 * only seeded when the tenant has < 3 PRs (so re-clicking doesn't pile up).
 */

const SAMPLE_VENDORS = [
  { name: "Acme Steel Pvt Ltd", legalName: "Acme Steel Private Limited", gstin: "27AABCA1234M1ZX", pan: "AABCA1234M", contactPerson: "Mahesh Patil", email: "sales@acmesteel.in", phone: "+91 9820012345", city: "Mumbai", state: "Maharashtra", pincode: "400001", paymentTerms: "Net 30" },
  { name: "Bharat Forge Industries", legalName: "Bharat Forge Industries Pvt Ltd", gstin: "27BFGCA5678N1ZY", pan: "BFGCA5678N", contactPerson: "Anita Sharma", email: "purchase@bharatforge.in", phone: "+91 9820098765", city: "Pune", state: "Maharashtra", pincode: "411001", paymentTerms: "Net 45" },
  { name: "Reliance Polymers Ltd", legalName: "Reliance Polymers Limited", gstin: "24RLNPL9876P1ZQ", pan: "RLNPL9876P", contactPerson: "Rakesh Mehta", email: "rakesh@reliancepoly.in", phone: "+91 9876543210", city: "Ahmedabad", state: "Gujarat", pincode: "380001", paymentTerms: "50% advance" },
  { name: "Surya Roshni Electricals", legalName: "Surya Roshni Limited", gstin: "07SURRC3456L1ZP", pan: "SURRC3456L", contactPerson: "Vikram Singh", email: "orders@suryaroshni.in", phone: "+91 9810234567", city: "New Delhi", state: "Delhi", pincode: "110001", paymentTerms: "Net 30" },
  { name: "TVS Logistics Services", legalName: "TVS Logistics Services Ltd", gstin: "33TVSLS2345K1ZN", pan: "TVSLS2345K", contactPerson: "Karthik R.", email: "service@tvslogistics.com", phone: "+91 9445678901", city: "Chennai", state: "Tamil Nadu", pincode: "600001", paymentTerms: "Net 15" },
];

const SAMPLE_ITEMS = [
  { name: "Deep Groove Ball Bearing 6204-ZZ", description: "Single row, sealed both sides", category: "Spares", itemGroupName: "Spares", itemSubGroupName: "Bearings", uom: "nos", hsnCode: "84821000", defaultTaxRate: 18, rate: 180 },
  { name: "Deep Groove Ball Bearing 6205-2RS", description: "Rubber sealed, 25x52x15mm", category: "Spares", itemGroupName: "Spares", itemSubGroupName: "Bearings", uom: "nos", hsnCode: "84821000", defaultTaxRate: 18, rate: 220 },
  { name: "Engine Oil SAE 20W-40 (1L)", description: "Multi-grade mineral oil, API SL", category: "Consumables", itemGroupName: "Consumables", itemSubGroupName: "Lubricants", uom: "ltr", hsnCode: "27101981", defaultTaxRate: 18, rate: 320 },
  { name: "Lithium Grease (500g)", description: "EP-2 multi-purpose grease", category: "Consumables", itemGroupName: "Consumables", itemSubGroupName: "Lubricants", uom: "nos", hsnCode: "34031900", defaultTaxRate: 18, rate: 240 },
  { name: "LED Tube Light 18W (4ft)", description: "Cool daylight 6500K", category: "Electrical", itemGroupName: "Electrical", itemSubGroupName: "Lighting", uom: "nos", hsnCode: "85395000", defaultTaxRate: 12, rate: 380 },
  { name: "MCB 32A Single Pole", description: "C-curve, 10kA", category: "Electrical", itemGroupName: "Electrical", itemSubGroupName: "Switchgear", uom: "nos", hsnCode: "85362020", defaultTaxRate: 18, rate: 290 },
  { name: "Mild Steel Round Bar 12mm", description: "Fe-410 grade, per kg", category: "Raw Material", itemGroupName: "Raw Material", itemSubGroupName: "Steel", uom: "kg", hsnCode: "72142090", defaultTaxRate: 18, rate: 68 },
  { name: "A4 Photocopier Paper (500 sheets)", description: "75 GSM", category: "Office", itemGroupName: "Office Supplies", itemSubGroupName: "Stationery", uom: "ream", hsnCode: "48025690", defaultTaxRate: 12, rate: 280 },
];

interface Ctx {
  tenantId: string;
  userId: string;
}
type Line = { id: string; name: string; uom: string; hsnCode: string; rate: number; group: string; subgroup: string };

export async function seedSampleData(ctx: Ctx) {
  const actor = { tenantId: ctx.tenantId, userId: ctx.userId, isTenantAdmin: true };

  const [company] = await db.select().from(companies).where(and(eq(companies.tenantId, ctx.tenantId), isNull(companies.deletedAt))).limit(1);
  const [unit] = await db.select().from(units).where(and(eq(units.tenantId, ctx.tenantId), isNull(units.deletedAt))).limit(1);
  if (!company || !unit) throw BadRequest("no_org", "Create a company and a unit first (Settings).");

  // ---- Vendors (idempotent by name) ----
  const vendorIds: string[] = [];
  for (let i = 0; i < SAMPLE_VENDORS.length; i++) {
    const v = SAMPLE_VENDORS[i]!;
    const [exists] = await db.select({ id: vendors.id }).from(vendors).where(and(eq(vendors.tenantId, ctx.tenantId), eq(vendors.name, v.name), isNull(vendors.deletedAt))).limit(1);
    if (exists) { vendorIds.push(exists.id); continue; }
    const [created] = await db.insert(vendors).values({
      tenantId: ctx.tenantId, code: `V-${String(i + 1).padStart(4, "0")}`,
      name: v.name, legalName: v.legalName, gstin: v.gstin, pan: v.pan,
      contactPerson: v.contactPerson, email: v.email, phone: v.phone,
      city: v.city, state: v.state, pincode: v.pincode, country: "IN",
      paymentTerms: v.paymentTerms, isActive: true,
    }).returning({ id: vendors.id });
    if (created) vendorIds.push(created.id);
  }

  // ---- Items (idempotent by name) ----
  const itemList: Line[] = [];
  for (let i = 0; i < SAMPLE_ITEMS.length; i++) {
    const it = SAMPLE_ITEMS[i]!;
    const [exists] = await db.select({ id: items.id }).from(items).where(and(eq(items.tenantId, ctx.tenantId), eq(items.name, it.name), isNull(items.deletedAt))).limit(1);
    let id = exists?.id;
    if (!id) {
      const [created] = await db.insert(items).values({
        tenantId: ctx.tenantId, code: `I-${String(i + 1).padStart(4, "0")}`,
        name: it.name, description: it.description, category: it.category,
        itemGroupName: it.itemGroupName, itemSubGroupName: it.itemSubGroupName,
        uom: it.uom, hsnCode: it.hsnCode, defaultTaxRate: it.defaultTaxRate,
        isStocked: true, isActive: true,
      }).returning({ id: items.id });
      id = created?.id;
    }
    if (id) itemList.push({ id, name: it.name, uom: it.uom, hsnCode: it.hsnCode, rate: it.rate, group: it.itemGroupName, subgroup: it.itemSubGroupName });
  }

  // ---- Transactions (only when the tenant is essentially empty) ----
  const [countRow] = await db.select({ c: sql<number>`count(*)::int` }).from(purchaseRequisitions).where(eq(purchaseRequisitions.tenantId, ctx.tenantId));
  let prs = 0;
  let pos = 0;

  if (Number(countRow?.c ?? 0) < 3 && itemList.length >= 6 && vendorIds.length >= 2) {
    const mkPr = async (title: string, lines: Line[], advance: "draft" | "pending" | "approved") => {
      try {
        const input = prCreateSchema.parse({
          companyId: company.id, unitId: unit.id, title,
          items: lines.map((l) => ({ itemId: l.id, itemName: l.name, hsnCode: l.hsnCode, itemGroupName: l.group, itemSubGroupName: l.subgroup, quantity: 10, uom: l.uom, estimatedUnitPrice: l.rate })),
        });
        const pr = await prService.createPr(input, actor);
        const prId = (pr as { id: string }).id;
        if (advance !== "draft") await prService.submitPr(prId, actor);
        if (advance === "approved") await prService.approvePr(prId, actor);
        prs++;
      } catch (err) {
        logger.warn({ err, title }, "sample_pr_failed");
      }
    };

    await mkPr("Bearings & spares replenishment", itemList.slice(0, 2), "approved");
    await mkPr("Safety & consumables — Q1", itemList.slice(2, 4), "pending");
    await mkPr("Electrical maintenance stock", itemList.slice(4, 6), "approved");
    await mkPr("Office supplies (draft)", itemList.slice(6, 8), "draft");

    const mkPo = async (title: string, vendorId: string, lines: Line[], advance: "approved" | "sent") => {
      try {
        const input = poCreateSchema.parse({
          companyId: company.id, unitId: unit.id, vendorId, title,
          items: lines.map((l) => ({ itemId: l.id, itemName: l.name, hsnCode: l.hsnCode, quantity: 10, uom: l.uom, unitPrice: l.rate, taxRate: 18 })),
        });
        const po = await poService.createPo(input, actor);
        const poId = (po as { id: string }).id;
        await poService.submitPo(poId, actor);
        await poService.approvePo(poId, actor);
        if (advance === "sent") await poService.sendToVendor(poId, actor);
        pos++;
      } catch (err) {
        logger.warn({ err, title }, "sample_po_failed");
      }
    };

    await mkPo("Bearings order — Acme Steel", vendorIds[0]!, itemList.slice(0, 2), "sent");
    await mkPo("Electrical supplies — Surya Roshni", vendorIds[3] ?? vendorIds[1]!, itemList.slice(4, 6), "approved");
  }

  logger.info({ tenantId: ctx.tenantId, vendors: vendorIds.length, items: itemList.length, prs, pos }, "sample_data_seeded");
  return { vendors: vendorIds.length, items: itemList.length, prs, pos };
}
