import { eq, and, isNull, ilike, desc, sql, inArray } from "drizzle-orm";
import { db } from "../db/index";
import { rfqs, rfqItems, rfqVendors, rfqResponses, rfqResponseItems } from "../db/schema/rfqs";
import { vendors } from "../db/schema/vendors";
import { users } from "../db/schema/users";
import { companies } from "../db/schema/companies";
import { units } from "../db/schema/units";
import { auditLogs } from "../db/schema/audit_logs";
import { BadRequest, Forbidden, NotFound } from "../lib/errors";
import { createPo } from "./po.service";
import type { RfqCreateInput, QuoteSubmitInput, PoCreateInput } from "@indus/shared";

interface ActorContext {
  tenantId: string;
  userId: string;
  isTenantAdmin: boolean;
  ipAddress?: string;
  userAgent?: string;
}

/** Quote-recording context — userId is null when the quote arrives via the public portal. */
interface QuoteContext {
  tenantId: string;
  userId?: string | null;
  ipAddress?: string;
  userAgent?: string;
  viaPortal?: boolean;
}

interface ListOpts {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
}

async function nextRfqNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(rfqs)
    .where(and(eq(rfqs.tenantId, tenantId), sql`${rfqs.createdAt} >= ${yearStart}`));
  const count = result[0]?.count ?? 0;
  return `RFQ-${year}-${String(count + 1).padStart(5, "0")}`;
}

async function getRfqRaw(tenantId: string, id: string) {
  const [rfq] = await db
    .select()
    .from(rfqs)
    .where(and(eq(rfqs.id, id), eq(rfqs.tenantId, tenantId), isNull(rfqs.deletedAt)))
    .limit(1);
  if (!rfq) throw NotFound("rfq_not_found", "RFQ not found");
  return rfq;
}

/** Filter a vendorId list down to those that genuinely belong to this tenant. */
async function tenantVendorIds(tenantId: string, vendorIds: string[]): Promise<string[]> {
  const unique = Array.from(new Set(vendorIds));
  if (!unique.length) return [];
  const rows = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(and(eq(vendors.tenantId, tenantId), inArray(vendors.id, unique), isNull(vendors.deletedAt)));
  return rows.map((r) => r.id);
}

export async function createRfq(input: RfqCreateInput, ctx: ActorContext) {
  if (!input.items.length) throw BadRequest("no_items", "Add at least one line item");

  const rfqNumber = await nextRfqNumber(ctx.tenantId);
  const validVendorIds = await tenantVendorIds(ctx.tenantId, input.vendorIds);

  const rfq = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(rfqs)
      .values({
        tenantId: ctx.tenantId,
        rfqNumber,
        title: input.title,
        description: input.description ?? null,
        status: validVendorIds.length ? "sent" : "draft",
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        createdByUserId: ctx.userId,
      })
      .returning();
    if (!created) throw new Error("Failed to create RFQ");

    await tx.insert(rfqItems).values(
      input.items.map((it, idx) => ({
        rfqId: created.id,
        itemId: it.itemId ?? null,
        itemName: it.itemName,
        description: it.description ?? null,
        quantityScaled: Math.round(it.quantity * 1000),
        uom: it.uom,
        sortOrder: idx,
      })),
    );

    if (validVendorIds.length) {
      await tx.insert(rfqVendors).values(validVendorIds.map((vendorId) => ({ rfqId: created.id, vendorId })));
    }

    return created;
  });

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "create",
    resourceType: "rfq",
    resourceId: rfq.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    after: { rfqNumber, title: rfq.title, status: rfq.status } as Record<string, unknown>,
  });

  return rfq;
}

