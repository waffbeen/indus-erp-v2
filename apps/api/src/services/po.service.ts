import { eq, and, isNull, ilike, desc, sql, inArray } from "drizzle-orm";
import { db, type DB } from "../db/index";
import { purchaseOrders, poItems } from "../db/schema/po";
import { poAmendments } from "../db/schema/po_amendments";
import { poCharges } from "../db/schema/po_charges";
import { purchaseRequisitions, prItems } from "../db/schema/pr";
import { grns, grnItems } from "../db/schema/grns";
import { vendors } from "../db/schema/vendors";
import { users } from "../db/schema/users";
import { auditLogs } from "../db/schema/audit_logs";
import { approvalActions } from "../db/schema/approvals";
import { companies } from "../db/schema/companies";
import { units } from "../db/schema/units";
import { items as itemMaster } from "../db/schema/items";
import { BadRequest, Forbidden, NotFound } from "../lib/errors";
import { notifyTenantAdmins, notifyUsers } from "./notification.service";
import { sendMail, renderEmail, escapeHtml } from "./mail.service";
import { appUrl } from "../config/env";
import { logger } from "../lib/logger";
import type { PoCreateInput, PoAmendInput } from "@indus/shared";

/** Root connection or an open transaction — lets callers run helpers atomically. */
type Executor = DB | Parameters<Parameters<DB["transaction"]>[0]>[0];

/** Look up a single user's email (null if missing). */
async function userEmail(userId: string): Promise<string | null> {
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.email ?? null;
}

/**
 * Fire-and-forget email: runs after the business write has committed, swallows
 * every error (a mail outage must never fail a PO flow), and never blocks the
 * HTTP response.
 */
function fireEmail(label: string, fn: () => Promise<unknown>): void {
  void Promise.resolve()
    .then(fn)
    .catch((err) => logger.warn({ err, label }, "email_dispatch_failed"));
}

interface ListOpts {
  page?: number; pageSize?: number; search?: string; status?: string; vendorId?: string;
  /** POs that have any line assigned to this buyer. */
  lineBuyerUserId?: string;
}
interface ActorContext {
  tenantId: string;
  userId: string;
  isTenantAdmin: boolean;
  ipAddress?: string;
  userAgent?: string;
}

interface ComputedLine {
  qtyScaled: number;
  unitPaise: number;
  subtotalPaise: bigint;
  discountPaise: bigint;
  taxableAmountPaise: bigint;
  taxRate: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  taxPaise: bigint;
  cgstPaise: bigint;
  sgstPaise: bigint;
  igstPaise: bigint;
  totalPaise: bigint;
}

function computeLine(it: PoCreateInput["items"][number], isInterstate: boolean): ComputedLine {
  const qtyScaled = Math.round(it.quantity * 1000);
  const unitPaise = Math.round(it.unitPrice * 100);
  const subtotal = (BigInt(qtyScaled) * BigInt(unitPaise)) / 1000n;
  const discountPercent = BigInt(Math.round(it.discountPercent ?? 0));
  const discount = (subtotal * discountPercent) / 100n;
  const taxable = subtotal - discount;
  const taxRate = it.taxRate;
  let cgstRate = 0, sgstRate = 0, igstRate = 0;
  if (isInterstate) {
    igstRate = taxRate;
  } else {
    cgstRate = Math.floor(taxRate / 2);
    sgstRate = taxRate - cgstRate;
  }
  const cgst = (taxable * BigInt(cgstRate)) / 100n;
  const sgst = (taxable * BigInt(sgstRate)) / 100n;
  const igst = (taxable * BigInt(igstRate)) / 100n;
  const tax = cgst + sgst + igst;
  return {
    qtyScaled, unitPaise,
    subtotalPaise: subtotal, discountPaise: discount, taxableAmountPaise: taxable,
    taxRate, cgstRate, sgstRate, igstRate,
    taxPaise: tax, cgstPaise: cgst, sgstPaise: sgst, igstPaise: igst,
    totalPaise: taxable + tax,
  };
}

function computeHeaderTotals(
  lines: ComputedLine[],
  freightRupees: number,
  otherRupees: number,
  roundOffRupees: number,
) {
  let subtotal = 0n, discount = 0n, taxable = 0n, cgst = 0n, sgst = 0n, igst = 0n, tax = 0n;
  for (const l of lines) {
    subtotal += l.subtotalPaise;
    discount += l.discountPaise;
    taxable += l.taxableAmountPaise;
    cgst += l.cgstPaise;
    sgst += l.sgstPaise;
    igst += l.igstPaise;
    tax += l.taxPaise;
  }
  const freight = BigInt(Math.round(freightRupees * 100));
  const other = BigInt(Math.round(otherRupees * 100));
  const roundOff = BigInt(Math.round(roundOffRupees * 100));
  const total = taxable + tax + freight + other + roundOff;
  return { subtotal, discount, taxable, cgst, sgst, igst, tax, freight, other, roundOff, total };
}

/** @deprecated Use computeLine + computeHeaderTotals instead. */
function computeTotals(items: PoCreateInput["items"]): { subtotal: bigint; tax: bigint; total: bigint } {
  let subtotal = 0n;
  let tax = 0n;
  for (const it of items) {
    const qtyScaled = BigInt(Math.round(it.quantity * 1000));
    const unitPaise = BigInt(Math.round(it.unitPrice * 100));
    const lineSub = (qtyScaled * unitPaise) / 1000n;
    const lineTax = (lineSub * BigInt(it.taxRate)) / 100n;
    subtotal += lineSub;
    tax += lineTax;
  }
  return { subtotal, tax, total: subtotal + tax };
}

async function nextPoNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.tenantId, tenantId), sql`${purchaseOrders.createdAt} >= ${yearStart}`));
  const count = result[0]?.count ?? 0;
  return `PO-${year}-${String(count + 1).padStart(5, "0")}`;
}

