import { eq, and, isNull, desc, inArray, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "../db/index";
import { vendorPortalAccess } from "../db/schema/vendor_portal_access";
import { vendors } from "../db/schema/vendors";
import { companies } from "../db/schema/companies";
import { tenants } from "../db/schema/tenants";
import { purchaseOrders } from "../db/schema/po";
import { rfqs, rfqItems, rfqVendors, rfqResponses, rfqResponseItems } from "../db/schema/rfqs";
import { auditLogs } from "../db/schema/audit_logs";
import { BadRequest, Forbidden, NotFound } from "../lib/errors";
import { listPos } from "./po.service";
import { recordQuote } from "./rfq.service";
import type { QuoteSubmitInput, PortalAckInput } from "@indus/shared";

interface ActorContext {
  tenantId: string;
  userId: string;
  isTenantAdmin: boolean;
  ipAddress?: string;
  userAgent?: string;
}

interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

/** POs a vendor is allowed to see in their portal — never drafts/pending. */
const VENDOR_VISIBLE_PO_STATUSES = new Set(["sent_to_vendor", "partially_received", "received", "closed"]);

function randomToken(): string {
  return randomBytes(24).toString("base64url");
}

/* =========================================================================
 * Token lifecycle (internal — tenant-admin only)
 * ========================================================================= */

/**
 * Issue (or reuse) a portal access token for a vendor. Tenant admins only.
 * Returns the opaque token; the caller builds the `/portal/<token>` URL.
 */
export async function issueToken(
  vendorId: string,
  opts: { expiresInDays?: number | null },
  ctx: ActorContext,
) {
  if (!ctx.isTenantAdmin) throw Forbidden("admin_only", "Only tenant admins can issue vendor portal links");

  const [vendor] = await db
    .select({ id: vendors.id, name: vendors.name })
    .from(vendors)
    .where(and(eq(vendors.id, vendorId), eq(vendors.tenantId, ctx.tenantId), isNull(vendors.deletedAt)))
    .limit(1);
  if (!vendor) throw NotFound("vendor_not_found", "Vendor not found");

  // Reuse an existing live token so the same link keeps working.
  const existing = await db
    .select()
    .from(vendorPortalAccess)
    .where(
      and(
        eq(vendorPortalAccess.tenantId, ctx.tenantId),
        eq(vendorPortalAccess.vendorId, vendorId),
        isNull(vendorPortalAccess.revokedAt),
      ),
    )
    .orderBy(desc(vendorPortalAccess.createdAt));
  const now = new Date();
  const live = existing.find((e) => !e.expiresAt || e.expiresAt > now);
  if (live) {
    return {
      token: live.token,
      vendorId,
      vendorName: vendor.name,
      expiresAt: live.expiresAt ? live.expiresAt.toISOString() : null,
      reused: true,
    };
  }

  const token = randomToken();
  const expiresAt = opts.expiresInDays ? new Date(Date.now() + opts.expiresInDays * 86_400_000) : null;
  const [created] = await db
    .insert(vendorPortalAccess)
    .values({ tenantId: ctx.tenantId, vendorId, token, expiresAt })
    .returning();
  if (!created) throw new Error("Failed to issue portal token");

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "issue_portal_token",
    resourceType: "vendor",
    resourceId: vendorId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return {
    token: created.token,
    vendorId,
    vendorName: vendor.name,
    expiresAt: created.expiresAt ? created.expiresAt.toISOString() : null,
    reused: false,
  };
}

export async function revokeToken(vendorId: string, ctx: ActorContext) {
  if (!ctx.isTenantAdmin) throw Forbidden("admin_only", "Only tenant admins can revoke vendor portal links");
  await db
    .update(vendorPortalAccess)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(vendorPortalAccess.tenantId, ctx.tenantId),
        eq(vendorPortalAccess.vendorId, vendorId),
        isNull(vendorPortalAccess.revokedAt),
      ),
    );
}

/* =========================================================================
 * Token resolution — the trust boundary for every PUBLIC portal call
 * ========================================================================= */

/**
 * Resolve an opaque portal token to { tenantId, vendorId }. THIS is the only
 * source of truth for who the caller is — every downstream read/write is
 * constrained to this pair, never to anything from the request body.
 */