export async function listRfqs(tenantId: string, opts: ListOpts = {}) {
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 25, 100);
  const offset = (page - 1) * pageSize;

  const conds = [eq(rfqs.tenantId, tenantId), isNull(rfqs.deletedAt)];
  if (opts.status) conds.push(eq(rfqs.status, opts.status as "draft"));
  if (opts.search?.trim()) conds.push(ilike(rfqs.title, `%${opts.search.trim()}%`));

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(rfqs)
      .where(and(...conds))
      .orderBy(desc(rfqs.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(rfqs).where(and(...conds)),
  ]);

  const ids = rows.map((r) => r.id);
  const [vendorCounts, responseCounts, itemCounts] = ids.length
    ? await Promise.all([
        db
          .select({ rfqId: rfqVendors.rfqId, count: sql<number>`count(*)::int` })
          .from(rfqVendors)
          .where(inArray(rfqVendors.rfqId, ids))
          .groupBy(rfqVendors.rfqId),
        db
          .select({ rfqId: rfqResponses.rfqId, count: sql<number>`count(*)::int` })
          .from(rfqResponses)
          .where(inArray(rfqResponses.rfqId, ids))
          .groupBy(rfqResponses.rfqId),
        db
          .select({ rfqId: rfqItems.rfqId, count: sql<number>`count(*)::int` })
          .from(rfqItems)
          .where(inArray(rfqItems.rfqId, ids))
          .groupBy(rfqItems.rfqId),
      ])
    : [[], [], []];

  const vMap = new Map(vendorCounts.map((c) => [c.rfqId, c.count]));
  const rMap = new Map(responseCounts.map((c) => [c.rfqId, c.count]));
  const iMap = new Map(itemCounts.map((c) => [c.rfqId, c.count]));

  return {
    items: rows.map((r) => ({
      id: r.id,
      rfqNumber: r.rfqNumber,
      title: r.title,
      status: r.status,
      dueDate: r.dueDate ? r.dueDate.toISOString() : null,
      vendorCount: vMap.get(r.id) ?? 0,
      responseCount: rMap.get(r.id) ?? 0,
      itemsCount: iMap.get(r.id) ?? 0,
      awardedPoId: r.awardedPoId,
      createdAt: r.createdAt.toISOString(),
    })),
    total: totalRow[0]?.count ?? 0,
    page,
    pageSize,
  };
}

export async function getRfq(tenantId: string, id: string) {
  const rfq = await getRfqRaw(tenantId, id);

  const [items, vendorRows, [creator]] = await Promise.all([
    db.select().from(rfqItems).where(eq(rfqItems.rfqId, id)).orderBy(rfqItems.sortOrder),
    db
      .select({
        vendorId: rfqVendors.vendorId,
        vendorName: vendors.name,
        vendorEmail: vendors.email,
        invitedAt: rfqVendors.invitedAt,
        respStatus: rfqResponses.status,
        respTotal: rfqResponses.totalPaise,
        respSubmittedAt: rfqResponses.submittedAt,
        respViaPortal: rfqResponses.viaPortal,
      })
      .from(rfqVendors)
      .leftJoin(vendors, eq(rfqVendors.vendorId, vendors.id))
      .leftJoin(
        rfqResponses,
        and(eq(rfqResponses.rfqId, rfqVendors.rfqId), eq(rfqResponses.vendorId, rfqVendors.vendorId)),
      )
      .where(eq(rfqVendors.rfqId, id))
      .orderBy(vendors.name),
    db.select({ fullName: users.fullName, email: users.email }).from(users).where(eq(users.id, rfq.createdByUserId)).limit(1),
  ]);

  return {
    id: rfq.id,
    rfqNumber: rfq.rfqNumber,
    title: rfq.title,
    description: rfq.description,
    status: rfq.status,
    dueDate: rfq.dueDate ? rfq.dueDate.toISOString() : null,
    createdByUserId: rfq.createdByUserId,
    createdByName: creator?.fullName ?? "Unknown",
    awardedVendorId: rfq.awardedVendorId,
    awardedPoId: rfq.awardedPoId,
    awardedAt: rfq.awardedAt ? rfq.awardedAt.toISOString() : null,
    createdAt: rfq.createdAt.toISOString(),
    updatedAt: rfq.updatedAt.toISOString(),
    items: items.map((it) => ({
      id: it.id,
      itemId: it.itemId,
      itemName: it.itemName,
      description: it.description,
      quantityScaled: it.quantityScaled,
      quantity: it.quantityScaled / 1000,
      uom: it.uom,
      sortOrder: it.sortOrder,
    })),
    vendors: vendorRows.map((v) => ({
      vendorId: v.vendorId,
      vendorName: v.vendorName ?? "Vendor",
      vendorEmail: v.vendorEmail ?? null,
      invitedAt: v.invitedAt ? v.invitedAt.toISOString() : null,
      hasQuoted: !!v.respStatus,
      responseStatus: v.respStatus ?? null,
      responseTotalPaise: v.respTotal ?? null,
      responseSubmittedAt: v.respSubmittedAt ? v.respSubmittedAt.toISOString() : null,
      viaPortal: v.respViaPortal === 1,
    })),
  };
}