export async function listPos(tenantId: string, opts: ListOpts = {}) {
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 25, 100);
  const offset = (page - 1) * pageSize;

  const conds = [eq(purchaseOrders.tenantId, tenantId), isNull(purchaseOrders.deletedAt)];
  if (opts.status) conds.push(eq(purchaseOrders.status, opts.status as "draft"));
  if (opts.vendorId) conds.push(eq(purchaseOrders.vendorId, opts.vendorId));
  if (opts.search?.trim()) conds.push(ilike(purchaseOrders.title, `%${opts.search.trim()}%`));

  // Pre-filter to POs containing a line assigned to the given buyer (subquery).
  if (opts.lineBuyerUserId) {
    const buyerPoIds = await db
      .selectDistinct({ poId: poItems.poId })
      .from(poItems)
      .where(eq(poItems.lineBuyerUserId, opts.lineBuyerUserId));
    if (buyerPoIds.length === 0) {
      // No matching POs — short-circuit to empty result without firing the main query.
      return { items: [], total: 0, page, pageSize };
    }
    conds.push(inArray(purchaseOrders.id, buyerPoIds.map((r) => r.poId)));
  }

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        po: purchaseOrders,
        vendorName: vendors.name,
      })
      .from(purchaseOrders)
      .leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
      .where(and(...conds))
      .orderBy(desc(purchaseOrders.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(purchaseOrders).where(and(...conds)),
  ]);

  const poIds = rows.map((r) => r.po.id);
  const counts = poIds.length
    ? await db
        .select({ poId: poItems.poId, count: sql<number>`count(*)::int` })
        .from(poItems)
        .where(inArray(poItems.poId, poIds))
        .groupBy(poItems.poId)
    : [];
  const countMap = new Map(counts.map((c) => [c.poId, c.count]));

  return {
    items: rows.map((r) => ({
      id: r.po.id,
      poNumber: r.po.poNumber,
      title: r.po.title,
      status: r.po.status,
      vendorId: r.po.vendorId,
      vendorName: r.vendorName ?? "Unknown",
      prId: r.po.prId,
      totalPaise: r.po.totalPaise,
      currency: r.po.currency,
      itemsCount: countMap.get(r.po.id) ?? 0,
      createdAt: r.po.createdAt.toISOString(),
      deliveryDate: r.po.deliveryDate ? r.po.deliveryDate.toISOString() : null,
    })),
    total: totalRow[0]?.count ?? 0,
    page,
    pageSize,
  };
}

export async function getPo(tenantId: string, id: string) {
  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, tenantId), isNull(purchaseOrders.deletedAt)))
    .limit(1);
  if (!po) throw NotFound("po_not_found", "Purchase Order not found");

  const [items, [vendor], [creator], [company], [unit], actions, amendments, charges] = await Promise.all([
    db.select().from(poItems).where(eq(poItems.poId, id)).orderBy(poItems.sortOrder),
    db.select().from(vendors).where(eq(vendors.id, po.vendorId)).limit(1),
    db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users).where(eq(users.id, po.createdByUserId)).limit(1),
    db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, po.companyId)).limit(1),
    db.select({ id: units.id, name: units.name, code: units.code }).from(units).where(eq(units.id, po.unitId)).limit(1),
    db
      .select({
        action: approvalActions,
        actor: { fullName: users.fullName, email: users.email },
      })
      .from(approvalActions)
      .leftJoin(users, eq(approvalActions.actorUserId, users.id))
      .where(and(eq(approvalActions.resourceType, "po"), eq(approvalActions.resourceId, id)))
      .orderBy(approvalActions.createdAt),
    db
      .select({
        amendment: poAmendments,
        actorName: users.fullName,
      })
      .from(poAmendments)
      .leftJoin(users, eq(poAmendments.actorUserId, users.id))
      .where(eq(poAmendments.poId, id))
      .orderBy(desc(poAmendments.createdAt)),
    db
      .select()
      .from(poCharges)
      .where(eq(poCharges.poId, id))
      .orderBy(poCharges.sortOrder),
  ]);

  return {
    ...po,
    createdAt: po.createdAt.toISOString(),
    updatedAt: po.updatedAt.toISOString(),
    deliveryDate: po.deliveryDate ? po.deliveryDate.toISOString() : null,
    validUntil: po.validUntil ? po.validUntil.toISOString() : null,
    sentToVendorAt: po.sentToVendorAt?.toISOString() ?? null,
    acknowledgedAt: po.acknowledgedAt?.toISOString() ?? null,
    items: items.map((it) => ({ ...it, createdAt: it.createdAt.toISOString() })),
    vendor,
    creator,
    company,
    unit,
    timeline: actions.map((a) => ({
      id: a.action.id,
      action: a.action.action,
      comment: a.action.comment,
      level: a.action.level,
      actorName: a.actor?.fullName ?? "Unknown",
      actorEmail: a.actor?.email ?? "",
      createdAt: a.action.createdAt.toISOString(),
    })),
    amendments: amendments.map((a) => ({
      id: a.amendment.id,
      amendmentNo: a.amendment.amendmentNo,
      summary: a.amendment.summary,
      remark: a.amendment.remark,
      actorName: a.actorName ?? "Unknown",
      createdAt: a.amendment.createdAt.toISOString(),
    })),
    amendmentCount: amendments.length,
    additionalCharges: charges.map((c) => ({
      id: c.id,
      label: c.label,
      amountPaise: c.amountPaise,
    })),
  };
}

