import { eq, and, isNull, ilike, desc, sql, inArray } from "drizzle-orm";
import { db } from "../db/index";
import { purchaseRequisitions, prItems } from "../db/schema/pr";
import { users } from "../db/schema/users";
import { auditLogs } from "../db/schema/audit_logs";
import { approvalActions } from "../db/schema/approvals";
import { companies } from "../db/schema/companies";
import { units } from "../db/schema/units";
import { BadRequest, Forbidden, NotFound } from "../lib/errors";
import type { PrCreateInput } from "@indus/shared";

interface ListOpts {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  requesterId?: string;
}

interface ActorContext {
  tenantId: string;
  userId: string;
  isTenantAdmin: boolean;
  ipAddress?: string;
  userAgent?: string;
}

/** Sum line-item totals (paise) and clamp to non-negative. */
function computeTotalPaise(items: PrCreateInput["items"]): bigint {
  let total = 0n;
  for (const it of items) {
    const qty = BigInt(Math.round(it.quantity * 1000));
    const unitPaise = it.estimatedUnitPrice
      ? BigInt(Math.round(it.estimatedUnitPrice * 100))
      : 0n;
    // (qty/1000) * unitPaise = (qty * unitPaise) / 1000
    total += (qty * unitPaise) / 1000n;
  }
  return total;
}

async function nextPrNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseRequisitions)
    .where(and(eq(purchaseRequisitions.tenantId, tenantId), sql`${purchaseRequisitions.createdAt} >= ${yearStart}`));
  const count = result[0]?.count ?? 0;
  return `PR-${year}-${String(count + 1).padStart(5, "0")}`;
}

export async function listPrs(tenantId: string, opts: ListOpts = {}) {
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 25, 100);
  const offset = (page - 1) * pageSize;

  const conds = [eq(purchaseRequisitions.tenantId, tenantId), isNull(purchaseRequisitions.deletedAt)];
  if (opts.status) conds.push(eq(purchaseRequisitions.status, opts.status as "draft"));
  if (opts.requesterId) conds.push(eq(purchaseRequisitions.requesterId, opts.requesterId));
  if (opts.search?.trim()) conds.push(ilike(purchaseRequisitions.title, `%${opts.search.trim()}%`));

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        pr: purchaseRequisitions,
        requesterName: users.fullName,
      })
      .from(purchaseRequisitions)
      .leftJoin(users, eq(purchaseRequisitions.requesterId, users.id))
      .where(and(...conds))
      .orderBy(desc(purchaseRequisitions.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(purchaseRequisitions)
      .where(and(...conds)),
  ]);

  // item counts in one query
  const prIds = rows.map((r) => r.pr.id);
  const counts = prIds.length
    ? await db
        .select({
          prId: prItems.prId,
          count: sql<number>`count(*)::int`,
        })
        .from(prItems)
        .where(inArray(prItems.prId, prIds))
        .groupBy(prItems.prId)
    : [];
  const countMap = new Map(counts.map((c) => [c.prId, c.count]));

  return {
    items: rows.map((r) => ({
      id: r.pr.id,
      prNumber: r.pr.prNumber,
      title: r.pr.title,
      status: r.pr.status,
      priority: r.pr.priority,
      requesterId: r.pr.requesterId,
      requesterName: r.requesterName ?? "Unknown",
      companyId: r.pr.companyId,
      unitId: r.pr.unitId,
      itemsCount: countMap.get(r.pr.id) ?? 0,
      estimatedTotalPaise: r.pr.estimatedTotalPaise,
      currency: r.pr.currency,
      createdAt: r.pr.createdAt.toISOString(),
      neededBy: r.pr.neededBy ? r.pr.neededBy.toISOString() : null,
    })),
    total: totalRow[0]?.count ?? 0,
    page,
    pageSize,
  };
}

