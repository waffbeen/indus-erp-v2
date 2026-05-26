"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon, type IconProps } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { PrStatusBadge, PriorityBadge } from "@/components/StatusBadge";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { paiseToCompactINR, paiseToINR, timeAgo } from "@/lib/format";

interface RecentPending {
  id: string;
  prNumber: string | null;
  title: string;
  status: string;
  priority: string;
  estimatedTotalPaise: string;
  createdAt: string;
  requesterName: string;
}

interface MonthlyTrendEntry {
  month: string;     // "2026-05"
  prCount: number;
  poCount: number;
  poValuePaise: string;
}

interface TopVendor {
  vendorId: string;
  vendorName: string;
  poCount: number;
  totalPaise: string;
}

interface PrAgingBucket {
  bucket: "0-2" | "2-5" | "5+";
  count: number;
  valuePaise: string;
}

interface Stats {
  prRaisedToday: number;
  pendingPrCount: number;
  pendingPoCount: number;
  openPosCount: number;
  overduePosCount: number;
  monthlySpendPaise: string;
  activeVendorsCount: number;
  avgApprovalDays: number | null;
  grnMonthCount: number;
  grnMonthValuePaise: string;
  monthlyTrend: MonthlyTrendEntry[];
  topVendors: TopVendor[];
  prAgingBuckets: PrAgingBucket[];
  recentPending: RecentPending[];
}

const AGING_LABEL: Record<PrAgingBucket["bucket"], string> = {
  "0-2": "0–2 days",
  "2-5": "2–5 days",
  "5+":  "5+ days",
};

const AGING_TONE: Record<PrAgingBucket["bucket"], string> = {
  "0-2": "badge-tint-mint",
  "2-5": "badge-tint-peach",
  "5+":  "badge-danger",
};