/** Build a draft PoCreateInput from an approved PR (used by frontend to pre-fill the form). */
export async function getPoDraftFromPr(tenantId: string, prId: string) {
  const [pr] = await db
    .select()
    .from(purchaseRequisitions)
    .where(and(eq(purchaseRequisitions.id, prId), eq(purchaseRequisitions.tenantId, tenantId), isNull(purchaseRequisitions.deletedAt)))
    .limit(1);
  if (!pr) throw NotFound("pr_not_found", "Source PR not found");
  if (pr.status !== "approved") {
    throw BadRequest("pr_not_approved", "Only approved PRs can be converted to POs");
  }
  const items = await db.select().from(prItems).where(eq(prItems.prId, prId)).orderBy(prItems.sortOrder);

  // Pull item-master defaults so PR→PO converts with the master-defined GST %
  // (instead of always defaulting to 18). Only itemIds present on PR lines.
  const masterIds = Array.from(new Set(items.map((it) => it.itemId).filter((x): x is string => !!x)));
  const masterRows = masterIds.length
    ? await db.select({ id: itemMaster.id, defaultTaxRate: itemMaster.defaultTaxRate })
        .from(itemMaster)
        .where(inArray(itemMaster.id, masterIds))
    : [];
  const masterTaxByItemId = new Map(masterRows.map((r) => [r.id, r.defaultTaxRate]));

  return {
    pr: {
      id: pr.id,
      prNumber: pr.prNumber,
      title: pr.title,
      description: pr.description,
      companyId: pr.companyId,
      unitId: pr.unitId,
    },
    items: items.map((it) => ({
      prItemId: it.id,
      itemId: it.itemId,
      itemName: it.itemName,
      description: it.description,
      itemGroupName: it.itemGroupName,
      itemSubGroupName: it.itemSubGroupName,
      hsnCode: it.hsnCode,
      uom: it.uom,
      quantity: it.quantityScaled / 1000,
      estimatedUnitPrice: it.estimatedUnitPricePaise ? Number(it.estimatedUnitPricePaise) / 100 : 0,
      /** From item master if known; null tells the frontend to fall back to its 18 % default. */
      defaultTaxRate: it.itemId ? masterTaxByItemId.get(it.itemId) ?? null : null,
      itemNarration: it.itemNarration,
      specifications: it.specifications,
      /** Carry per-line buyer from PR -> PO so requester's hint becomes default. */
      lineBuyerUserId: it.lineBuyerUserId ?? pr.buyerUserId ?? null,
      /** Carry the requester's preferred delivery so the buyer doesn't have to retype. */
      committedDeliveryDate: it.expectedDeliveryDate ? it.expectedDeliveryDate.toISOString().slice(0, 10) : null,
    })),
    /** Suggest header-level buyer fallback so the form can pre-fill. */
    suggestedBuyerUserId: pr.buyerUserId ?? null,
    /** Carry priority/needed-by/po-type hints from the PR so the form pre-fills. */
    suggestedPoType: mapPrTypeToPoType(pr.prType),
    suggestedDeliveryDate: pr.neededBy ? pr.neededBy.toISOString().slice(0, 10) : null,
  };
}

/** Map the legacy PR-type taxonomy onto the PO-type taxonomy. */
function mapPrTypeToPoType(prType: string | null): string | null {
  switch (prType) {
    case "capex":         return "capex";
    case "amc":           return "amc";
    case "service":       return "service";
    case "stock":         return "opex";
    case "maintenance":   return "opex";
    case "job_specific":  return "opex";
    case "other":         return "other";
    default:              return null;
  }
}

export async function createPo(input: PoCreateInput, ctx: ActorContext) {
  if (!input.items.length) throw BadRequest("no_items", "Add at least one line item");

  const isInterstate = input.isInterstate ?? false;
  const computedLines = input.items.map((it) => computeLine(it, isInterstate));
  // Additional charges (freight/insurance/etc.) feed into the "other" bucket
  // for total computation; the per-row breakdown is persisted to po_charges
  // so finance can see the itemisation on the detail page.
  const additionalCharges = input.additionalCharges ?? [];
  const additionalChargesSum = additionalCharges.reduce((s, c) => s + (c.amount || 0), 0);
  const totals = computeHeaderTotals(
    computedLines,
    input.freightCharges ?? 0,
    (input.otherCharges ?? 0) + additionalChargesSum,
    input.roundOff ?? 0,
  );

  const [po] = await db
    .insert(purchaseOrders)
    .values({
      tenantId: ctx.tenantId,
      companyId: input.companyId,
      unitId: input.unitId,
      vendorId: input.vendorId,
      prId: input.prId ?? null,
      createdByUserId: ctx.userId,
      title: input.title,
      description: input.description ?? null,
      status: "draft",
      isInterstate,
      placeOfSupply: input.placeOfSupply ?? null,
      subtotalPaise: totals.subtotal.toString(),
      discountTotalPaise: totals.discount.toString(),
      taxableAmountPaise: totals.taxable.toString(),
      cgstTotalPaise: totals.cgst.toString(),
      sgstTotalPaise: totals.sgst.toString(),
      igstTotalPaise: totals.igst.toString(),
      taxTotalPaise: totals.tax.toString(),
      freightChargesPaise: totals.freight.toString(),
      otherChargesPaise: totals.other.toString(),
      roundOffPaise: totals.roundOff.toString(),
      totalPaise: totals.total.toString(),
      deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : null,
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
      deliveryAddress: input.deliveryAddress ?? null,
      deliveryTerms: input.deliveryTerms ?? null,
      paymentTerms: input.paymentTerms ?? null,
      termsAndConditions: input.termsAndConditions ?? null,
      revisionNo: input.revisionNo ?? 0,
      revisionRemark: input.revisionRemark ?? null,
      poType: input.poType ?? null,
      forDelivery: input.forDelivery ?? null,
      creditPeriodDays: input.creditPeriodDays ?? null,
      insuranceTerms: input.insuranceTerms ?? null,
      penaltyTerms: input.penaltyTerms ?? null,
      packingTerms: input.packingTerms ?? null,
    })
    .returning();
  if (!po) throw new Error("Failed to create PO");

  await db.insert(poItems).values(
    input.items.map((it, idx) => {
      const l = computedLines[idx]!;
      return {
        poId: po.id,
        prItemId: it.prItemId ?? null,
        itemId: it.itemId ?? null,
        itemName: it.itemName,
        description: it.description ?? null,
        itemGroupName: it.itemGroupName ?? null,
        itemSubGroupName: it.itemSubGroupName ?? null,
        hsnCode: it.hsnCode ?? null,
        quantityScaled: l.qtyScaled,
        uom: it.uom,
        unitPricePaise: l.unitPaise.toString(),
        discountPercent: Math.round(it.discountPercent ?? 0),
        discountAmountPaise: l.discountPaise.toString(),
        taxRate: l.taxRate,
        cgstRate: l.cgstRate,
        sgstRate: l.sgstRate,
        igstRate: l.igstRate,
        subtotalPaise: l.subtotalPaise.toString(),
        taxableAmountPaise: l.taxableAmountPaise.toString(),
        taxPaise: l.taxPaise.toString(),
        cgstPaise: l.cgstPaise.toString(),
        sgstPaise: l.sgstPaise.toString(),
        igstPaise: l.igstPaise.toString(),
        totalPaise: l.totalPaise.toString(),
        committedDeliveryDate: it.committedDeliveryDate ? new Date(it.committedDeliveryDate) : null,
        itemNarration: it.itemNarration ?? null,
        notes: it.notes ?? null,
        specifications: (it.specifications as Record<string, unknown>) ?? {},
        lineBuyerUserId: it.lineBuyerUserId ?? null,
        tolerancePercent: Math.round(it.tolerancePercent ?? 0),
        warrantyMonths: Math.round(it.warrantyMonths ?? 0),
        isForStock: it.isForStock ? 1 : 0,
        isRecoveryRate: it.isRecoveryRate ? 1 : 0,
        // Schedule qty stored as int×1000 to match the line's quantityScaled.
        deliverySchedule: (it.deliverySchedule ?? []).map((s) => ({
          qtyScaled: Math.round(s.qty * 1000),
          deliveryDate: s.deliveryDate,
        })),
        sortOrder: idx,
      };
    }),
  );

  if (additionalCharges.length) {
    await db.insert(poCharges).values(
      additionalCharges.map((c, idx) => ({
        poId: po.id,
        label: c.label,
        amountPaise: Math.round(c.amount * 100).toString(),
        sortOrder: idx,
      })),
    );
  }

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "create",
    resourceType: "po",
    resourceId: po.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    after: { title: po.title, status: po.status, total: po.totalPaise } as Record<string, unknown>,
  });

  return po;
}

