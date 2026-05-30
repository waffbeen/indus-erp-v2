import { eq, and, isNull, desc, sql, inArray, ilike } from "drizzle-orm";
import { db } from "../db/index";
import { vendorInvoices, vendorInvoiceItems } from "../db/schema/vendor_invoices";
import { purchaseOrders, poItems } from "../db/schema/po";
import { grns, grnItems } from "../db/schema/grns";
import { vendors } from "../db/schema/vendors";
import { users } from "../db/schema/users";
import { payments, paymentAllocations } from "../db/schema/payments";
import { auditLogs } from "../db/schema/audit_logs";
import { NotFound, BadRequest } from "../lib/errors";
import { notifyUsers } from "./notification.service";
import type {
  VendorInvoiceCreateInput,
  VendorInvoiceItemInput,
  VendorInvoiceApproveInput,
  MatchStatus,
} from "@indus/shared";

interface ListOpts {
  page?: number;
  pageSize?: number;
  status?: string;
  vendorId?: string;
  poId?: string;
  search?: string;
}

interface ActorContext {
  tenantId: string;
  userId: string;
  isTenantAdmin: boolean;
  ipAddress?: string;
  userAgent?: string;
}

type LineStatus = MatchStatus;

/** A single PO line's data needed for the price/qty match. */
interface PoLineRef {
  unitPricePaise: number;
  tolerancePercent: number;
}

/**
 * Compare one invoice line against the PO (ordered price) and GRN (accepted qty).
 * tolerancePercent comes from the PO line and applies to BOTH the price and the
 * quantity check. Returns the per-line match verdict + the snapshots we persist.
 */
function matchLine(
  qtyScaled: number,
  unitPricePaise: number,
  poLine: PoLineRef | undefined,
  grnAcceptedScaled: number | null,
): { status: LineStatus; poUnitPricePaise: number | null; grnAcceptedQtyScaled: number | null } {
  // No PO line to compare against → can't 3-way match this row.
  if (!poLine) {
    return { status: "unmatched", poUnitPricePaise: null, grnAcceptedQtyScaled: grnAcceptedScaled };
  }

  const tol = Math.max(0, poLine.tolerancePercent);

  // Price check — invoice unit price vs PO ordered price, within tolerance.
  const priceAllowance = (poLine.unitPricePaise * tol) / 100;
  const priceVariance = Math.abs(unitPricePaise - poLine.unitPricePaise) > priceAllowance;

  // Qty check — billed qty must not exceed accepted qty (plus tolerance).
  let qtyVariance = false;
  if (grnAcceptedScaled === null) {
    // PO referenced but nothing received yet → billing ahead of receipt.
    qtyVariance = qtyScaled > 0;
  } else {
    const qtyAllowance = (grnAcceptedScaled * tol) / 100;
    qtyVariance = qtyScaled > grnAcceptedScaled + qtyAllowance;
  }

  let status: LineStatus = "matched";
  if (priceVariance) status = "price_variance";
  else if (qtyVariance) status = "qty_variance";

  return {
    status,
    poUnitPricePaise: poLine.unitPricePaise,
    grnAcceptedQtyScaled: grnAcceptedScaled,
  };
}

/** Roll per-line verdicts up to a single header match status. */
function aggregateMatch(lineStatuses: LineStatus[]): MatchStatus {
  if (lineStatuses.some((s) => s === "unmatched")) return "unmatched";
  if (lineStatuses.some((s) => s === "price_variance")) return "price_variance";
  if (lineStatuses.some((s) => s === "qty_variance")) return "qty_variance";
  return "matched";
}

/**
 * Build poItemId → accepted-qty (scaled) map. If a specific GRN is referenced we
 * use only that GRN's accepted lines; otherwise we sum accepted qty across every
 * non-cancelled GRN raised against the PO.
 */