export async function inviteVendors(rfqId: string, vendorIds: string[], ctx: ActorContext) {
  const rfq = await getRfqRaw(ctx.tenantId, rfqId);
  if (["awarded", "cancelled"].includes(rfq.status)) {
    throw BadRequest("rfq_closed", "Can't invite vendors to a finished RFQ");
  }

  const valid = await tenantVendorIds(ctx.tenantId, vendorIds);
  if (!valid.length) throw BadRequest("no_vendors", "None of those vendors belong to this workspace");

  // Skip vendors already invited (uniqueness is also DB-enforced).
  const already = await db
    .select({ vendorId: rfqVendors.vendorId })
    .from(rfqVendors)
    .where(and(eq(rfqVendors.rfqId, rfqId), inArray(rfqVendors.vendorId, valid)));
  const alreadySet = new Set(already.map((a) => a.vendorId));
  const toAdd = valid.filter((v) => !alreadySet.has(v));

  if (toAdd.length) {
    await db.insert(rfqVendors).values(toAdd.map((vendorId) => ({ rfqId, vendorId })));
  }

  // Sending the first invite moves a draft RFQ to "sent".
  if (rfq.status === "draft") {
    await db.update(rfqs).set({ status: "sent", updatedAt: new Date() }).where(eq(rfqs.id, rfqId));
  }

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "invite_vendors",
    resourceType: "rfq",
    resourceId: rfqId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    metadata: { added: toAdd } as Record<string, unknown>,
  });

  return { added: toAdd.length, alreadyInvited: alreadySet.size };
}

/**
 * Record a vendor's quote. Shared by the internal "enter on behalf of vendor"
 * flow and the public portal. The (rfqId, vendorId) pair is the trust boundary —
 * callers must pass a vendorId they're authorised for (the portal resolves it
 * from the opaque token; never from the request body).
 */
export async function recordQuote(
  rfqId: string,
  vendorId: string,
  input: QuoteSubmitInput,
  ctx: QuoteContext,
) {
  const rfq = await getRfqRaw(ctx.tenantId, rfqId);
  if (["awarded", "cancelled"].includes(rfq.status)) {
    throw BadRequest("rfq_closed", "This RFQ is no longer accepting quotes");
  }

  const [vendor] = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(and(eq(vendors.id, vendorId), eq(vendors.tenantId, ctx.tenantId), isNull(vendors.deletedAt)))
    .limit(1);
  if (!vendor) throw NotFound("vendor_not_found", "Vendor not found");

  // Vendor must be invited. Portal callers can never self-invite; internal
  // callers auto-invite for convenience.
  const [invited] = await db
    .select({ id: rfqVendors.id })
    .from(rfqVendors)
    .where(and(eq(rfqVendors.rfqId, rfqId), eq(rfqVendors.vendorId, vendorId)))
    .limit(1);
  if (!invited) {
    if (ctx.viaPortal) throw Forbidden("not_invited", "You're not invited to quote on this RFQ");
    await db.insert(rfqVendors).values({ rfqId, vendorId });
  }

  // Validate every quoted line belongs to this RFQ; compute line + grand totals.
  const lines = await db.select().from(rfqItems).where(eq(rfqItems.rfqId, rfqId));
  const lineById = new Map(lines.map((l) => [l.id, l]));
  let totalPaise = 0n;
  const responseItemValues = input.items.map((qi) => {
    const line = lineById.get(qi.rfqItemId);
    if (!line) throw BadRequest("invalid_line", "A quoted line does not belong to this RFQ");
    const unitPaise = BigInt(Math.round(qi.unitPrice * 100));
    totalPaise += (BigInt(line.quantityScaled) * unitPaise) / 1000n;
    return {
      rfqItemId: qi.rfqItemId,
      unitPricePaise: unitPaise.toString(),
      deliveryDays: qi.deliveryDays ?? null,
      remarks: qi.remarks ?? null,
    };
  });

  const saved = await db.transaction(async (tx) => {
    // Upsert: drop any prior quote from this vendor, then re-insert fresh.
    const [existing] = await tx
      .select({ id: rfqResponses.id })
      .from(rfqResponses)
      .where(and(eq(rfqResponses.rfqId, rfqId), eq(rfqResponses.vendorId, vendorId)))
      .limit(1);
    if (existing) {
      await tx.delete(rfqResponseItems).where(eq(rfqResponseItems.responseId, existing.id));
      await tx.delete(rfqResponses).where(eq(rfqResponses.id, existing.id));
    }

    const [resp] = await tx
      .insert(rfqResponses)
      .values({
        tenantId: ctx.tenantId,
        rfqId,
        vendorId,
        status: "submitted",
        submittedAt: new Date(),
        totalPaise: totalPaise.toString(),
        remarks: input.remarks ?? null,
        viaPortal: ctx.viaPortal ? 1 : 0,
      })
      .returning();
    if (!resp) throw new Error("Failed to record quote");

    if (responseItemValues.length) {
      await tx.insert(rfqResponseItems).values(responseItemValues.map((r) => ({ ...r, responseId: resp.id })));
    }
    return resp;
  });

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId ?? null,
    action: "quote_submitted",
    resourceType: "rfq",
    resourceId: rfqId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    metadata: { vendorId, totalPaise: saved.totalPaise, viaPortal: !!ctx.viaPortal } as Record<string, unknown>,
  });

  return saved;
}