/**
 * Update a draft PO — replaces the entire line set and recomputes totals.
 * Only draft POs can be edited; submitted/approved ones go through the
 * amendment flow instead.
 */
export async function updatePo(id: string, input: PoCreateInput, ctx: ActorContext) {
  const existing = await getPoRaw(ctx.tenantId, id);
  if (existing.status !== "draft") {
    throw BadRequest("not_editable", "Only draft POs can be edited — use Amend after approval");
  }
  if (existing.createdByUserId !== ctx.userId && !ctx.isTenantAdmin) {
    throw Forbidden("not_owner", "Only the PO creator or tenant admin can edit this draft");
  }

  const isInterstate = input.isInterstate ?? false;
  const computedLines = input.items.map((it) => computeLine(it, isInterstate));
  const additionalCharges = input.additionalCharges ?? [];
  const additionalChargesSum = additionalCharges.reduce((s, c) => s + (c.amount || 0), 0);
  const totals = computeHeaderTotals(
    computedLines,
    input.freightCharges ?? 0,
    (input.otherCharges ?? 0) + additionalChargesSum,
    input.roundOff ?? 0,
  );

  const [updated] = await db
    .update(purchaseOrders)
    .set({
      companyId: input.companyId,
      unitId: input.unitId,
      vendorId: input.vendorId,
      title: input.title,
      description: input.description ?? null,
      isInterstate,
      placeOfSupply: input.placeOfSupply ?? null,
      subtotalPaise: totals.subtotal.toString(),
      discountTotalPaise: totals.discount.toString(),
      taxableAmountPaise: totals.taxable.toString(),
      cgstTotalPaise: totals.cgst.toString(),
      sgstTotalPaise: totals.sgst.toString(),
      igstTotalPaise: totals.igst.toString(),
      taxTotalPaise: totals.tax.toString(),
      freightChargesPaise: totals.freight.toString(),
      otherChargesPaise: totals.other.toString(),
      roundOffPaise: totals.roundOff.toString(),
      totalPaise: totals.total.toString(),
      deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : null,
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
      deliveryAddress: input.deliveryAddress ?? null,
      deliveryTerms: input.deliveryTerms ?? null,
      paymentTerms: input.paymentTerms ?? null,
      termsAndConditions: input.termsAndConditions ?? null,
      revisionNo: input.revisionNo ?? 0,
      revisionRemark: input.revisionRemark ?? null,
      poType: input.poType ?? null,
      forDelivery: input.forDelivery ?? null,
      creditPeriodDays: input.creditPeriodDays ?? null,
      insuranceTerms: input.insuranceTerms ?? null,
      penaltyTerms: input.penaltyTerms ?? null,
      packingTerms: input.packingTerms ?? null,
      updatedAt: new Date(),
    })
    .where(eq(purchaseOrders.id, id))
    .returning();

  // Replace line items + charges (simpler than diffing for MVP)
  await db.delete(poItems).where(eq(poItems.poId, id));
  await db.insert(poItems).values(
    input.items.map((it, idx) => {
      const l = computedLines[idx]!;
      return {
        poId: id,
        prItemId: it.prItemId ?? null,
        itemId: it.itemId ?? null,
        itemName: it.itemName,
        description: it.description ?? null,
        itemGroupName: it.itemGroupName ?? null,
        itemSubGroupName: it.itemSubGroupName ?? null,
        hsnCode: it.hsnCode ?? null,
        quantityScaled: l.qtyScaled,
        uom: it.uom,
        unitPricePaise: l.unitPaise.toString(),
        discountPercent: Math.round(it.discountPercent ?? 0),
        discountAmountPaise: l.discountPaise.toString(),
        taxRate: l.taxRate,
        cgstRate: l.cgstRate,
        sgstRate: l.sgstRate,
        igstRate: l.igstRate,
        subtotalPaise: l.subtotalPaise.toString(),
        taxableAmountPaise: l.taxableAmountPaise.toString(),
        taxPaise: l.taxPaise.toString(),
        cgstPaise: l.cgstPaise.toString(),
        sgstPaise: l.sgstPaise.toString(),
        igstPaise: l.igstPaise.toString(),
        totalPaise: l.totalPaise.toString(),
        committedDeliveryDate: it.committedDeliveryDate ? new Date(it.committedDeliveryDate) : null,
        itemNarration: it.itemNarration ?? null,
        notes: it.notes ?? null,
        specifications: (it.specifications as Record<string, unknown>) ?? {},
        lineBuyerUserId: it.lineBuyerUserId ?? null,
        tolerancePercent: Math.round(it.tolerancePercent ?? 0),
        warrantyMonths: Math.round(it.warrantyMonths ?? 0),
        isForStock: it.isForStock ? 1 : 0,
        isRecoveryRate: it.isRecoveryRate ? 1 : 0,
        deliverySchedule: (it.deliverySchedule ?? []).map((s) => ({
          qtyScaled: Math.round(s.qty * 1000),
          deliveryDate: s.deliveryDate,
        })),
        sortOrder: idx,
      };
    }),
  );

  await db.delete(poCharges).where(eq(poCharges.poId, id));
  if (additionalCharges.length) {
    await db.insert(poCharges).values(
      additionalCharges.map((c, idx) => ({
        poId: id,
        label: c.label,
        amountPaise: Math.round(c.amount * 100).toString(),
        sortOrder: idx,
      })),
    );
  }

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "update",
    resourceType: "po",
    resourceId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return updated;
}