export async function resolveToken(token: string): Promise<{ accessId: string; tenantId: string; vendorId: string }> {
  if (!token || token.length < 10) throw NotFound("portal_invalid", "This portal link is invalid");

  const [row] = await db
    .select()
    .from(vendorPortalAccess)
    .where(eq(vendorPortalAccess.token, token))
    .limit(1);
  if (!row) throw NotFound("portal_invalid", "This portal link is invalid");
  if (row.revokedAt) throw Forbidden("portal_revoked", "This portal link has been revoked");
  if (row.expiresAt && row.expiresAt < new Date()) throw Forbidden("portal_expired", "This portal link has expired");

  // Best-effort "last seen" — never block the request on it.
  void db
    .update(vendorPortalAccess)
    .set({ lastUsedAt: new Date() })
    .where(eq(vendorPortalAccess.id, row.id))
    .catch(() => undefined);

  return { accessId: row.id, tenantId: row.tenantId, vendorId: row.vendorId };
}

/* =========================================================================
 * Public vendor-facing reads/writes (all scoped to token's tenant+vendor)
 * ========================================================================= */

export async function getPortalDashboard(token: string) {
  const { tenantId, vendorId } = await resolveToken(token);

  const [vendor] = await db
    .select({ id: vendors.id, name: vendors.name, code: vendors.code, email: vendors.email })
    .from(vendors)
    .where(and(eq(vendors.id, vendorId), eq(vendors.tenantId, tenantId), isNull(vendors.deletedAt)))
    .limit(1);
  if (!vendor) throw NotFound("vendor_not_found", "Vendor not found");

  const [[company], [tenant]] = await Promise.all([
    db
      .select({ name: companies.name })
      .from(companies)
      .where(and(eq(companies.tenantId, tenantId), isNull(companies.deletedAt)))
      .limit(1),
    db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1),
  ]);

  // POs — reuse po.service, scoped to this vendor, filtered to visible statuses.
  const poList = await listPos(tenantId, { vendorId, pageSize: 100 });
  const visiblePos = poList.items.filter((p) => VENDOR_VISIBLE_PO_STATUSES.has(p.status));
  const ackMap = new Map<string, string | null>();
  if (visiblePos.length) {
    const ackRows = await db
      .select({ id: purchaseOrders.id, acknowledgedAt: purchaseOrders.acknowledgedAt })
      .from(purchaseOrders)
      .where(inArray(purchaseOrders.id, visiblePos.map((p) => p.id)));
    for (const a of ackRows) ackMap.set(a.id, a.acknowledgedAt ? a.acknowledgedAt.toISOString() : null);
  }

  // Open RFQs this vendor is invited to + their own quote state.
  const rfqRows = await db
    .select({
      rfq: rfqs,
      respStatus: rfqResponses.status,
      respTotal: rfqResponses.totalPaise,
      respSubmittedAt: rfqResponses.submittedAt,
    })
    .from(rfqVendors)
    .innerJoin(rfqs, eq(rfqVendors.rfqId, rfqs.id))
    .leftJoin(rfqResponses, and(eq(rfqResponses.rfqId, rfqs.id), eq(rfqResponses.vendorId, vendorId)))
    .where(
      and(
        eq(rfqVendors.vendorId, vendorId),
        eq(rfqs.tenantId, tenantId),
        eq(rfqs.status, "sent"),
        isNull(rfqs.deletedAt),
      ),
    )
    .orderBy(desc(rfqs.createdAt));

  const rfqIds = rfqRows.map((r) => r.rfq.id);
  const itemCounts = rfqIds.length
    ? await db
        .select({ rfqId: rfqItems.rfqId, count: sql<number>`count(*)::int` })
        .from(rfqItems)
        .where(inArray(rfqItems.rfqId, rfqIds))
        .groupBy(rfqItems.rfqId)
    : [];
  const icMap = new Map(itemCounts.map((c) => [c.rfqId, c.count]));

  return {
    vendor: { id: vendor.id, name: vendor.name, code: vendor.code, email: vendor.email },
    buyer: { name: company?.name ?? tenant?.name ?? "Buyer" },
    pos: visiblePos.map((p) => ({
      id: p.id,
      poNumber: p.poNumber,
      title: p.title,
      status: p.status,
      totalPaise: p.totalPaise,
      itemsCount: p.itemsCount,
      deliveryDate: p.deliveryDate,
      createdAt: p.createdAt,
      acknowledgedAt: ackMap.get(p.id) ?? null,
    })),
    rfqs: rfqRows.map((r) => ({
      id: r.rfq.id,
      rfqNumber: r.rfq.rfqNumber,
      title: r.rfq.title,
      status: r.rfq.status,
      dueDate: r.rfq.dueDate ? r.rfq.dueDate.toISOString() : null,
      itemsCount: icMap.get(r.rfq.id) ?? 0,
      hasQuoted: !!r.respStatus,
      responseTotalPaise: r.respTotal ?? null,
      responseSubmittedAt: r.respSubmittedAt ? r.respSubmittedAt.toISOString() : null,
      createdAt: r.rfq.createdAt.toISOString(),
    })),
  };
}