export async function getPr(tenantId: string, id: string) {
  const [pr] = await db
    .select()
    .from(purchaseRequisitions)
    .where(and(eq(purchaseRequisitions.id, id), eq(purchaseRequisitions.tenantId, tenantId), isNull(purchaseRequisitions.deletedAt)))
    .limit(1);
  if (!pr) throw NotFound("pr_not_found", "Requisition not found");

  const [items, [requester], [company], [unit], actions] = await Promise.all([
    db.select().from(prItems).where(eq(prItems.prId, id)).orderBy(prItems.sortOrder),
    db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users).where(eq(users.id, pr.requesterId)).limit(1),
    db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, pr.companyId)).limit(1),
    db.select({ id: units.id, name: units.name, code: units.code }).from(units).where(eq(units.id, pr.unitId)).limit(1),
    db
      .select({
        action: approvalActions,
        actor: { fullName: users.fullName, email: users.email },
      })
      .from(approvalActions)
      .leftJoin(users, eq(approvalActions.actorUserId, users.id))
      .where(and(eq(approvalActions.resourceType, "pr"), eq(approvalActions.resourceId, id)))
      .orderBy(approvalActions.createdAt),
  ]);

  return {
    ...pr,
    createdAt: pr.createdAt.toISOString(),
    updatedAt: pr.updatedAt.toISOString(),
    decidedAt: pr.decidedAt?.toISOString() ?? null,
    submittedAt: pr.submittedAt?.toISOString() ?? null,
    neededBy: pr.neededBy ? pr.neededBy.toISOString() : null,
    items: items.map((it) => ({
      ...it,
      expectedDeliveryDate: it.expectedDeliveryDate ? it.expectedDeliveryDate.toISOString() : null,
      createdAt: it.createdAt.toISOString(),
    })),
    requester,
    company,
    unit,
    timeline: actions.map((a) => ({
      id: a.action.id,
      action: a.action.action,
      comment: a.action.comment,
      level: a.action.level,
      actorRoleKey: a.action.actorRoleKey,
      actorName: a.actor?.fullName ?? "Unknown",
      actorEmail: a.actor?.email ?? "",
      createdAt: a.action.createdAt.toISOString(),
    })),
  };
}

export async function createPr(input: PrCreateInput, ctx: ActorContext) {
  if (!input.items.length) throw BadRequest("no_items", "Add at least one line item");

  const totalPaise = computeTotalPaise(input.items);

  const [pr] = await db
    .insert(purchaseRequisitions)
    .values({
      tenantId: ctx.tenantId,
      companyId: input.companyId,
      unitId: input.unitId,
      departmentId: input.departmentId ?? null,
      requesterId: ctx.userId,
      title: input.title,
      description: input.description ?? null,
      prType: input.prType ?? "stock",
      referenceNo: input.referenceNo ?? null,
      buyerUserId: input.buyerUserId ?? null,
      priority: input.priority,
      status: "draft",
      estimatedTotalPaise: totalPaise.toString(),
      neededBy: input.neededBy ? new Date(input.neededBy) : null,
    })
    .returning();

  if (!pr) throw new Error("Failed to create PR");

  await db.insert(prItems).values(
    input.items.map((it, idx) => {
      const qtyScaled = Math.round(it.quantity * 1000);
      const unitPaise = it.estimatedUnitPrice ? Math.round(it.estimatedUnitPrice * 100) : null;
      const itemTotalPaise = unitPaise ? Math.round((qtyScaled * unitPaise) / 1000) : 0;
      return {
        prId: pr.id,
        itemId: it.itemId ?? null,
        itemName: it.itemName,
        description: it.description ?? null,
        itemGroupName: it.itemGroupName ?? null,
        itemSubGroupName: it.itemSubGroupName ?? null,
        hsnCode: it.hsnCode ?? null,
        quantityScaled: qtyScaled,
        uom: it.uom,
        stockUnit: it.stockUnit ?? null,
        purchaseUnit: it.purchaseUnit ?? null,
        estimatedUnitPricePaise: unitPaise?.toString() ?? null,
        estimatedTotalPaise: itemTotalPaise.toString(),
        lastPurchaseRatePaise: it.lastPurchaseRate ? Math.round(it.lastPurchaseRate * 100).toString() : null,
        lastPurchaseDate: it.lastPurchaseDate ? new Date(it.lastPurchaseDate) : null,
        expectedDeliveryDate: it.expectedDeliveryDate ? new Date(it.expectedDeliveryDate) : null,
        itemNarration: it.itemNarration ?? null,
        notes: it.notes ?? null,
        lineBuyerUserId: it.lineBuyerUserId ?? null,
        specifications: (it.specifications as Record<string, unknown>) ?? {},
        sortOrder: idx,
      };
    }),
  );

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "create",
    resourceType: "pr",
    resourceId: pr.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    after: { title: pr.title, status: pr.status, total: pr.estimatedTotalPaise } as Record<string, unknown>,
  });

  return pr;
}