/**
 * Clone a PO into a new draft. Same vendor, items, terms — fresh PO number
 * issued only on submit. Status reset to draft, approval chain cleared.
 */
export async function clonePo(id: string, ctx: ActorContext) {
  const source = await getPoRaw(ctx.tenantId, id);
  const sourceItems = await db.select().from(poItems).where(eq(poItems.poId, id)).orderBy(poItems.sortOrder);

  const [created] = await db
    .insert(purchaseOrders)
    .values({
      tenantId: ctx.tenantId,
      companyId: source.companyId,
      unitId: source.unitId,
      vendorId: source.vendorId,
      prId: null, // clones don't carry the PR link — they're standalone
      createdByUserId: ctx.userId,
      title: `${source.title} (Copy)`,
      description: source.description,
      status: "draft",
      isInterstate: source.isInterstate,
      placeOfSupply: source.placeOfSupply,
      subtotalPaise: source.subtotalPaise,
      discountTotalPaise: source.discountTotalPaise,
      taxableAmountPaise: source.taxableAmountPaise,
      cgstTotalPaise: source.cgstTotalPaise,
      sgstTotalPaise: source.sgstTotalPaise,
      igstTotalPaise: source.igstTotalPaise,
      taxTotalPaise: source.taxTotalPaise,
      freightChargesPaise: source.freightChargesPaise,
      otherChargesPaise: source.otherChargesPaise,
      roundOffPaise: source.roundOffPaise,
      totalPaise: source.totalPaise,
      currency: source.currency,
      deliveryDate: source.deliveryDate,
      validUntil: source.validUntil,
      deliveryAddress: source.deliveryAddress,
      deliveryTerms: source.deliveryTerms,
      paymentTerms: source.paymentTerms,
      termsAndConditions: source.termsAndConditions,
      notes: source.notes,
      revisionNo: 0,
      revisionRemark: null,
    })
    .returning();

  if (!created) throw new Error("Failed to clone PO");

  if (sourceItems.length) {
    await db.insert(poItems).values(
      sourceItems.map((it, idx) => ({
        poId: created.id,
        prItemId: null, // detach from PR linkage on clone
        itemId: it.itemId,
        itemName: it.itemName,
        description: it.description,
        itemGroupName: it.itemGroupName,
        itemSubGroupName: it.itemSubGroupName,
        hsnCode: it.hsnCode,
        quantityScaled: it.quantityScaled,
        uom: it.uom,
        unitPricePaise: it.unitPricePaise,
        discountPercent: it.discountPercent,
        discountAmountPaise: it.discountAmountPaise,
        taxRate: it.taxRate,
        cgstRate: it.cgstRate,
        sgstRate: it.sgstRate,
        igstRate: it.igstRate,
        subtotalPaise: it.subtotalPaise,
        taxableAmountPaise: it.taxableAmountPaise,
        taxPaise: it.taxPaise,
        cgstPaise: it.cgstPaise,
        sgstPaise: it.sgstPaise,
        igstPaise: it.igstPaise,
        totalPaise: it.totalPaise,
        committedDeliveryDate: it.committedDeliveryDate,
        itemNarration: it.itemNarration,
        notes: it.notes,
        lineBuyerUserId: it.lineBuyerUserId,
        tolerancePercent: it.tolerancePercent,
        warrantyMonths: it.warrantyMonths,
        isForStock: it.isForStock,
        isRecoveryRate: it.isRecoveryRate,
        deliverySchedule: (it.deliverySchedule as Array<{ qtyScaled: number; deliveryDate: string }>) ?? [],
        specifications: (it.specifications as Record<string, unknown>) ?? {},
        sortOrder: idx,
      })),
    );
  }

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "clone",
    resourceType: "po",
    resourceId: created.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    before: { sourceId: id } as Record<string, unknown>,
  });

  return created;
}

/**
 * Record a new amendment on a PO that's already past draft. Used when fields
 * change after approval / vendor send (rate revisions, qty corrections, etc.).
 * The amendment is purely an audit-trail entry — it doesn't modify the PO row;
 * the caller is expected to apply the actual change separately.
 */