export default function DashboardPage() {
  const { me } = useAuth();
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";

  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api<Stats>("/api/dashboard/stats");
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const totalPending = (stats?.pendingPrCount ?? 0) + (stats?.pendingPoCount ?? 0);

  // Max value across the 6-month trend, used to scale bar heights
  const maxPoValue = Math.max(
    1,
    ...((stats?.monthlyTrend ?? []).map((m) => Number(m.poValuePaise))),
  );
  // Max total for vendor bars
  const maxVendor = Math.max(
    1,
    ...((stats?.topVendors ?? []).map((v) => Number(v.totalPaise))),
  );

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${me?.fullName.split(" ")[0] ?? "there"}`}
        subtitle={
          totalPending > 0
            ? `${totalPending} item${totalPending === 1 ? "" : "s"} waiting on your decision`
            : "All caught up — nothing pending today"
        }
        actions={
          <>
            <button className="btn btn-ghost btn-sm" onClick={load}>
              <Icon name="RefreshCw" size={14} /> Refresh
            </button>
            <Link href={`/t/${slug}/pr/new`} className="btn btn-primary btn-sm">
              <Icon name="Plus" size={14} /> New PR
            </Link>
          </>
        }
      />

      {error && (
        <div className="mb-3 rounded p-2.5 bg-danger-bg text-danger-fg text-xs flex items-start gap-2">
          <Icon name="AlertTriangle" size={14} />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {/* KPI tiles — 8-wide grid like a real ERP */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-4">
        <KpiTile
          label="PR Today"
          value={loading ? "—" : String(stats?.prRaisedToday ?? 0)}
          icon="FileText"
          href={`/t/${slug}/pr`}
        />
        <KpiTile
          label="PR Pending"
          value={loading ? "—" : String(stats?.pendingPrCount ?? 0)}
          icon="Inbox"
          href={`/t/${slug}/approvals`}
          tone={stats?.pendingPrCount ? "warning" : undefined}
        />
        <KpiTile
          label="PO Pending"
          value={loading ? "—" : String(stats?.pendingPoCount ?? 0)}
          icon="ShoppingCart"
          href={`/t/${slug}/approvals`}
          tone={stats?.pendingPoCount ? "warning" : undefined}
        />
        <KpiTile
          label="Open POs"
          value={loading ? "—" : String(stats?.openPosCount ?? 0)}
          icon="Package"
          href={`/t/${slug}/po`}
          sub={stats?.overduePosCount ? `${stats.overduePosCount} overdue` : undefined}
          tone={stats?.overduePosCount ? "danger" : undefined}
        />
        <KpiTile
          label="GRN MTD"
          value={loading ? "—" : String(stats?.grnMonthCount ?? 0)}
          icon="PackageCheck"
          href={`/t/${slug}/grn`}
          sub={loading ? "" : paiseToCompactINR(stats?.grnMonthValuePaise)}
        />
        <KpiTile
          label="Spend MTD"
          value={loading ? "—" : paiseToCompactINR(stats?.monthlySpendPaise)}
          icon="IndianRupee"
        />
        <KpiTile
          label="Vendors"
          value={loading ? "—" : String(stats?.activeVendorsCount ?? 0)}
          icon="Users"
          href={`/t/${slug}/vendors`}
        />
        <KpiTile
          label="Avg approval"
          value={
            loading
              ? "—"
              : stats?.avgApprovalDays != null
                ? `${stats.avgApprovalDays}d`
                : "—"
          }
          icon="Clock"
          sub="last 90d"
        />
      </div>

      {/* Row: Monthly trend + PR aging + Top vendors */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr] gap-3 mb-4">
        {/* Monthly trend bars */}
        <div className="card p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-text-default">
              <span className="inline-block h-3 w-0.5 mr-1.5 align-middle" style={{ background: "var(--primary)" }} />
              Monthly trend · last 6 months
            </h3>
            <span className="text-[10px] text-muted">PO value</span>
          </div>
          {loading ? (
            <div className="h-32 grid place-items-center text-xs text-muted">Loading…</div>
          ) : (
            <div className="h-32 flex items-end gap-2 px-1">
              {(stats?.monthlyTrend ?? []).map((m, idx) => {
                const v = Number(m.poValuePaise);
                const heightPct = (v / maxPoValue) * 100;
                const isLast = idx === (stats?.monthlyTrend.length ?? 1) - 1;
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <div className="text-[10px] tabular-nums leading-none mb-0.5" style={{ color: "var(--muted)" }}>
                      {v > 0 ? paiseToCompactINR(m.poValuePaise) : ""}
                    </div>
                    <div className="w-full bg-surface rounded-sm relative flex-1 flex flex-col justify-end overflow-hidden" style={{ minHeight: 4 }}>
                      <div
                        className="w-full rounded-sm transition-all"
                        style={{
                          height: `${Math.max(heightPct, v > 0 ? 4 : 0)}%`,
                          background: isLast ? "var(--primary)" : "var(--tint-teal)",
                        }}
                        title={`${m.poCount} POs · ${paiseToINR(m.poValuePaise)}`}
                      />
                    </div>
                    <div className="text-[10px] text-muted">{monthLabel(m.month)}</div>
                    <div className="text-[10px] text-text-default font-medium tabular-nums">{m.poCount}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* PR Aging */}
        <div className="card p-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-text-default mb-2">
            <span className="inline-block h-3 w-0.5 mr-1.5 align-middle" style={{ background: "var(--primary)" }} />
            PR aging
          </h3>
          <p className="text-[10px] text-muted mb-2">Time pending approvers have been holding</p>
          {loading ? (
            <div className="h-24 grid place-items-center text-xs text-muted">Loading…</div>
          ) : (stats?.prAgingBuckets ?? []).every((b) => b.count === 0) ? (
            <div className="h-24 grid place-items-center text-xs text-muted text-center">
              No pending PRs — inbox zero 🎉
            </div>
          ) : (
            <div className="space-y-1.5">
              {(stats?.prAgingBuckets ?? []).map((b) => (
                <div key={b.bucket} className="flex items-center justify-between gap-2">
                  <span className={`badge ${AGING_TONE[b.bucket]} text-[10px]`}>{AGING_LABEL[b.bucket]}</span>
                  <div className="flex items-baseline gap-2 tabular-nums">
                    <span className="text-sm font-bold">{b.count}</span>
                    <span className="text-[10px] text-muted">{paiseToCompactINR(b.valuePaise)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top vendors */}
        <div className="card p-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-text-default mb-2">
            <span className="inline-block h-3 w-0.5 mr-1.5 align-middle" style={{ background: "var(--primary)" }} />
            Top vendors
          </h3>
          {loading ? (
            <div className="h-24 grid place-items-center text-xs text-muted">Loading…</div>
          ) : (stats?.topVendors ?? []).length === 0 ? (
            <div className="h-24 grid place-items-center text-xs text-muted">No PO data yet</div>
          ) : (
            <div className="space-y-1.5">
              {(stats?.topVendors ?? []).slice(0, 5).map((v) => {
                const widthPct = (Number(v.totalPaise) / maxVendor) * 100;
                return (
                  <div key={v.vendorId} className="text-[11px]">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium truncate">{v.vendorName}</span>
                      <span className="tabular-nums text-text-default font-semibold whitespace-nowrap">
                        {paiseToCompactINR(v.totalPaise)}
                      </span>
                    </div>
                    <div className="h-1 w-full bg-surface rounded-sm mt-0.5 overflow-hidden">
                      <div className="h-full rounded-sm" style={{ width: `${widthPct}%`, background: "var(--primary)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Pending approvals table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-text-default">
            <span className="inline-block h-3 w-0.5 mr-1.5 align-middle" style={{ background: "var(--primary)" }} />
            Pending approvals
            <span className="ml-2 text-muted font-normal normal-case tracking-normal">
              {stats?.recentPending.length ?? 0} most recent
            </span>
          </h3>
          <Link href={`/t/${slug}/approvals`} className="text-[11px] font-semibold text-primary hover:underline">
            View all →
          </Link>
        </div>
        {loading ? (
          <div className="p-6 text-center text-xs text-muted">Loading…</div>
        ) : !stats?.recentPending.length ? (
          <div className="p-8 text-center">
            <Icon name="CheckCircle2" size={20} className="mx-auto mb-1.5 text-muted" />
            <p className="text-xs text-muted">No requisitions waiting for approval.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">PR #</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Title</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Requester</th>
                <th className="text-right px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Amount</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Priority</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Status</th>
                <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted">Raised</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentPending.map((p) => (
                <tr
                  key={p.id}
                  className="border-t border-border hover:bg-surface/60 cursor-pointer select-none"
                  onClick={() => { window.location.href = `/t/${slug}/pr/${p.id}`; }}
                >
                  <td className="px-3 py-1.5 font-mono text-[11px]">{p.prNumber ?? "—"}</td>
                  <td className="px-3 py-1.5 font-medium max-w-xs truncate">{p.title}</td>
                  <td className="px-3 py-1.5 text-muted">{p.requesterName}</td>
                  <td className="px-3 py-1.5 font-semibold tabular-nums text-right">{paiseToINR(p.estimatedTotalPaise)}</td>
                  <td className="px-3 py-1.5"><PriorityBadge priority={p.priority} /></td>
                  <td className="px-3 py-1.5"><PrStatusBadge status={p.status} /></td>
                  <td className="px-3 py-1.5 text-[11px] text-muted">{timeAgo(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function monthLabel(month: string): string {
  // "2026-05" -> "May"
  const [, m] = month.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return names[Number(m) - 1] ?? month;
}

function KpiTile({
  label,
  value,
  icon,
  sub,
  href,
  tone,
}: {
  label: string;
  value: string;
  icon: IconProps["name"];
  sub?: string;
  href?: string;
  tone?: "warning" | "danger";
}) {
  const toneClass =
    tone === "danger" ? "text-danger-fg" : tone === "warning" ? "text-warning-fg" : "text-muted";
  const content = (
    <div className="card p-2.5 h-full flex flex-col gap-1 transition hover:border-primary/40">
      <div className="flex items-center gap-1.5 text-muted">
        <Icon name={icon} size={12} />
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-base font-bold tabular-nums leading-tight">{value}</div>
      {sub && <div className={`text-[10px] tabular-nums ${toneClass}`}>{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