/**
 * Side-by-side comparison: per-item best unit price across vendors and per-vendor
 * grand totals. Used by the award UI to pick a winner.
 */
export async function compareQuotes(tenantId: string, rfqId: string) {
  const rfq = await getRfqRaw(tenantId, rfqId);

  const [lines, responses] = await Promise.all([
    db.select().from(rfqItems).where(eq(rfqItems.rfqId, rfqId)).orderBy(rfqItems.sortOrder),
    db
      .select({ resp: rfqResponses, vendorName: vendors.name })
      .from(rfqResponses)
      .leftJoin(vendors, eq(rfqResponses.vendorId, vendors.id))
      .where(and(eq(rfqResponses.rfqId, rfqId), eq(rfqResponses.tenantId, tenantId))),
  ]);

  const respIds = responses.map((r) => r.resp.id);
  const respItems = respIds.length
    ? await db.select().from(rfqResponseItems).where(inArray(rfqResponseItems.responseId, respIds))
    : [];

  const byResp = new Map<string, Map<string, (typeof respItems)[number]>>();
  for (const ri of respItems) {
    if (!byResp.has(ri.responseId)) byResp.set(ri.responseId, new Map());
    byResp.get(ri.responseId)!.set(ri.rfqItemId, ri);
  }

  let lowestTotal: bigint | null = null;
  for (const r of responses) {
    const t = BigInt(r.resp.totalPaise || "0");
    if (lowestTotal === null || t < lowestTotal) lowestTotal = t;
  }

  const vendorsOut = responses.map((r) => ({
    vendorId: r.resp.vendorId,
    vendorName: r.vendorName ?? "Vendor",
    responseId: r.resp.id,
    totalPaise: r.resp.totalPaise,
    status: r.resp.status,
    submittedAt: r.resp.submittedAt ? r.resp.submittedAt.toISOString() : null,
    viaPortal: r.resp.viaPortal === 1,
    isLowestTotal: lowestTotal !== null && BigInt(r.resp.totalPaise || "0") === lowestTotal,
  }));

  const itemsOut = lines.map((line) => {
    let best: bigint | null = null;
    let bestVendorId: string | null = null;
    const quotes = responses.map((r) => {
      const ri = byResp.get(r.resp.id)?.get(line.id);
      const unitPricePaise = ri ? ri.unitPricePaise : null;
      const lineTotalPaise = ri
        ? ((BigInt(line.quantityScaled) * BigInt(ri.unitPricePaise)) / 1000n).toString()
        : null;
      if (ri) {
        const p = BigInt(ri.unitPricePaise);
        if (p > 0n && (best === null || p < best)) {
          best = p;
          bestVendorId = r.resp.vendorId;
        }
      }
      return {
        vendorId: r.resp.vendorId,
        vendorName: r.vendorName ?? "Vendor",
        unitPricePaise,
        lineTotalPaise,
        deliveryDays: ri?.deliveryDays ?? null,
        hasQuote: !!ri,
      };
    });
    return {
      rfqItemId: line.id,
      itemName: line.itemName,
      quantityScaled: line.quantityScaled,
      quantity: line.quantityScaled / 1000,
      uom: line.uom,
      bestVendorId,
      quotes: quotes.map((q) => ({ ...q, isBest: q.hasQuote && bestVendorId !== null && q.vendorId === bestVendorId })),
    };
  });

  return {
    rfq: { id: rfq.id, rfqNumber: rfq.rfqNumber, title: rfq.title, status: rfq.status, awardedVendorId: rfq.awardedVendorId },
    items: itemsOut,
    vendors: vendorsOut,
  };
}

/**
 * Award the RFQ to a vendor: turns their winning quote into a DRAFT PO
 * (via po.service.createPo) and marks the RFQ awarded.
 */