export async function addPoAmendment(id: string, input: PoAmendInput, ctx: ActorContext) {
  const po = await getPoRaw(ctx.tenantId, id);
  if (["draft", "pending_approval", "cancelled"].includes(po.status)) {
    throw BadRequest("invalid_status", "Amendments are tracked after approval — edit drafts directly instead");
  }

  // Find the next amendment number for this PO
  const existing = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(poAmendments)
    .where(eq(poAmendments.poId, id));
  const nextNo = (existing[0]?.count ?? 0) + 1;

  const [created] = await db
    .insert(poAmendments)
    .values({
      tenantId: ctx.tenantId,
      poId: id,
      actorUserId: ctx.userId,
      amendmentNo: nextNo,
      summary: input.summary,
      remark: input.remark ?? null,
    })
    .returning();

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "amend",
    resourceType: "po",
    resourceId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    after: { amendmentNo: nextNo, summary: input.summary } as Record<string, unknown>,
  });

  return created;
}

/**
 * List POs raised against a specific PR — either via the header link (po.pr_id)
 * or via line-item linkage (po_items.pr_item_id). Used on the PR detail page to
 * show "Related POs" so the requester can trace what got procured.
 */
export async function listPosFromPr(tenantId: string, prId: string) {
  // PR-header link: POs explicitly raised from this PR
  const headerLinked = await db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      title: purchaseOrders.title,
      status: purchaseOrders.status,
      totalPaise: purchaseOrders.totalPaise,
      createdAt: purchaseOrders.createdAt,
      vendorName: vendors.name,
    })
    .from(purchaseOrders)
    .leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
    .where(
      and(
        eq(purchaseOrders.tenantId, tenantId),
        eq(purchaseOrders.prId, prId),
        isNull(purchaseOrders.deletedAt),
      ),
    )
    .orderBy(desc(purchaseOrders.createdAt));

  // Line-level fallback: PR items mapped into PO lines (catches POs built without the header link)
  const prLineIds = await db.select({ id: prItems.id }).from(prItems).where(eq(prItems.prId, prId));
  const lineLinked = prLineIds.length
    ? await db
        .selectDistinctOn([purchaseOrders.id], {
          id: purchaseOrders.id,
          poNumber: purchaseOrders.poNumber,
          title: purchaseOrders.title,
          status: purchaseOrders.status,
          totalPaise: purchaseOrders.totalPaise,
          createdAt: purchaseOrders.createdAt,
          vendorName: vendors.name,
        })
        .from(poItems)
        .innerJoin(purchaseOrders, eq(poItems.poId, purchaseOrders.id))
        .leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
        .where(
          and(
            eq(purchaseOrders.tenantId, tenantId),
            inArray(poItems.prItemId, prLineIds.map((r) => r.id)),
            isNull(purchaseOrders.deletedAt),
          ),
        )
    : [];

  const map = new Map<string, typeof headerLinked[number]>();
  for (const p of headerLinked) map.set(p.id, p);
  for (const p of lineLinked) if (!map.has(p.id)) map.set(p.id, p);

  return Array.from(map.values())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((p) => ({
      id: p.id,
      poNumber: p.poNumber,
      title: p.title,
      status: p.status,
      totalPaise: p.totalPaise,
      vendorName: p.vendorName ?? "—",
      createdAt: p.createdAt.toISOString(),
    }));
}

export async function submitPo(id: string, ctx: ActorContext, comment?: string) {
  const po = await getPoRaw(ctx.tenantId, id);
  if (po.status !== "draft") throw BadRequest("invalid_status", "Only drafts can be submitted");

  const poNumber = po.poNumber ?? (await nextPoNumber(ctx.tenantId));

  await db.transaction(async (tx) => {
    await tx
      .update(purchaseOrders)
      .set({
        status: "pending_approval",
        poNumber,
        approvalChain: [{ level: 1, roleKey: "approver", status: "pending" }],
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, id));

    await tx.insert(approvalActions).values({
      tenantId: ctx.tenantId,
      resourceType: "po",
      resourceId: id,
      actorUserId: ctx.userId,
      action: "submit",
      comment: comment ?? null,
    });
  });

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId, actorUserId: ctx.userId,
    action: "submit", resourceType: "po", resourceId: id,
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
  });

  await notifyTenantAdmins({
    tenantId: ctx.tenantId,
    excludeUserId: ctx.userId,
    kind: "po_submitted",
    title: `New PO awaiting approval: ${poNumber}`,
    body: po.title,
    resourceType: "po",
    resourceId: id,
    metadata: { poNumber, total: po.totalPaise },
  });
}

export async function approvePo(id: string, ctx: ActorContext, comment?: string) {
  const po = await getPoRaw(ctx.tenantId, id);
  if (po.status !== "pending_approval") throw BadRequest("invalid_status", "This PO isn't waiting for approval");
  if (po.createdByUserId === ctx.userId && !ctx.isTenantAdmin) {
    throw Forbidden("self_approve", "You cannot approve your own PO");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(purchaseOrders)
      .set({
        status: "approved",
        approvalChain: [{ level: 1, roleKey: "approver", status: "approved" }],
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, id));

    await tx.insert(approvalActions).values({
      tenantId: ctx.tenantId,
      resourceType: "po",
      resourceId: id,
      actorUserId: ctx.userId,
      action: "approve",
      level: 1,
      comment: comment ?? null,
    });

    // If sourced from PR, mark PR as converted
    if (po.prId) {
      await tx
        .update(purchaseRequisitions)
        .set({ status: "converted_to_po", updatedAt: new Date() })
        .where(eq(purchaseRequisitions.id, po.prId));
    }
  });

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId, actorUserId: ctx.userId,
    action: "approve", resourceType: "po", resourceId: id,
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
  });

  await notifyUsers({
    tenantId: ctx.tenantId,
    userIds: [po.createdByUserId],
    kind: "po_approved",
    title: `PO approved: ${po.poNumber ?? ""}`.trim(),
    body: po.title,
    resourceType: "po",
    resourceId: id,
    metadata: { poNumber: po.poNumber },
  });

  fireEmail("po_approved", async () => {
    const to = await userEmail(po.createdByUserId);
    if (!to) return;
    await sendMail({
      tenantId: ctx.tenantId,
      to,
      subject: `PO ${po.poNumber ?? ""} approved`.trim(),
      html: renderEmail({
        heading: "Your purchase order was approved",
        bodyHtml: `<p><strong>${escapeHtml(po.poNumber ?? "")}</strong> — ${escapeHtml(po.title)} has been approved and is ready to send to the vendor.</p>`,
        ctaLabel: "View purchase order",
        ctaUrl: appUrl(`po/${id}`),
      }),
    });
  });
}