export async function updatePr(id: string, input: PrCreateInput, ctx: ActorContext) {
  const existing = await getPrRaw(ctx.tenantId, id);
  if (existing.status !== "draft") {
    throw BadRequest("not_editable", "Only draft PRs can be edited");
  }
  if (existing.requesterId !== ctx.userId && !ctx.isTenantAdmin) {
    throw Forbidden("not_owner", "Only the requester or a tenant admin can edit this draft");
  }

  const totalPaise = computeTotalPaise(input.items);

  const [updated] = await db
    .update(purchaseRequisitions)
    .set({
      companyId: input.companyId,
      unitId: input.unitId,
      departmentId: input.departmentId ?? null,
      title: input.title,
      description: input.description ?? null,
      prType: input.prType ?? "stock",
      referenceNo: input.referenceNo ?? null,
      buyerUserId: input.buyerUserId ?? null,
      priority: input.priority,
      estimatedTotalPaise: totalPaise.toString(),
      neededBy: input.neededBy ? new Date(input.neededBy) : null,
      updatedAt: new Date(),
    })
    .where(eq(purchaseRequisitions.id, id))
    .returning();

  // Replace line items (simpler than diff for MVP)
  await db.delete(prItems).where(eq(prItems.prId, id));
  await db.insert(prItems).values(
    input.items.map((it, idx) => {
      const qtyScaled = Math.round(it.quantity * 1000);
      const unitPaise = it.estimatedUnitPrice ? Math.round(it.estimatedUnitPrice * 100) : null;
      const itemTotalPaise = unitPaise ? Math.round((qtyScaled * unitPaise) / 1000) : 0;
      return {
        prId: id,
        itemId: it.itemId ?? null,
        itemName: it.itemName,
        description: it.description ?? null,
        itemGroupName: it.itemGroupName ?? null,
        itemSubGroupName: it.itemSubGroupName ?? null,
        hsnCode: it.hsnCode ?? null,
        quantityScaled: qtyScaled,
        uom: it.uom,
        stockUnit: it.stockUnit ?? null,
        purchaseUnit: it.purchaseUnit ?? null,
        estimatedUnitPricePaise: unitPaise?.toString() ?? null,
        estimatedTotalPaise: itemTotalPaise.toString(),
        lastPurchaseRatePaise: it.lastPurchaseRate ? Math.round(it.lastPurchaseRate * 100).toString() : null,
        lastPurchaseDate: it.lastPurchaseDate ? new Date(it.lastPurchaseDate) : null,
        expectedDeliveryDate: it.expectedDeliveryDate ? new Date(it.expectedDeliveryDate) : null,
        itemNarration: it.itemNarration ?? null,
        notes: it.notes ?? null,
        lineBuyerUserId: it.lineBuyerUserId ?? null,
        specifications: (it.specifications as Record<string, unknown>) ?? {},
        sortOrder: idx,
      };
    }),
  );

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "update",
    resourceType: "pr",
    resourceId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return updated;
}

