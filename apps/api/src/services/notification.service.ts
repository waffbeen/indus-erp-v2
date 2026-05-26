import { eq, and, desc, isNull, sql, inArray } from "drizzle-orm";
import { db } from "../db/index";
import { notifications } from "../db/schema/notifications";
import { memberships } from "../db/schema/memberships";

/**
 * Fan out a notification to one or more users in a tenant. Caller decides who
 * gets notified — typically all tenant admins for approvals, or a specific
 * user (requester / creator).
 */
export async function notifyUsers(input: {
  tenantId: string;
  userIds: string[];
  kind: string;
  title: string;
  body?: string;
  resourceType?: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (input.userIds.length === 0) return;
  const dedup = Array.from(new Set(input.userIds));
  await db.insert(notifications).values(
    dedup.map((uid) => ({
      tenantId: input.tenantId,
      userId: uid,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      metadata: input.metadata ?? {},
    })),
  );
}

/**
 * Convenience: fan out to every active tenant admin (used when the actor
 * doesn't know who specifically approves).
 */
export async function notifyTenantAdmins(input: {
  tenantId: string;
  excludeUserId?: string;
  kind: string;
  title: string;
  body?: string;
  resourceType?: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const admins = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.tenantId, input.tenantId),
        eq(memberships.isTenantAdmin, true),
        eq(memberships.status, "active"),
        isNull(memberships.deletedAt),
      ),
    );
  const userIds = admins
    .map((a) => a.userId)
    .filter((id) => id !== input.excludeUserId);
  await notifyUsers({ ...input, userIds });
}

interface ListOpts { onlyUnread?: boolean; limit?: number; }

export async function listNotifications(tenantId: string, userId: string, opts: ListOpts = {}) {
  const conds = [eq(notifications.tenantId, tenantId), eq(notifications.userId, userId)];
  if (opts.onlyUnread) conds.push(isNull(notifications.readAt));
  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conds))
    .orderBy(desc(notifications.createdAt))
    .limit(opts.limit ?? 30);
  return rows.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    resourceType: n.resourceType,
    resourceId: n.resourceId,
    metadata: n.metadata,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  }));
}

export async function unreadCount(tenantId: string, userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.tenantId, tenantId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
      ),
    );
  return row?.count ?? 0;
}

export async function markRead(tenantId: string, userId: string, ids?: string[]) {
  if (ids && ids.length === 0) return;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.tenantId, tenantId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        ...(ids ? [inArray(notifications.id, ids)] : []),
      ),
    );
}