async function loadAcceptedQtyMap(poId: string | null, grnId: string | null): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (grnId) {
    const rows = await db
      .select({
        poItemId: grnItems.poItemId,
        accepted: sql<number>`COALESCE(SUM(${grnItems.acceptedQuantityScaled}), 0)::int`.as("accepted"),
      })
      .from(grnItems)
      .where(eq(grnItems.grnId, grnId))
      .groupBy(grnItems.poItemId);
    for (const r of rows) if (r.poItemId) map.set(r.poItemId, r.accepted);
    return map;
  }
  if (poId) {
    const rows = await db
      .select({
        poItemId: grnItems.poItemId,
        accepted: sql<number>`COALESCE(SUM(${grnItems.acceptedQuantityScaled}), 0)::int`.as("accepted"),
      })
      .from(grnItems)
      .innerJoin(grns, eq(grnItems.grnId, grns.id))
      .where(and(eq(grns.poId, poId), sql`${grns.status} <> 'cancelled'`))
      .groupBy(grnItems.poItemId);
    for (const r of rows) if (r.poItemId) map.set(r.poItemId, r.accepted);
  }
  return map;
}

/** Load poItemId → ordered price + tolerance for the lines on a PO. */
async function loadPoLineMap(poId: string | null): Promise<Map<string, PoLineRef>> {
  const map = new Map<string, PoLineRef>();
  if (!poId) return map;
  const rows = await db
    .select({
      id: poItems.id,
      unitPricePaise: poItems.unitPricePaise,
      tolerancePercent: poItems.tolerancePercent,
    })
    .from(poItems)
    .where(eq(poItems.poId, poId));
  for (const r of rows) {
    map.set(r.id, { unitPricePaise: Number(r.unitPricePaise), tolerancePercent: r.tolerancePercent });
  }
  return map;
}

/** Map a match status onto the invoice lifecycle status (pre-approval). */
function statusFromMatch(match: MatchStatus): "matched" | "price_variance" | "qty_variance" | "unmatched" {
  return match;
}

export async function listVendorInvoices(tenantId: string, opts: ListOpts = {}) {
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 25, 100);
  const offset = (page - 1) * pageSize;

  const conds = [eq(vendorInvoices.tenantId, tenantId), isNull(vendorInvoices.deletedAt)];
  if (opts.status) conds.push(eq(vendorInvoices.status, opts.status as "draft"));
  if (opts.vendorId) conds.push(eq(vendorInvoices.vendorId, opts.vendorId));
  if (opts.poId) conds.push(eq(vendorInvoices.poId, opts.poId));
  if (opts.search?.trim()) {
    conds.push(ilike(vendorInvoices.invoiceNumber, `%${opts.search.trim()}%`));
  }

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        inv: vendorInvoices,
        vendorName: vendors.name,
        poNumber: purchaseOrders.poNumber,
      })
      .from(vendorInvoices)
      .leftJoin(vendors, eq(vendorInvoices.vendorId, vendors.id))
      .leftJoin(purchaseOrders, eq(vendorInvoices.poId, purchaseOrders.id))
      .where(and(...conds))
      .orderBy(desc(vendorInvoices.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(vendorInvoices).where(and(...conds)),
  ]);

  const ids = rows.map((r) => r.inv.id);
  const counts = ids.length
    ? await db
        .select({ iid: vendorInvoiceItems.invoiceId, count: sql<number>`count(*)::int` })
        .from(vendorInvoiceItems)
        .where(inArray(vendorInvoiceItems.invoiceId, ids))
        .groupBy(vendorInvoiceItems.invoiceId)
    : [];
  const countMap = new Map(counts.map((c) => [c.iid, c.count]));

  return {
    items: rows.map((r) => ({
      id: r.inv.id,
      invoiceNumber: r.inv.invoiceNumber,
      status: r.inv.status,
      matchStatus: r.inv.matchStatus,
      paymentStatus: r.inv.paymentStatus,
      vendorId: r.inv.vendorId,
      vendorName: r.vendorName,
      poId: r.inv.poId,
      poNumber: r.poNumber,
      grnId: r.inv.grnId,
      invoiceDate: r.inv.invoiceDate.toISOString(),
      totalPaise: r.inv.totalPaise,
      amountPaidPaise: r.inv.amountPaidPaise,
      itemsCount: countMap.get(r.inv.id) ?? 0,
      createdAt: r.inv.createdAt.toISOString(),
    })),
    total: totalRow[0]?.count ?? 0,
    page,
    pageSize,
  };
}