export async function submitPr(id: string, ctx: ActorContext, comment?: string) {
  const pr = await getPrRaw(ctx.tenantId, id);
  if (pr.status !== "draft") throw BadRequest("invalid_status", "Only drafts can be submitted");
  if (pr.requesterId !== ctx.userId && !ctx.isTenantAdmin) {
    throw Forbidden("not_owner", "Only the requester or tenant admin can submit");
  }

  const prNumber = pr.prNumber ?? (await nextPrNumber(ctx.tenantId));
  const chain = [{ level: 1, roleKey: "approver", status: "pending" }];

  await db.transaction(async (tx) => {
    await tx
      .update(purchaseRequisitions)
      .set({
        status: "pending_l1",
        prNumber,
        submittedAt: new Date(),
        approvalChain: chain,
        updatedAt: new Date(),
      })
      .where(eq(purchaseRequisitions.id, id));

    await tx.insert(approvalActions).values({
      tenantId: ctx.tenantId,
      resourceType: "pr",
      resourceId: id,
      actorUserId: ctx.userId,
      action: "submit",
      comment: comment ?? null,
    });
  });

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "submit",
    resourceType: "pr",
    resourceId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

export async function approvePr(id: string, ctx: ActorContext, comment?: string) {
  const pr = await getPrRaw(ctx.tenantId, id);
  if (!["pending_l1", "pending_l2", "escalated"].includes(pr.status)) {
    throw BadRequest("invalid_status", "This PR isn't waiting for approval");
  }
  if (pr.requesterId === ctx.userId && !ctx.isTenantAdmin) {
    throw Forbidden("self_approve", "You cannot approve your own requisition");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(purchaseRequisitions)
      .set({
        status: "approved",
        decidedAt: new Date(),
        approvalChain: [{ level: 1, roleKey: "approver", status: "approved" }],
        updatedAt: new Date(),
      })
      .where(eq(purchaseRequisitions.id, id));

    await tx.insert(approvalActions).values({
      tenantId: ctx.tenantId,
      resourceType: "pr",
      resourceId: id,
      actorUserId: ctx.userId,
      action: "approve",
      level: 1,
      comment: comment ?? null,
    });
  });

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "approve",
    resourceType: "pr",
    resourceId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

/**
 * Send a pending PR back to the requester for revision. Mirrors legacy "Send Back"
 * — softer than reject; the PR returns to draft so the requester can edit and resubmit.
 * Comment is required so the requester knows what to fix.
 */
export async function sendBackPr(id: string, ctx: ActorContext, comment?: string) {
  const pr = await getPrRaw(ctx.tenantId, id);
  if (!["pending_l1", "pending_l2", "escalated"].includes(pr.status)) {
    throw BadRequest("invalid_status", "This PR isn't waiting for approval");
  }
  if (pr.requesterId === ctx.userId && !ctx.isTenantAdmin) {
    throw Forbidden("self_send_back", "You cannot send back your own requisition");
  }
  if (!comment?.trim()) {
    throw BadRequest("comment_required", "Please tell the requester what to revise");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(purchaseRequisitions)
      .set({
        status: "draft",
        submittedAt: null,
        decidedAt: null,
        approvalChain: [],
        updatedAt: new Date(),
      })
      .where(eq(purchaseRequisitions.id, id));

    await tx.insert(approvalActions).values({
      tenantId: ctx.tenantId,
      resourceType: "pr",
      resourceId: id,
      actorUserId: ctx.userId,
      action: "request_changes",
      comment,
    });
  });

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "request_changes",
    resourceType: "pr",
    resourceId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

/**
 * Clone an existing PR into a new draft. Useful for recurring purchases —
 * same items, same vendor hints, same buyer assignments. The new PR gets a
 * fresh ID, no PR number until submitted, status=draft, and audit chain reset.
 */
export async function clonePr(id: string, ctx: ActorContext) {
  const source = await getPrRaw(ctx.tenantId, id);
  const sourceItems = await db.select().from(prItems).where(eq(prItems.prId, id)).orderBy(prItems.sortOrder);

  const [created] = await db
    .insert(purchaseRequisitions)
    .values({
      tenantId: ctx.tenantId,
      companyId: source.companyId,
      unitId: source.unitId,
      departmentId: source.departmentId,
      requesterId: ctx.userId,
      title: `${source.title} (Copy)`,
      description: source.description,
      prType: source.prType,
      referenceNo: source.referenceNo,
      buyerUserId: source.buyerUserId,
      priority: source.priority,
      status: "draft",
      estimatedTotalPaise: source.estimatedTotalPaise,
      neededBy: source.neededBy,
    })
    .returning();

  if (!created) throw new Error("Failed to clone PR");

  if (sourceItems.length) {
    await db.insert(prItems).values(
      sourceItems.map((it, idx) => ({
        prId: created.id,
        itemId: it.itemId,
        itemName: it.itemName,
        description: it.description,
        itemGroupName: it.itemGroupName,
        itemSubGroupName: it.itemSubGroupName,
        hsnCode: it.hsnCode,
        quantityScaled: it.quantityScaled,
        uom: it.uom,
        stockUnit: it.stockUnit,
        purchaseUnit: it.purchaseUnit,
        estimatedUnitPricePaise: it.estimatedUnitPricePaise,
        estimatedTotalPaise: it.estimatedTotalPaise,
        lastPurchaseRatePaise: it.lastPurchaseRatePaise,
        lastPurchaseDate: it.lastPurchaseDate,
        expectedDeliveryDate: it.expectedDeliveryDate,
        itemNarration: it.itemNarration,
        notes: it.notes,
        lineBuyerUserId: it.lineBuyerUserId,
        specifications: (it.specifications as Record<string, unknown>) ?? {},
        sortOrder: idx,
      })),
    );
  }

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "clone",
    resourceType: "pr",
    resourceId: created.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    before: { sourceId: id } as Record<string, unknown>,
  });

  return created;
}

