import { eq, and, isNull, sql, inArray, desc } from "drizzle-orm";
import { db } from "../db/index";
import { purchaseRequisitions } from "../db/schema/pr";
import { purchaseOrders } from "../db/schema/po";
import { vendors } from "../db/schema/vendors";
import { users } from "../db/schema/users";

/**
 * Aggregate metrics for the dashboard home page. Single endpoint so the FE
 * makes one round-trip on landing.
 */
export async function getDashboardStats(tenantId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Run in parallel
  const [
    prToday,
    pendingPrCount,
    pendingPoCount,
    openPoStats,
    monthlySpend,
    vendorCount,
    avgApproval,
    recentPending,
  ] = await Promise.all([
    // PRs raised today
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(purchaseRequisitions)
      .where(
        and(
          eq(purchaseRequisitions.tenantId, tenantId),
          isNull(purchaseRequisitions.deletedAt),
          sql`${purchaseRequisitions.createdAt} >= ${todayStart}`,
        ),
      ),

    // PRs pending approval
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(purchaseRequisitions)
      .where(
        and(
          eq(purchaseRequisitions.tenantId, tenantId),
          isNull(purchaseRequisitions.deletedAt),
          inArray(purchaseRequisitions.status, ["pending_l1", "pending_l2", "escalated"]),
        ),
      ),

    // POs pending approval
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.tenantId, tenantId),
          isNull(purchaseOrders.deletedAt),
          eq(purchaseOrders.status, "pending_approval"),
        ),
      ),

    // Open POs (approved + sent + partial) and overdue (delivery date past, not fully received)
    db.execute<{ open_count: number; overdue_count: number }>(
      sql`SELECT
            COUNT(*) FILTER (
              WHERE status IN ('approved','sent_to_vendor','partially_received')
            )::int AS open_count,
            COUNT(*) FILTER (
              WHERE status IN ('approved','sent_to_vendor','partially_received')
                AND delivery_date IS NOT NULL
                AND delivery_date < NOW()
            )::int AS overdue_count
          FROM purchase_orders
          WHERE tenant_id = ${tenantId} AND deleted_at IS NULL`,
    ),

    // Monthly spend (approved PO totals this month, in paise)
    db.execute<{ total: string }>(
      sql`SELECT COALESCE(SUM(total_paise::bigint), 0)::text AS total
          FROM purchase_orders
          WHERE tenant_id = ${tenantId}
            AND deleted_at IS NULL
            AND status IN ('approved','sent_to_vendor','partially_received','received','closed')
            AND created_at >= ${monthStart}`,
    ),

    // Active vendor count
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(vendors)
      .where(and(eq(vendors.tenantId, tenantId), isNull(vendors.deletedAt), eq(vendors.isActive, true))),

    // Avg approval time (days) for decided PRs in last 90 days
    db.execute<{ avg_days: number | null }>(
      sql`SELECT AVG(EXTRACT(EPOCH FROM (decided_at - submitted_at)) / 86400)::float AS avg_days
          FROM purchase_requisitions
          WHERE tenant_id = ${tenantId}
            AND deleted_at IS NULL
            AND submitted_at IS NOT NULL
            AND decided_at IS NOT NULL
            AND submitted_at >= NOW() - INTERVAL '90 days'`,
    ),

    // 5 most recent pending PRs (for the "Pending Approvals" widget)
    db
      .select({
        id: purchaseRequisitions.id,
        prNumber: purchaseRequisitions.prNumber,
        title: purchaseRequisitions.title,
        status: purchaseRequisitions.status,
        priority: purchaseRequisitions.priority,
        estimatedTotalPaise: purchaseRequisitions.estimatedTotalPaise,
        createdAt: purchaseRequisitions.createdAt,
        requesterName: users.fullName,
      })
      .from(purchaseRequisitions)
      .leftJoin(users, eq(purchaseRequisitions.requesterId, users.id))
      .where(
        and(
          eq(purchaseRequisitions.tenantId, tenantId),
          isNull(purchaseRequisitions.deletedAt),
          inArray(purchaseRequisitions.status, ["pending_l1", "pending_l2", "escalated"]),
        ),
      )
      .orderBy(desc(purchaseRequisitions.submittedAt))
      .limit(5),
  ]);

  const avgDays = avgApproval.rows[0]?.avg_days;

  return {
    prRaisedToday: prToday[0]?.count ?? 0,
    pendingPrCount: pendingPrCount[0]?.count ?? 0,
    pendingPoCount: pendingPoCount[0]?.count ?? 0,
    openPosCount: openPoStats.rows[0]?.open_count ?? 0,
    overduePosCount: openPoStats.rows[0]?.overdue_count ?? 0,
    monthlySpendPaise: monthlySpend.rows[0]?.total ?? "0",
    activeVendorsCount: vendorCount[0]?.count ?? 0,
    avgApprovalDays: avgDays !== null && avgDays !== undefined ? Number(avgDays.toFixed(1)) : null,
    recentPending: recentPending.map((r) => ({
      id: r.id,
      prNumber: r.prNumber,
      title: r.title,
      status: r.status,
      priority: r.priority,
      estimatedTotalPaise: r.estimatedTotalPaise,
      createdAt: r.createdAt.toISOString(),
      requesterName: r.requesterName ?? "Unknown",
    })),
  };
}