export async function getVendorInvoice(tenantId: string, id: string) {
  const [inv] = await db
    .select()
    .from(vendorInvoices)
    .where(and(eq(vendorInvoices.id, id), eq(vendorInvoices.tenantId, tenantId), isNull(vendorInvoices.deletedAt)))
    .limit(1);
  if (!inv) throw NotFound("vendor_invoice_not_found", "Vendor invoice not found");

  const [lines, vendor, po, grn, [createdBy], allocations] = await Promise.all([
    db.select().from(vendorInvoiceItems).where(eq(vendorInvoiceItems.invoiceId, id)).orderBy(vendorInvoiceItems.sortOrder),
    db.select().from(vendors).where(eq(vendors.id, inv.vendorId)).limit(1).then((r) => r[0]),
    inv.poId
      ? db
          .select({ id: purchaseOrders.id, poNumber: purchaseOrders.poNumber, title: purchaseOrders.title, status: purchaseOrders.status })
          .from(purchaseOrders)
          .where(eq(purchaseOrders.id, inv.poId))
          .limit(1)
          .then((r) => r[0])
      : Promise.resolve(undefined),
    inv.grnId
      ? db
          .select({ id: grns.id, grnNumber: grns.grnNumber, status: grns.status })
          .from(grns)
          .where(eq(grns.id, inv.grnId))
          .limit(1)
          .then((r) => r[0])
      : Promise.resolve(undefined),
    db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users).where(eq(users.id, inv.createdByUserId)).limit(1),
    db
      .select({
        alloc: paymentAllocations,
        paymentNumber: payments.paymentNumber,
        paymentDate: payments.paymentDate,
        method: payments.method,
        paymentStatus: payments.status,
      })
      .from(paymentAllocations)
      .innerJoin(payments, eq(paymentAllocations.paymentId, payments.id))
      .where(and(eq(paymentAllocations.vendorInvoiceId, id), isNull(payments.deletedAt)))
      .orderBy(desc(payments.paymentDate)),
  ]);

  const outstandingPaise = (Number(inv.totalPaise) - Number(inv.amountPaidPaise)).toString();

  return {
    ...inv,
    invoiceDate: inv.invoiceDate.toISOString(),
    approvedAt: inv.approvedAt ? inv.approvedAt.toISOString() : null,
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
    outstandingPaise,
    items: lines.map((it) => ({ ...it, createdAt: it.createdAt.toISOString() })),
    vendor,
    po,
    grn,
    createdBy,
    payments: allocations
      .filter((a) => a.paymentStatus !== "cancelled")
      .map((a) => ({
        id: a.alloc.id,
        paymentId: a.alloc.paymentId,
        paymentNumber: a.paymentNumber,
        paymentDate: a.paymentDate.toISOString(),
        method: a.method,
        allocatedPaise: a.alloc.allocatedPaise,
      })),
  };
}

/** Pre-fill an invoice from a PO — one line per PO line at the ordered price. */
export async function getInvoiceDraftFromPo(tenantId: string, poId: string) {
  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenantId, tenantId), isNull(purchaseOrders.deletedAt)))
    .limit(1);
  if (!po) throw NotFound("po_not_found", "Source PO not found");

  const lines = await db.select().from(poItems).where(eq(poItems.poId, poId)).orderBy(poItems.sortOrder);

  return {
    source: { type: "po" as const, poId: po.id, poNumber: po.poNumber, grnId: null },
    header: { companyId: po.companyId, unitId: po.unitId, vendorId: po.vendorId, poId: po.id, grnId: null },
    items: lines.map((it) => ({
      poItemId: it.id,
      grnItemId: null,
      itemId: it.itemId,
      itemName: it.itemName,
      uom: it.uom,
      quantity: it.quantityScaled / 1000,
      unitPrice: Number(it.unitPricePaise) / 100,
      taxRate: it.taxRate,
    })),
  };
}