export async function rejectPr(id: string, ctx: ActorContext, comment?: string) {
  const pr = await getPrRaw(ctx.tenantId, id);
  if (!["pending_l1", "pending_l2", "escalated"].includes(pr.status)) {
    throw BadRequest("invalid_status", "This PR isn't waiting for approval");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(purchaseRequisitions)
      .set({
        status: "rejected",
        decidedAt: new Date(),
        approvalChain: [{ level: 1, roleKey: "approver", status: "rejected" }],
        updatedAt: new Date(),
      })
      .where(eq(purchaseRequisitions.id, id));

    await tx.insert(approvalActions).values({
      tenantId: ctx.tenantId,
      resourceType: "pr",
      resourceId: id,
      actorUserId: ctx.userId,
      action: "reject",
      level: 1,
      comment: comment ?? null,
    });
  });

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "reject",
    resourceType: "pr",
    resourceId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

export async function cancelPr(id: string, ctx: ActorContext, comment?: string) {
  const pr = await getPrRaw(ctx.tenantId, id);
  if (["approved", "rejected", "cancelled", "converted_to_po"].includes(pr.status)) {
    throw BadRequest("invalid_status", "This PR is already finalized");
  }
  if (pr.requesterId !== ctx.userId && !ctx.isTenantAdmin) {
    throw Forbidden("not_owner", "Only the requester or tenant admin can cancel");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(purchaseRequisitions)
      .set({ status: "cancelled", decidedAt: new Date(), updatedAt: new Date() })
      .where(eq(purchaseRequisitions.id, id));

    await tx.insert(approvalActions).values({
      tenantId: ctx.tenantId,
      resourceType: "pr",
      resourceId: id,
      actorUserId: ctx.userId,
      action: "cancel",
      comment: comment ?? null,
    });
  });

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "cancel",
    resourceType: "pr",
    resourceId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

async function getPrRaw(tenantId: string, id: string) {
  const [pr] = await db
    .select()
    .from(purchaseRequisitions)
    .where(and(eq(purchaseRequisitions.id, id), eq(purchaseRequisitions.tenantId, tenantId), isNull(purchaseRequisitions.deletedAt)))
    .limit(1);
  if (!pr) throw NotFound("pr_not_found", "Requisition not found");
  return pr;
}