export async function getPortalRfq(token: string, rfqId: string) {
  const { tenantId, vendorId } = await resolveToken(token);

  const [rfq] = await db
    .select()
    .from(rfqs)
    .where(and(eq(rfqs.id, rfqId), eq(rfqs.tenantId, tenantId), isNull(rfqs.deletedAt)))
    .limit(1);
  if (!rfq) throw NotFound("rfq_not_found", "RFQ not found");

  const [invited] = await db
    .select({ id: rfqVendors.id })
    .from(rfqVendors)
    .where(and(eq(rfqVendors.rfqId, rfqId), eq(rfqVendors.vendorId, vendorId)))
    .limit(1);
  if (!invited) throw Forbidden("not_invited", "You're not invited to this RFQ");

  const items = await db.select().from(rfqItems).where(eq(rfqItems.rfqId, rfqId)).orderBy(rfqItems.sortOrder);

  const [resp] = await db
    .select()
    .from(rfqResponses)
    .where(and(eq(rfqResponses.rfqId, rfqId), eq(rfqResponses.vendorId, vendorId)))
    .limit(1);
  const respItems = resp
    ? await db.select().from(rfqResponseItems).where(eq(rfqResponseItems.responseId, resp.id))
    : [];
  const priceByItem = new Map(respItems.map((ri) => [ri.rfqItemId, ri]));

  return {
    id: rfq.id,
    rfqNumber: rfq.rfqNumber,
    title: rfq.title,
    description: rfq.description,
    status: rfq.status,
    dueDate: rfq.dueDate ? rfq.dueDate.toISOString() : null,
    canQuote: rfq.status === "sent",
    items: items.map((it) => {
      const priced = priceByItem.get(it.id);
      return {
        id: it.id,
        itemName: it.itemName,
        description: it.description,
        quantity: it.quantityScaled / 1000,
        uom: it.uom,
        quotedUnitPrice: priced ? Number(priced.unitPricePaise) / 100 : null,
        quotedDeliveryDays: priced?.deliveryDays ?? null,
        quotedRemarks: priced?.remarks ?? null,
      };
    }),
    existingQuote: resp
      ? {
          remarks: resp.remarks,
          totalPaise: resp.totalPaise,
          submittedAt: resp.submittedAt ? resp.submittedAt.toISOString() : null,
        }
      : null,
  };
}

export async function submitPortalQuote(
  token: string,
  rfqId: string,
  input: QuoteSubmitInput,
  meta: RequestMeta,
) {
  const { tenantId, vendorId } = await resolveToken(token);
  // recordQuote re-validates tenant scope + "is this vendor invited?" and will
  // refuse a portal submission from a non-invited vendor.
  await recordQuote(rfqId, vendorId, input, {
    tenantId,
    userId: null,
    viaPortal: true,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  return { ok: true };
}

export async function acknowledgePo(
  token: string,
  poId: string,
  input: PortalAckInput,
  meta: RequestMeta,
) {
  const { tenantId, vendorId } = await resolveToken(token);

  const [po] = await db
    .select({
      id: purchaseOrders.id,
      status: purchaseOrders.status,
      vendorId: purchaseOrders.vendorId,
      acknowledgedAt: purchaseOrders.acknowledgedAt,
    })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenantId, tenantId), isNull(purchaseOrders.deletedAt)))
    .limit(1);
  if (!po) throw NotFound("po_not_found", "Purchase order not found");
  // Hard ownership check — the token's vendor must own this PO.
  if (po.vendorId !== vendorId) throw Forbidden("not_your_po", "This purchase order isn't addressed to you");

  // Idempotent: already acknowledged → just echo it back.
  if (po.acknowledgedAt) {
    return { acknowledgedAt: po.acknowledgedAt.toISOString(), alreadyAcknowledged: true };
  }
  if (!VENDOR_VISIBLE_PO_STATUSES.has(po.status)) {
    throw BadRequest("not_ackable", "This purchase order isn't ready to acknowledge yet");
  }

  const acknowledgedAt = new Date();
  await db
    .update(purchaseOrders)
    .set({ acknowledgedAt, updatedAt: new Date() })
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenantId, tenantId)));

  await db.insert(auditLogs).values({
    tenantId,
    actorUserId: null,
    action: "vendor_acknowledged",
    resourceType: "po",
    resourceId: poId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    metadata: { vendorId, note: input?.note ?? null } as Record<string, unknown>,
  });

  return { acknowledgedAt: acknowledgedAt.toISOString(), alreadyAcknowledged: false };
}