/** Pre-fill an invoice from a GRN — one line per accepted receipt line. */
export async function getInvoiceDraftFromGrn(tenantId: string, grnId: string) {
  const [grn] = await db
    .select()
    .from(grns)
    .where(and(eq(grns.id, grnId), eq(grns.tenantId, tenantId), isNull(grns.deletedAt)))
    .limit(1);
  if (!grn) throw NotFound("grn_not_found", "Source GRN not found");

  const lines = await db.select().from(grnItems).where(eq(grnItems.grnId, grnId)).orderBy(grnItems.sortOrder);

  // Recall PO ordered prices so the invoice pre-fills at the PO rate, not the
  // GRN's (GRN unit price is informational and often left at 0).
  const poLineMap = await loadPoLineMap(grn.poId);

  return {
    source: { type: "grn" as const, poId: grn.poId, poNumber: null, grnId: grn.id, grnNumber: grn.grnNumber },
    header: { companyId: grn.companyId, unitId: grn.unitId, vendorId: grn.vendorId, poId: grn.poId, grnId: grn.id },
    items: lines
      .filter((it) => it.acceptedQuantityScaled > 0)
      .map((it) => {
        const poLine = it.poItemId ? poLineMap.get(it.poItemId) : undefined;
        const unitPricePaise = poLine?.unitPricePaise ?? Number(it.unitPricePaise);
        return {
          poItemId: it.poItemId,
          grnItemId: it.id,
          itemId: it.itemId,
          itemName: it.itemName,
          uom: it.uom,
          quantity: it.acceptedQuantityScaled / 1000,
          unitPrice: unitPricePaise / 100,
        };
      }),
  };
}

/** Compute paise totals + per-line match for a set of input lines. */
async function buildLines(input: { poId: string | null; grnId: string | null; items: VendorInvoiceItemInput[] }) {
  const [poLineMap, acceptedMap] = await Promise.all([
    loadPoLineMap(input.poId),
    loadAcceptedQtyMap(input.poId, input.grnId),
  ]);

  let subtotalPaise = 0;
  let taxTotalPaise = 0;

  const lines = input.items.map((it, idx) => {
    const qtyScaled = Math.round(it.quantity * 1000);
    const unitPricePaise = Math.round(it.unitPrice * 100);
    const taxPaise = Math.round(it.tax * 100);
    const lineSubtotalPaise = Math.round(it.quantity * it.unitPrice * 100);
    const totalPaise = lineSubtotalPaise + taxPaise;
    subtotalPaise += lineSubtotalPaise;
    taxTotalPaise += taxPaise;

    const poLine = it.poItemId ? poLineMap.get(it.poItemId) : undefined;
    const grnAccepted = it.poItemId && acceptedMap.has(it.poItemId) ? acceptedMap.get(it.poItemId)! : null;
    const m = matchLine(qtyScaled, unitPricePaise, poLine, input.poId && it.poItemId ? grnAccepted : null);

    return {
      poItemId: it.poItemId ?? null,
      grnItemId: it.grnItemId ?? null,
      itemId: it.itemId ?? null,
      itemName: it.itemName,
      uom: it.uom,
      qtyScaled,
      unitPricePaise: unitPricePaise.toString(),
      taxPaise: taxPaise.toString(),
      totalPaise: totalPaise.toString(),
      poUnitPricePaise: m.poUnitPricePaise !== null ? m.poUnitPricePaise.toString() : null,
      grnAcceptedQtyScaled: m.grnAcceptedQtyScaled,
      lineMatchStatus: m.status,
      sortOrder: idx,
    };
  });

  // An invoice with no PO link can't be 3-way matched at all.
  const matchStatus: MatchStatus = input.poId
    ? aggregateMatch(lines.map((l) => l.lineMatchStatus))
    : "unmatched";

  return {
    lines,
    subtotalPaise: subtotalPaise.toString(),
    taxTotalPaise: taxTotalPaise.toString(),
    totalPaise: (subtotalPaise + taxTotalPaise).toString(),
    matchStatus,
  };
}

