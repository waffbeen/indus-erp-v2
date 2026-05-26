import { eq, and, isNull, sql, inArray, desc } from "drizzle-orm";
import { db } from "../db/index";
import { purchaseRequisitions } from "../db/schema/pr";
import { purchaseOrders, poItems } from "../db/schema/po";
import { grns, grnItems } from "../db/schema/grns";
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

  // Extra dashboard data — only counted from finalized + recent records so
  // the queries stay cheap. All run in parallel to the headline metrics.
  const [grnMtdStats, monthlyTrend, topVendors, prAging] = await Promise.all([
    db.execute<{ grn_count: number; received_value: string }>(
      sql`SELECT
            COUNT(*)::int AS grn_count,
            COALESCE(SUM(invoice_amount_paise::bigint), 0)::text AS received_value
          FROM grns
          WHERE tenant_id = ${tenantId}
            AND deleted_at IS NULL
            AND status <> 'cancelled'
            AND received_date >= ${monthStart}`,
    ),

    // Last 6 calendar months: PR count, PO count, PO value
    db.execute<{ month: string; pr_count: number; po_count: number; po_value: string }>(
      sql`WITH months AS (
            SELECT date_trunc('month', NOW()) - (n || ' month')::interval AS m
            FROM generate_series(0, 5) n
          )
          SELECT to_char(months.m, 'YYYY-MM') AS month,
                 COALESCE((SELECT COUNT(*) FROM purchase_requisitions
                           WHERE tenant_id = ${tenantId}
                             AND deleted_at IS NULL
                             AND created_at >= months.m
                             AND created_at <  months.m + interval '1 month'), 0)::int AS pr_count,
                 COALESCE((SELECT COUNT(*) FROM purchase_orders
                           WHERE tenant_id = ${tenantId}
                             AND deleted_at IS NULL
                             AND status IN ('approved','sent_to_vendor','partially_received','received','closed')
                             AND created_at >= months.m
                             AND created_at <  months.m + interval '1 month'), 0)::int AS po_count,
                 COALESCE((SELECT SUM(total_paise::bigint) FROM purchase_orders
                           WHERE tenant_id = ${tenantId}
                             AND deleted_at IS NULL
                             AND status IN ('approved','sent_to_vendor','partially_received','received','closed')
                             AND created_at >= months.m
                             AND created_at <  months.m + interval '1 month'), 0)::text AS po_value
          FROM months
          ORDER BY months.m ASC`,
    ),

    // Top 5 vendors by PO value (active + recent)
    db
      .select({
        vendorId: purchaseOrders.vendorId,
        vendorName: vendors.name,
        poCount: sql<number>`count(${purchaseOrders.id})::int`.as("po_count"),
        totalPaise: sql<string>`COALESCE(SUM(${purchaseOrders.totalPaise}::bigint), 0)::text`.as("total_paise"),
      })
      .from(purchaseOrders)
      .leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
      .where(
        and(
          eq(purchaseOrders.tenantId, tenantId),
          isNull(purchaseOrders.deletedAt),
          inArray(purchaseOrders.status, ["approved", "sent_to_vendor", "partially_received", "received", "closed"]),
        ),
      )
      .groupBy(purchaseOrders.vendorId, vendors.name)
      .orderBy(sql`SUM(${purchaseOrders.totalPaise}::bigint) DESC`)
      .limit(5),

    // PR aging buckets — how long pending PRs have been waiting
    db.execute<{
      bucket: string; count: number; value_paise: string;
    }>(
      sql`SELECT
            CASE
              WHEN NOW() - submitted_at < interval '2 days' THEN '0-2'
              WHEN NOW() - submitted_at < interval '5 days' THEN '2-5'
              ELSE '5+'
            END AS bucket,
            COUNT(*)::int AS count,
            COALESCE(SUM(estimated_total_paise::bigint), 0)::text AS value_paise
          FROM purchase_requisitions
          WHERE tenant_id = ${tenantId}
            AND deleted_at IS NULL
            AND status IN ('pending_l1','pending_l2','escalated')
            AND submitted_at IS NOT NULL
          GROUP BY bucket`,
    ),
  ]);

  // Normalise PR aging into a stable shape (all three buckets always present)
  const agingMap = new Map(prAging.rows.map((r) => [r.bucket, r]));
  const prAgingBuckets = (["0-2", "2-5", "5+"] as const).map((b) => ({
    bucket: b,
    count: agingMap.get(b)?.count ?? 0,
    valuePaise: agingMap.get(b)?.value_paise ?? "0",
  }));

  return {
    prRaisedToday: prToday[0]?.count ?? 0,
    pendingPrCount: pendingPrCount[0]?.count ?? 0,
    pendingPoCount: pendingPoCount[0]?.count ?? 0,
    openPosCount: openPoStats.rows[0]?.open_count ?? 0,
    overduePosCount: openPoStats.rows[0]?.overdue_count ?? 0,
    monthlySpendPaise: monthlySpend.rows[0]?.total ?? "0",
    activeVendorsCount: vendorCount[0]?.count ?? 0,
    avgApprovalDays: avgDays !== null && avgDays !== undefined ? Number(avgDays.toFixed(1)) : null,
    grnMonthCount: grnMtdStats.rows[0]?.grn_count ?? 0,
    grnMonthValuePaise: grnMtdStats.rows[0]?.received_value ?? "0",
    monthlyTrend: monthlyTrend.rows.map((r) => ({
      month: r.month,
      prCount: r.pr_count,
      poCount: r.po_count,
      poValuePaise: r.po_value,
    })),
    topVendors: topVendors.map((v) => ({
      vendorId: v.vendorId,
      vendorName: v.vendorName ?? "—",
      poCount: v.poCount,
      totalPaise: v.totalPaise,
    })),
    prAgingBuckets,
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

/**
 * Item-wise spend report — top items by purchased value (paise) and qty.
 * Joins po_items + purchase_orders to filter by tenant + finalised status.
 */
export async function getTopItemsReport(tenantId: string, limit = 25) {
  const rows = await db
    .select({
      itemName: poItems.itemName,
      itemGroupName: poItems.itemGroupName,
      hsnCode: poItems.hsnCode,
      uom: poItems.uom,
      qtyScaled: sql<number>`SUM(${poItems.quantityScaled})::bigint`.as("qty_scaled"),
      totalPaise: sql<string>`SUM(${poItems.totalPaise}::bigint)::text`.as("total_paise"),
      lineCount: sql<number>`COUNT(*)::int`.as("line_count"),
    })
    .from(poItems)
    .innerJoin(purchaseOrders, eq(poItems.poId, purchaseOrders.id))
    .where(
      and(
        eq(purchaseOrders.tenantId, tenantId),
        isNull(purchaseOrders.deletedAt),
        inArray(purchaseOrders.status, ["approved", "sent_to_vendor", "partially_received", "received", "closed"]),
      ),
    )
    .groupBy(poItems.itemName, poItems.itemGroupName, poItems.hsnCode, poItems.uom)
    .orderBy(sql`SUM(${poItems.totalPaise}::bigint) DESC`)
    .limit(limit);
  return rows.map((r) => ({
    itemName: r.itemName,
    itemGroupName: r.itemGroupName,
    hsnCode: r.hsnCode,
    uom: r.uom,
    qty: Number(r.qtyScaled) / 1000,
    totalPaise: r.totalPaise,
    lineCount: r.lineCount,
  }));
}

/**
 * Detailed PR aging — every pending PR with how long it's been waiting.
 */
export async function getPrAgingReport(tenantId: string) {
  const rows = await db.execute<{
    id: string;
    pr_number: string | null;
    title: string;
    status: string;
    priority: string;
    requester_name: string | null;
    estimated_total_paise: string;
    submitted_at: Date | null;
    days_pending: number;
  }>(
    sql`SELECT pr.id,
               pr.pr_number,
               pr.title,
               pr.status,
               pr.priority,
               u.full_name AS requester_name,
               pr.estimated_total_paise,
               pr.submitted_at,
               EXTRACT(EPOCH FROM (NOW() - pr.submitted_at)) / 86400 AS days_pending
        FROM purchase_requisitions pr
        LEFT JOIN users u ON u.id = pr.requester_id
        WHERE pr.tenant_id = ${tenantId}
          AND pr.deleted_at IS NULL
          AND pr.status IN ('pending_l1','pending_l2','escalated')
          AND pr.submitted_at IS NOT NULL
        ORDER BY pr.submitted_at ASC`,
  );
  return rows.rows.map((r) => ({
    id: r.id,
    prNumber: r.pr_number,
    title: r.title,
    status: r.status,
    priority: r.priority,
    requesterName: r.requester_name ?? "Unknown",
    estimatedTotalPaise: r.estimated_total_paise,
    submittedAt: r.submitted_at ? new Date(r.submitted_at).toISOString() : null,
    daysPending: Number(r.days_pending ?? 0),
  }));
}

/**
 * Vendor performance — for each vendor, summary of POs and GRNs (received vs ordered).
 */
export async function getVendorSpendReport(tenantId: string) {
  const rows = await db
    .select({
      vendorId: purchaseOrders.vendorId,
      vendorName: vendors.name,
      vendorCode: vendors.code,
      gstin: vendors.gstin,
      poCount: sql<number>`count(${purchaseOrders.id})::int`.as("po_count"),
      totalPaise: sql<string>`COALESCE(SUM(${purchaseOrders.totalPaise}::bigint), 0)::text`.as("total_paise"),
      openCount: sql<number>`SUM(CASE WHEN ${purchaseOrders.status} IN ('approved','sent_to_vendor','partially_received') THEN 1 ELSE 0 END)::int`.as("open_count"),
      closedCount: sql<number>`SUM(CASE WHEN ${purchaseOrders.status} IN ('received','closed') THEN 1 ELSE 0 END)::int`.as("closed_count"),
    })
    .from(purchaseOrders)
    .leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
    .where(
      and(
        eq(purchaseOrders.tenantId, tenantId),
        isNull(purchaseOrders.deletedAt),
        inArray(purchaseOrders.status, ["approved", "sent_to_vendor", "partially_received", "received", "closed"]),
      ),
    )
    .groupBy(purchaseOrders.vendorId, vendors.name, vendors.code, vendors.gstin)
    .orderBy(sql`SUM(${purchaseOrders.totalPaise}::bigint) DESC`);

  return rows.map((r) => ({
    vendorId: r.vendorId,
    vendorName: r.vendorName ?? "—",
    vendorCode: r.vendorCode,
    gstin: r.gstin,
    poCount: r.poCount,
    totalPaise: r.totalPaise,
    openCount: r.openCount,
    closedCount: r.closedCount,
  }));
}
