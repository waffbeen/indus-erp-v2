"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon } from "@/components/Icon";
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

interface Stats {
  prRaisedToday: number;
  pendingPrCount: number;
  pendingPoCount: number;
  openPosCount: number;
  overduePosCount: number;
  monthlySpendPaise: string;
  activeVendorsCount: number;
  avgApprovalDays: number | null;
  recentPending: RecentPending[];
}

export default function DashboardPage() {
  const { me } = useAuth();
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const firstName = me?.fullName.split(" ")[0] ?? "there";

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

  useEffect(() => {
    load();
  }, []);

  const totalPending = (stats?.pendingPrCount ?? 0) + (stats?.pendingPoCount ?? 0);

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="display text-3xl">{greeting()}, {firstName}</h1>
          <p className="text-sm text-muted mt-1">
            {totalPending > 0
              ? `${totalPending} item${totalPending === 1 ? "" : "s"} waiting on your decision.`
              : "All caught up — nothing pending today."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost" onClick={load}>
            <Icon name="RefreshCw" /> Refresh
          </button>
          <Link href={`/t/${slug}/pr/new`} className="btn btn-primary btn-lg">
            <Icon name="Plus" /> New Requisition
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg p-3 bg-danger-bg text-danger-fg text-sm flex items-start gap-2">
          <Icon name="AlertTriangle" size={16} />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {/* Row 1: hero card (2/3) + popularity (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">

        {/* HERO — PRs today */}
        <div className="gradient-teal relative overflow-hidden rounded-2xl p-7">
          <div className="relative z-10 max-w-[55%]">
            <p className="text-sm font-medium text-on-dark/95">PRs raised today</p>
            <p className="display text-on-dark mt-1" style={{ fontSize: 88, lineHeight: 1 }}>
              {loading ? "—" : stats?.prRaisedToday ?? 0}
            </p>

            <div className="mt-7 space-y-3 max-w-xs">
              <div className="flex items-center gap-3 backdrop-blur-sm rounded-2xl px-3.5 py-2.5" style={{ background: "rgba(255,255,255,0.28)" }}>
                <div className="h-8 w-8 rounded-xl grid place-items-center text-on-dark" style={{ background: "rgba(255,255,255,0.4)" }}><Icon name="Inbox" /></div>
                <div>
                  <p className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.9)" }}>Pending approvals</p>
                  <p className="text-base text-on-dark font-semibold leading-tight">{totalPending}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 backdrop-blur-sm rounded-2xl px-3.5 py-2.5" style={{ background: "rgba(255,255,255,0.28)" }}>
                <div className="h-8 w-8 rounded-xl grid place-items-center text-on-dark" style={{ background: "rgba(255,255,255,0.4)" }}><Icon name="TrendingUp" /></div>
                <div>
                  <p className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.9)" }}>Avg approval time</p>
                  <p className="text-base text-on-dark font-semibold leading-tight">
                    {stats?.avgApprovalDays !== null && stats?.avgApprovalDays !== undefined
                      ? `${stats.avgApprovalDays} days`
                      : "—"}
                  </p>
                </div>
              </div>
            </div>

            <Link href={`/t/${slug}/approvals`} className="btn btn-primary mt-7">
              Review approvals <Icon name="ArrowRight" />
            </Link>
          </div>

          {/* Illustration */}
          <svg viewBox="0 0 280 320" className="absolute right-2 bottom-0 w-[42%] h-full pointer-events-none">
            <ellipse cx="60" cy="295" rx="22" ry="4" fill="#7E9B97" opacity="0.4" />
            <path d="M60 295 L60 240" stroke="#4A6661" strokeWidth="2.5" />
            <ellipse cx="55" cy="245" rx="11" ry="20" fill="#4A6661" />
            <ellipse cx="65" cy="252" rx="10" ry="18" fill="#5C7C76" />
            <rect x="120" y="200" width="100" height="14" rx="4" fill="#E8C5A8" />
            <rect x="125" y="214" width="6" height="60" fill="#C9A887" />
            <rect x="209" y="214" width="6" height="60" fill="#C9A887" />
            <rect x="220" y="120" width="14" height="100" rx="6" fill="#F4D7C2" />
            <circle cx="160" cy="120" r="20" fill="#F2D3B3" />
            <path d="M148 110 Q160 95 172 110" stroke="#3D2817" strokeWidth="3" fill="none" strokeLinecap="round" />
            <rect x="142" y="138" width="42" height="58" rx="6" fill="#D8946A" />
            <rect x="138" y="178" width="56" height="32" rx="3" fill="#2E4250" />
            <rect x="142" y="182" width="48" height="24" rx="2" fill="#5C7C8A" />
            <circle cx="210" cy="60" r="16" fill="none" stroke="white" strokeWidth="2.5" opacity="0.8" />
            <circle cx="215" cy="55" r="4" fill="white" opacity="0.9" />
          </svg>
        </div>

        {/* Pending approvals widget */}
        <div className="gradient-peach relative overflow-hidden rounded-2xl p-6">
          <p className="font-semibold" style={{ color: "var(--tint-peach-fg)" }}>
            Action needed
          </p>
          <div className="flex items-end gap-3 mt-2">
            <p className="display" style={{ color: "#3D2410", fontSize: 68, lineHeight: 1 }}>
              {loading ? "—" : totalPending}
            </p>
            {totalPending > 0 && (
              <span className="badge mb-2" style={{ background: "rgba(255,255,255,0.7)", color: "var(--tint-peach-fg)" }}>
                {stats?.pendingPrCount ?? 0} PR · {stats?.pendingPoCount ?? 0} PO
              </span>
            )}
          </div>
          <p className="mt-4 text-sm leading-relaxed" style={{ color: "rgba(92,59,30,0.85)" }}>
            {totalPending > 0
              ? <>You have items waiting. <strong style={{ color: "#3D2410" }}>Review them</strong> to keep procurement moving.</>
              : <>No items waiting on you right now. Inbox zero 🎉</>}
          </p>
          <Link
            href={`/t/${slug}/approvals`}
            className="mt-5 rounded-2xl p-3 flex items-center gap-3"
            style={{ background: "rgba(255,255,255,0.7)", backdropFilter: "blur(6px)" }}
          >
            <div className="h-9 w-9 rounded-xl grid place-items-center" style={{ background: "var(--accent-orange)", color: "var(--accent-orange-fg)" }}>
              <Icon name="Inbox" />
            </div>
            <p className="text-xs flex-1 leading-snug" style={{ color: "#3D2410" }}>Open approvals queue</p>
            <span className="h-9 w-9 rounded-full grid place-items-center" style={{ background: "var(--accent-orange)", color: "var(--accent-orange-fg)" }}>
              <Icon name="ArrowRight" />
            </span>
          </Link>
        </div>
      </div>

      {/* Row 2: 3 cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <KpiBlock
          title="Monthly Spend"
          icon="IndianRupee"
          value={loading ? "—" : paiseToCompactINR(stats?.monthlySpendPaise)}
          subtitle="Approved POs this month"
        />
        <KpiBlock
          title="Open POs"
          icon="ShoppingCart"
          value={loading ? "—" : String(stats?.openPosCount ?? 0)}
          subtitle={stats?.overduePosCount ? `${stats.overduePosCount} overdue` : "All on track"}
          subtitleTone={stats?.overduePosCount ? "warning" : "normal"}
        />
        <KpiBlock
          title="Active Vendors"
          icon="Users"
          value={loading ? "—" : String(stats?.activeVendorsCount ?? 0)}
          subtitle="Suppliers ready to receive POs"
        />
      </div>

      {/* Pending approvals table */}
      <div className="card">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h3 className="font-semibold">Pending Approvals</h3>
            <p className="text-xs text-muted">Top {stats?.recentPending.length ?? 0} requisitions awaiting your decision</p>
          </div>
          <Link href={`/t/${slug}/approvals`} className="text-xs font-semibold text-primary hover:underline">
            View all →
          </Link>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted">Loading…</div>
        ) : !stats?.recentPending.length ? (
          <div className="p-12 text-center">
            <div className="h-12 w-12 rounded-2xl mx-auto grid place-items-center bg-tint-mint text-tint-mint-fg mb-3">
              <Icon name="CheckCircle2" size={22} />
            </div>
            <h4 className="font-semibold mb-1">Inbox zero 🎉</h4>
            <p className="text-sm text-muted">No requisitions waiting for your approval.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">PR #</th>
                <th className="text-left px-5 py-3 font-semibold">Title</th>
                <th className="text-left px-5 py-3 font-semibold">Requester</th>
                <th className="text-left px-5 py-3 font-semibold">Amount</th>
                <th className="text-left px-5 py-3 font-semibold">Priority</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
                <th className="text-left px-5 py-3 font-semibold">Raised</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentPending.map((p) => (
                <tr
                  key={p.id}
                  className="border-t border-border hover:bg-surface/50 cursor-pointer select-none"
                  onClick={() => { window.location.href = `/t/${slug}/pr/${p.id}`; }}
                >
                  <td className="px-5 py-3 font-mono text-xs">{p.prNumber ?? "—"}</td>
                  <td className="px-5 py-3 font-semibold max-w-xs truncate">{p.title}</td>
                  <td className="px-5 py-3 text-muted">{p.requesterName}</td>
                  <td className="px-5 py-3 font-semibold tabular-nums">{paiseToINR(p.estimatedTotalPaise)}</td>
                  <td className="px-5 py-3"><PriorityBadge priority={p.priority} /></td>
                  <td className="px-5 py-3"><PrStatusBadge status={p.status} /></td>
                  <td className="px-5 py-3 text-xs text-muted">{timeAgo(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function KpiBlock({
  title,
  icon,
  value,
  subtitle,
  subtitleTone = "normal",
}: {
  title: string;
  icon: React.ComponentProps<typeof Icon>["name"];
  value: string;
  subtitle: string;
  subtitleTone?: "normal" | "warning";
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      <div className="card p-5 bg-surface">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl grid place-items-center bg-primary text-on-dark">
            <Icon name={icon} />
          </div>
          <div>
            <p className="text-2xl font-bold tracking-tight tabular-nums">{value}</p>
            <p className={`text-[11px] ${subtitleTone === "warning" ? "text-warning" : "text-muted"}`}>{subtitle}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