export async function award(rfqId: string, vendorId: string, ctx: ActorContext) {
  const rfq = await getRfqRaw(ctx.tenantId, rfqId);
  if (rfq.status === "awarded") throw BadRequest("already_awarded", "This RFQ has already been awarded");
  if (rfq.status === "cancelled") throw BadRequest("rfq_cancelled", "This RFQ was cancelled");

  const [resp] = await db
    .select()
    .from(rfqResponses)
    .where(
      and(eq(rfqResponses.rfqId, rfqId), eq(rfqResponses.vendorId, vendorId), eq(rfqResponses.tenantId, ctx.tenantId)),
    )
    .limit(1);
  if (!resp) throw BadRequest("no_quote", "That vendor hasn't submitted a quote yet");

  const [vendor] = await db
    .select({ id: vendors.id, name: vendors.name })
    .from(vendors)
    .where(and(eq(vendors.id, vendorId), eq(vendors.tenantId, ctx.tenantId), isNull(vendors.deletedAt)))
    .limit(1);
  if (!vendor) throw NotFound("vendor_not_found", "Vendor not found");

  // RFQs have no company/unit of their own — anchor the PO to the tenant's first.
  const [company] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.tenantId, ctx.tenantId), isNull(companies.deletedAt)))
    .limit(1);
  const [unit] = await db
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.tenantId, ctx.tenantId), isNull(units.deletedAt)))
    .limit(1);
  if (!company || !unit) throw BadRequest("no_org", "Set up a company and unit before awarding an RFQ");

  const [lines, respItems] = await Promise.all([
    db.select().from(rfqItems).where(eq(rfqItems.rfqId, rfqId)).orderBy(rfqItems.sortOrder),
    db.select().from(rfqResponseItems).where(eq(rfqResponseItems.responseId, resp.id)),
  ]);
  const priceByItem = new Map(respItems.map((ri) => [ri.rfqItemId, ri]));

  const poLineItems = lines
    .map((line) => {
      const priced = priceByItem.get(line.id);
      if (!priced) return null; // vendor didn't quote this line
      const unitPrice = Number(priced.unitPricePaise) / 100;
      if (!(unitPrice > 0)) return null; // PO requires a positive unit price
      return {
        itemId: line.itemId ?? null,
        itemName: line.itemName,
        description: line.description ?? null,
        quantity: line.quantityScaled / 1000,
        uom: line.uom,
        unitPrice,
        discountPercent: 0,
        taxRate: 18,
        tolerancePercent: 0,
        warrantyMonths: 0,
        isForStock: false,
        isRecoveryRate: false,
        deliverySchedule: [],
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (!poLineItems.length) {
    throw BadRequest("no_priced_lines", "The winning quote has no priced lines to turn into a PO");
  }

  const poInput: PoCreateInput = {
    companyId: company.id,
    unitId: unit.id,
    vendorId,
    title: rfq.title,
    description: `Awarded from ${rfq.rfqNumber ?? "RFQ"}${rfq.description ? ` — ${rfq.description}` : ""}`,
    isInterstate: false,
    freightCharges: 0,
    otherCharges: 0,
    roundOff: 0,
    revisionNo: 0,
    additionalCharges: [],
    items: poLineItems,
  };

  const po = await createPo(poInput, ctx);

  await db
    .update(rfqs)
    .set({
      status: "awarded",
      awardedVendorId: vendorId,
      awardedPoId: po.id,
      awardedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(rfqs.id, rfqId), eq(rfqs.tenantId, ctx.tenantId)));

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "award",
    resourceType: "rfq",
    resourceId: rfqId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    metadata: { vendorId, poId: po.id, poNumber: po.poNumber } as Record<string, unknown>,
  });

  return { poId: po.id, poNumber: po.poNumber ?? null, vendorName: vendor.name };
}

/** Close an RFQ to further quotes (without awarding) or cancel it outright. */
export async function setRfqStatus(rfqId: string, status: "closed" | "cancelled", ctx: ActorContext) {
  const rfq = await getRfqRaw(ctx.tenantId, rfqId);
  if (rfq.status === "awarded") throw BadRequest("already_awarded", "An awarded RFQ can't change status");

  await db
    .update(rfqs)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(rfqs.id, rfqId), eq(rfqs.tenantId, ctx.tenantId)));

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: status === "closed" ? "close" : "cancel",
    resourceType: "rfq",
    resourceId: rfqId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}