export async function rejectPo(id: string, ctx: ActorContext, comment?: string) {
  const po = await getPoRaw(ctx.tenantId, id);
  if (po.status !== "pending_approval") throw BadRequest("invalid_status", "This PO isn't waiting for approval");

  await db.transaction(async (tx) => {
    await tx
      .update(purchaseOrders)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(purchaseOrders.id, id));

    await tx.insert(approvalActions).values({
      tenantId: ctx.tenantId,
      resourceType: "po",
      resourceId: id,
      actorUserId: ctx.userId,
      action: "reject",
      level: 1,
      comment: comment ?? null,
    });
  });

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId, actorUserId: ctx.userId,
    action: "reject", resourceType: "po", resourceId: id,
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
  });

  await notifyUsers({
    tenantId: ctx.tenantId,
    userIds: [po.createdByUserId],
    kind: "po_rejected",
    title: `PO rejected: ${po.poNumber ?? ""}`.trim(),
    body: comment || po.title,
    resourceType: "po",
    resourceId: id,
    metadata: { poNumber: po.poNumber },
  });

  fireEmail("po_rejected", async () => {
    const to = await userEmail(po.createdByUserId);
    if (!to) return;
    await sendMail({
      tenantId: ctx.tenantId,
      to,
      subject: `PO ${po.poNumber ?? ""} rejected`.trim(),
      html: renderEmail({
        heading: "Your purchase order was rejected",
        bodyHtml:
          `<p><strong>${escapeHtml(po.poNumber ?? "")}</strong> — ${escapeHtml(po.title)} was rejected.</p>` +
          (comment ? `<p style="color:#6b7280">Reason: ${escapeHtml(comment)}</p>` : ""),
        ctaLabel: "View purchase order",
        ctaUrl: appUrl(`po/${id}`),
      }),
    });
  });
}

export async function sendToVendor(id: string, ctx: ActorContext, comment?: string) {
  const po = await getPoRaw(ctx.tenantId, id);
  if (po.status !== "approved") throw BadRequest("invalid_status", "Only approved POs can be sent");

  // Fetch vendor email so we can fire the supplier notification. Missing email
  // is non-fatal — we still mark the PO as sent and audit, just no mail.
  const [vendor] = await db
    .select({ id: vendors.id, name: vendors.name, email: vendors.email, contactPerson: vendors.contactPerson })
    .from(vendors)
    .where(eq(vendors.id, po.vendorId))
    .limit(1);

  await db.transaction(async (tx) => {
    await tx
      .update(purchaseOrders)
      .set({ status: "sent_to_vendor", sentToVendorAt: new Date(), updatedAt: new Date() })
      .where(eq(purchaseOrders.id, id));

    await tx.insert(approvalActions).values({
      tenantId: ctx.tenantId,
      resourceType: "po",
      resourceId: id,
      actorUserId: ctx.userId,
      action: "submit", // re-using "submit" — could add "dispatch" later
      comment: comment ?? "Sent to vendor",
    });
  });

  let emailStatus: "sent" | "no_email" | "smtp_not_configured" | "failed" = "no_email";
  if (vendor?.email) {
    try {
      const { sendMail, isMailConfiguredFor } = await import("./mail.service");
      if (!(await isMailConfiguredFor(ctx.tenantId))) {
        emailStatus = "smtp_not_configured";
      } else {
        const publicUrl = process.env.PUBLIC_WEB_URL || "";
        const subject = `Purchase Order ${po.poNumber ?? po.title}`;
        const html = renderPoEmailBody({
          poNumber: po.poNumber,
          title: po.title,
          totalPaise: po.totalPaise,
          deliveryDate: po.deliveryDate,
          paymentTerms: po.paymentTerms,
          vendorContact: vendor.contactPerson,
          publicUrl,
        });
        await sendMail({ to: vendor.email, subject, html, tenantId: ctx.tenantId });
        emailStatus = "sent";
      }
    } catch {
      emailStatus = "failed";
      // Swallow — audit log records the failure; UI can show a hint.
    }
  }

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId, actorUserId: ctx.userId,
    action: "send_to_vendor", resourceType: "po", resourceId: id,
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { vendorEmail: vendor?.email ?? null, emailStatus },
  });

  // Confirm dispatch to the PO creator (separate from the supplier email above).
  fireEmail("po_sent_to_vendor", async () => {
    const to = await userEmail(po.createdByUserId);
    if (!to) return;
    await sendMail({
      tenantId: ctx.tenantId,
      to,
      subject: `PO ${po.poNumber ?? ""} sent to vendor`.trim(),
      html: renderEmail({
        heading: "Your purchase order was sent to the vendor",
        bodyHtml: `<p><strong>${escapeHtml(po.poNumber ?? "")}</strong> — ${escapeHtml(po.title)} has been dispatched to the vendor${vendor?.email ? ` (${escapeHtml(vendor.email)})` : ""}.</p>`,
        ctaLabel: "View purchase order",
        ctaUrl: appUrl(`po/${id}`),
      }),
    });
  });

  return { emailStatus, vendorEmail: vendor?.email ?? null };
}