export async function createVendorInvoice(input: VendorInvoiceCreateInput, ctx: ActorContext) {
  if (!input.items.length) throw BadRequest("no_items", "Add at least one line");

  const poId = input.poId ?? null;
  const grnId = input.grnId ?? null;

  const built = await buildLines({ poId, grnId, items: input.items });
  const status = statusFromMatch(built.matchStatus);

  const invId = await db.transaction(async (tx) => {
    const [inv] = await tx
      .insert(vendorInvoices)
      .values({
        tenantId: ctx.tenantId,
        companyId: input.companyId,
        unitId: input.unitId,
        vendorId: input.vendorId,
        poId,
        grnId,
        createdByUserId: ctx.userId,
        invoiceNumber: input.invoiceNumber,
        invoiceDate: new Date(input.invoiceDate),
        subtotalPaise: built.subtotalPaise,
        taxPaise: built.taxTotalPaise,
        totalPaise: built.totalPaise,
        status,
        matchStatus: built.matchStatus,
        remarks: input.remarks ?? null,
      })
      .returning({ id: vendorInvoices.id });

    if (!inv) throw new Error("Failed to create vendor invoice");

    await tx.insert(vendorInvoiceItems).values(
      built.lines.map((l) => ({ invoiceId: inv.id, ...l })),
    );

    return inv.id;
  });

  // Notify the PO creator that a bill arrived against their PO.
  if (poId) {
    const [po] = await db
      .select({ createdByUserId: purchaseOrders.createdByUserId, poNumber: purchaseOrders.poNumber, title: purchaseOrders.title })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, poId))
      .limit(1);
    if (po && po.createdByUserId !== ctx.userId) {
      await notifyUsers({
        tenantId: ctx.tenantId,
        userIds: [po.createdByUserId],
        kind: "vendor_invoice_raised",
        title: `Invoice received against ${po.poNumber ?? "PO"}`,
        body: `${input.invoiceNumber} — match: ${built.matchStatus.replace(/_/g, " ")}`,
        resourceType: "vendor_invoice",
        resourceId: invId,
        metadata: { invoiceNumber: input.invoiceNumber, matchStatus: built.matchStatus, poId },
      });
    }
  }

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "create",
    resourceType: "vendor_invoice",
    resourceId: invId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    after: { invoiceNumber: input.invoiceNumber, total: built.totalPaise, matchStatus: built.matchStatus } as Record<string, unknown>,
  });

  const [created] = await db.select().from(vendorInvoices).where(eq(vendorInvoices.id, invId)).limit(1);
  return created;
}

/** Recompute the 3-way match for an existing invoice and persist the verdict. */
export async function runThreeWayMatch(tenantId: string, id: string, ctx?: ActorContext) {
  const [inv] = await db
    .select()
    .from(vendorInvoices)
    .where(and(eq(vendorInvoices.id, id), eq(vendorInvoices.tenantId, tenantId), isNull(vendorInvoices.deletedAt)))
    .limit(1);
  if (!inv) throw NotFound("vendor_invoice_not_found", "Vendor invoice not found");
  if (inv.status === "cancelled") throw BadRequest("invoice_cancelled", "Cancelled invoices cannot be re-matched");

  const lines = await db.select().from(vendorInvoiceItems).where(eq(vendorInvoiceItems.invoiceId, id));
  const [poLineMap, acceptedMap] = await Promise.all([
    loadPoLineMap(inv.poId),
    loadAcceptedQtyMap(inv.poId, inv.grnId),
  ]);

  const lineStatuses: LineStatus[] = [];
  await db.transaction(async (tx) => {
    for (const l of lines) {
      const poLine = l.poItemId ? poLineMap.get(l.poItemId) : undefined;
      const grnAccepted = l.poItemId && acceptedMap.has(l.poItemId) ? acceptedMap.get(l.poItemId)! : null;
      const m = matchLine(l.qtyScaled, Number(l.unitPricePaise), poLine, inv.poId && l.poItemId ? grnAccepted : null);
      lineStatuses.push(m.status);
      await tx
        .update(vendorInvoiceItems)
        .set({
          poUnitPricePaise: m.poUnitPricePaise !== null ? m.poUnitPricePaise.toString() : null,
          grnAcceptedQtyScaled: m.grnAcceptedQtyScaled,
          lineMatchStatus: m.status,
        })
        .where(eq(vendorInvoiceItems.id, l.id));
    }

    const matchStatus: MatchStatus = inv.poId ? aggregateMatch(lineStatuses) : "unmatched";
    // Only move lifecycle status if we're still pre-approval.
    const nextStatus = ["approved", "cancelled"].includes(inv.status) ? inv.status : statusFromMatch(matchStatus);
    await tx
      .update(vendorInvoices)
      .set({ matchStatus, status: nextStatus, updatedAt: new Date() })
      .where(eq(vendorInvoices.id, id));
  });

  if (ctx) {
    await db.insert(auditLogs).values({
      tenantId, actorUserId: ctx.userId, action: "rematch",
      resourceType: "vendor_invoice", resourceId: id,
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    });
  }

  return getVendorInvoice(tenantId, id);
}