/** Minimal HTML body — no attachment yet, just a summary + link to the PO page. */
function renderPoEmailBody(p: {
  poNumber: string | null;
  title: string;
  totalPaise: string;
  deliveryDate: Date | null;
  paymentTerms: string | null;
  vendorContact: string | null;
  publicUrl: string;
}): string {
  const rupees = (Number(p.totalPaise) / 100).toLocaleString("en-IN", {
    style: "currency", currency: "INR", minimumFractionDigits: 2,
  });
  const greeting = p.vendorContact ? `Dear ${p.vendorContact},` : "Hello,";
  const link = p.publicUrl ? `<p><a href="${p.publicUrl}">View on portal</a></p>` : "";
  const delivery = p.deliveryDate
    ? `<li><strong>Expected delivery:</strong> ${p.deliveryDate.toISOString().slice(0, 10)}</li>`
    : "";
  const payment = p.paymentTerms
    ? `<li><strong>Payment terms:</strong> ${p.paymentTerms}</li>`
    : "";
  return `
    <div style="font-family:system-ui,Arial,sans-serif;color:#1a1a1a;line-height:1.5">
      <p>${greeting}</p>
      <p>Please find below the purchase order issued from our office.</p>
      <ul>
        <li><strong>PO number:</strong> ${p.poNumber ?? "(pending)"}</li>
        <li><strong>Title:</strong> ${p.title}</li>
        <li><strong>Total value:</strong> ${rupees}</li>
        ${delivery}
        ${payment}
      </ul>
      ${link}
      <p>Please confirm receipt and the committed dispatch schedule at your earliest convenience.</p>
      <p>Thank you.</p>
    </div>
  `;
}

/**
 * Short Close — finalize a PO without waiting for full delivery. Used when
 * the buyer accepts a partial receipt as final (vendor short-shipped, item
 * obsolete, etc.). Status moves to "closed"; no further GRNs allowed.
 * Comment is required so the audit trail explains why the PO didn't fully receive.
 */
export async function shortClosePo(id: string, ctx: ActorContext, comment?: string) {
  const po = await getPoRaw(ctx.tenantId, id);
  if (!["approved", "sent_to_vendor", "partially_received"].includes(po.status)) {
    throw BadRequest(
      "invalid_status",
      "Short Close only applies to approved/sent/partially-received POs",
    );
  }
  if (!comment?.trim()) {
    throw BadRequest("comment_required", "Tell the team why this PO is being closed early");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(purchaseOrders)
      .set({ status: "closed", updatedAt: new Date() })
      .where(eq(purchaseOrders.id, id));

    await tx.insert(approvalActions).values({
      tenantId: ctx.tenantId,
      resourceType: "po",
      resourceId: id,
      actorUserId: ctx.userId,
      // approval_actions.action is a plain text column; Drizzle's `enum` is a
      // compile-time hint that doesn't yet list "short_close". Stored verbatim
      // (no DB check constraint) so the timeline matches the audit log below.
      action: "short_close" as unknown as (typeof approvalActions.$inferInsert)["action"],
      comment,
    });
  });

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "short_close",
    resourceType: "po",
    resourceId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

export async function cancelPo(id: string, ctx: ActorContext, comment?: string) {
  const po = await getPoRaw(ctx.tenantId, id);
  if (["received", "closed", "cancelled"].includes(po.status)) {
    throw BadRequest("invalid_status", "This PO is already finalized");
  }

  // Legacy parity: block cancel if any GRN has been raised against this PO.
  // The user must cancel each GRN first (then re-cancel the PO). Prevents
  // data inconsistency where goods are received against a "cancelled" PO.
  const liveGrnCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(grns)
    .where(and(eq(grns.poId, id), sql`${grns.status} <> 'cancelled'`, isNull(grns.deletedAt)));
  if ((liveGrnCount[0]?.count ?? 0) > 0) {
    throw BadRequest(
      "grn_exists",
      `Cannot cancel: ${liveGrnCount[0]!.count} live GRN(s) are linked to this PO. Cancel the GRNs first, then try again.`,
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(purchaseOrders)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(purchaseOrders.id, id));

    await tx.insert(approvalActions).values({
      tenantId: ctx.tenantId,
      resourceType: "po",
      resourceId: id,
      actorUserId: ctx.userId,
      action: "cancel",
      comment: comment ?? null,
    });
  });

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId, actorUserId: ctx.userId,
    action: "cancel", resourceType: "po", resourceId: id,
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
  });
}

/**
 * Called by GRN service — update PO status based on received qty.
 * Accepts an optional executor so it can run inside the GRN's transaction and
 * commit/roll back atomically with the receipt.
 */
export async function refreshPoReceivedStatus(tenantId: string, poId: string, exec: Executor = db) {
  // Sum received across all GRNs for this PO
  const items = await exec.select().from(poItems).where(eq(poItems.poId, poId));
  if (items.length === 0) return;

  // Calculate received per po_item from grn_items, excluding cancelled GRNs
  const itemIds = items.map((i) => i.id);
  const receivedRows = itemIds.length
    ? await exec
        .select({
          poItemId: grnItems.poItemId,
          received: sql<number>`COALESCE(SUM(${grnItems.acceptedQuantityScaled}), 0)::int`.as("received"),
        })
        .from(grnItems)
        .innerJoin(grns, eq(grnItems.grnId, grns.id))
        .where(and(inArray(grnItems.poItemId, itemIds), sql`${grns.status} <> 'cancelled'`))
        .groupBy(grnItems.poItemId)
    : [];

  const receivedMap = new Map<string, number>();
  for (const r of receivedRows) {
    if (r.poItemId) receivedMap.set(r.poItemId, r.received);
  }

  let allReceived = true;
  let anyReceived = false;
  for (const it of items) {
    const got = receivedMap.get(it.id) ?? 0;
    if (got > 0) anyReceived = true;
    if (got < Number(it.quantityScaled)) allReceived = false;
  }

  let newStatus: "approved" | "sent_to_vendor" | "partially_received" | "received";
  if (allReceived) newStatus = "received";
  else if (anyReceived) newStatus = "partially_received";
  else {
    const [po] = await exec.select({ status: purchaseOrders.status }).from(purchaseOrders).where(eq(purchaseOrders.id, poId));
    newStatus = (po?.status as typeof newStatus) ?? "sent_to_vendor";
  }

  await exec
    .update(purchaseOrders)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenantId, tenantId)));
}

async function getPoRaw(tenantId: string, id: string) {
  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, tenantId), isNull(purchaseOrders.deletedAt)))
    .limit(1);
  if (!po) throw NotFound("po_not_found", "Purchase Order not found");
  return po;
}