export async function approveVendorInvoice(id: string, ctx: ActorContext, input: VendorInvoiceApproveInput) {
  const [inv] = await db
    .select()
    .from(vendorInvoices)
    .where(and(eq(vendorInvoices.id, id), eq(vendorInvoices.tenantId, ctx.tenantId), isNull(vendorInvoices.deletedAt)))
    .limit(1);
  if (!inv) throw NotFound("vendor_invoice_not_found", "Vendor invoice not found");
  if (inv.status === "cancelled") throw BadRequest("invoice_cancelled", "Cancelled invoices cannot be approved");
  if (inv.status === "approved") return inv;

  // Block approval on any unresolved variance unless explicitly overridden.
  if (inv.matchStatus !== "matched" && !input.overrideVariance) {
    throw BadRequest(
      "variance_block",
      `This invoice has a ${inv.matchStatus.replace(/_/g, " ")} — approve with the over-tolerance override to proceed.`,
      { matchStatus: inv.matchStatus },
    );
  }

  await db
    .update(vendorInvoices)
    .set({
      status: "approved",
      approvedByUserId: ctx.userId,
      approvedAt: new Date(),
      varianceApproved: inv.matchStatus !== "matched" ? 1 : 0,
      remarks: input.remarks?.trim() ? input.remarks.trim() : inv.remarks,
      updatedAt: new Date(),
    })
    .where(eq(vendorInvoices.id, id));

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "approve",
    resourceType: "vendor_invoice",
    resourceId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    after: { matchStatus: inv.matchStatus, overrideVariance: input.overrideVariance } as Record<string, unknown>,
  });

  if (inv.createdByUserId !== ctx.userId) {
    await notifyUsers({
      tenantId: ctx.tenantId,
      userIds: [inv.createdByUserId],
      kind: "vendor_invoice_approved",
      title: `Invoice ${inv.invoiceNumber} approved`,
      body: input.overrideVariance ? "Approved with an over-tolerance override." : "Matched and approved for payment.",
      resourceType: "vendor_invoice",
      resourceId: id,
    });
  }

  const [updated] = await db.select().from(vendorInvoices).where(eq(vendorInvoices.id, id)).limit(1);
  return updated;
}

export async function cancelVendorInvoice(id: string, ctx: ActorContext) {
  const [inv] = await db
    .select()
    .from(vendorInvoices)
    .where(and(eq(vendorInvoices.id, id), eq(vendorInvoices.tenantId, ctx.tenantId), isNull(vendorInvoices.deletedAt)))
    .limit(1);
  if (!inv) throw NotFound("vendor_invoice_not_found", "Vendor invoice not found");
  if (inv.status === "cancelled") return;
  if (Number(inv.amountPaidPaise) > 0) {
    throw BadRequest("invoice_has_payments", "Cancel or reverse the payments allocated to this invoice first");
  }

  await db.update(vendorInvoices).set({ status: "cancelled", updatedAt: new Date() }).where(eq(vendorInvoices.id, id));

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "cancel",
    resourceType: "vendor_invoice",
    resourceId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}
