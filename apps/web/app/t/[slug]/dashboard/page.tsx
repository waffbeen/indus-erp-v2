"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon, type IconProps } from "@/components/Icon";
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
  month: string;
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

const AGING_TONE: Record<PrAgingBucket["bucket"], { bg: string; fg: string; dot: string }> = {
  "0-2": { bg: "var(--tint-mint)",  fg: "var(--tint-mint-fg)",  dot: "var(--success)" },
  "2-5": { bg: "var(--tint-peach)", fg: "var(--tint-peach-fg)", dot: "var(--warning)" },
  "5+":  { bg: "var(--tint-blush)", fg: "var(--tint-blush-fg)", dot: "var(--danger)"  },
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

  const maxPoValue = Math.max(
    1,
    ...((stats?.monthlyTrend ?? []).map((m) => Number(m.poValuePaise))),
  );
  const maxVendor = Math.max(
    1,
    ...((stats?.topVendors ?? []).map((v) => Number(v.totalPaise))),
  );

  const firstName = me?.fullName.split(" ")[0] ?? "there";

  return (
    <>
      {/* HERO: greeting + quick stats line + refresh */}
      <div className="rounded-lg overflow-hidden mb-4 relative" style={{ background: "linear-gradient(135deg, #2F5C68 0%, #244750 100%)" }}>
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: "radial-gradient(circle at 90% 0%, rgba(244, 215, 194, 0.45) 0%, transparent 40%)",
        }} />
        <div className="relative px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-on-dark">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider opacity-70">
              <Icon name="Sparkles" size={12} />
              <span>{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
            </div>
            <h1 className="text-[20px] font-semibold tracking-tight mt-1">
              {greeting()}, <span style={{ color: "var(--tint-peach)" }}>{firstName}</span>
            </h1>
            <p className="text-[12.5px] mt-1 opacity-80">
              {totalPending > 0
                ? <><strong className="opacity-100" style={{ color: "var(--tint-peach)" }}>{totalPending}</strong> {totalPending === 1 ? "item" : "items"} waiting on your decision today.</>
                : "Inbox zero — nothing pending today."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-sm" onClick={load} style={{ background: "rgba(255,255,255,0.12)", color: "var(--text-on-dark)", border: "1px solid rgba(255,255,255,0.2)" }}>
              <Icon name="RefreshCw" size={13} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded p-2.5 bg-danger-bg text-danger-fg text-xs flex items-start gap-2">
          <Icon name="TriangleAlert" size={14} />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {/* QUICK ACTIONS — 4 large CTAs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <QuickAction
          href={`/t/${slug}/pr/new`}
          icon="FilePlus"
          title="New PR"
          subtitle="Raise a requisition"
          tintBg="var(--tint-teal)"
          tintFg="var(--tint-teal-fg)"
        />
        <QuickAction
          href={`/t/${slug}/po`}
          icon="ShoppingCart"
          title="View POs"
          subtitle={stats?.pendingPoCount ? `${stats.pendingPoCount} pending` : "Manage orders"}
          tintBg="var(--tint-peach)"
          tintFg="var(--tint-peach-fg)"
        />
        <QuickAction
          href={`/t/${slug}/grn`}
          icon="PackageCheck"
          title="Receive Goods"
          subtitle={stats?.grnMonthCount ? `${stats.grnMonthCount} this month` : "Log inwards"}
          tintBg="var(--tint-mint)"
          tintFg="var(--tint-mint-fg)"
        />
        <QuickAction
          href={`/t/${slug}/reports`}
          icon="BarChart3"
          title="Reports"
          subtitle="Spend & aging"
          tintBg="var(--tint-lilac)"
          tintFg="var(--tint-lilac-fg)"
        />
      </div>

      {/* KPI tiles — coloured by tone with icon chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-4">
        <KpiTile
          label="PR today"
          value={loading ? "—" : String(stats?.prRaisedToday ?? 0)}
          icon="FileText"
          href={`/t/${slug}/pr`}
          chipBg="var(--tint-teal)"
          chipFg="var(--tint-teal-fg)"
        />
        <KpiTile
          label="PR pending"
          value={loading ? "—" : String(stats?.pendingPrCount ?? 0)}
          icon="Inbox"
          href={`/t/${slug}/approvals`}
          chipBg={stats?.pendingPrCount ? "var(--tint-peach)" : "var(--surface-2)"}
          chipFg={stats?.pendingPrCount ? "var(--tint-peach-fg)" : "var(--muted)"}
          highlight={!!stats?.pendingPrCount}
        />
        <KpiTile
          label="PO pending"
          value={loading ? "—" : String(stats?.pendingPoCount ?? 0)}
          icon="ShoppingCart"
          href={`/t/${slug}/approvals`}
          chipBg={stats?.pendingPoCount ? "var(--tint-peach)" : "var(--surface-2)"}
          chipFg={stats?.pendingPoCount ? "var(--tint-peach-fg)" : "var(--muted)"}
          highlight={!!stats?.pendingPoCount}
        />
        <KpiTile
          label="Open POs"
          value={loading ? "—" : String(stats?.openPosCount ?? 0)}
          icon="Package"
          href={`/t/${slug}/po`}
          sub={stats?.overduePosCount ? `${stats.overduePosCount} overdue` : "All on track"}
          subTone={stats?.overduePosCount ? "danger" : "muted"}
          chipBg="var(--tint-sand)"
          chipFg="var(--tint-sand-fg)"
        />
        <KpiTile
          label="GRN MTD"
          value={loading ? "—" : String(stats?.grnMonthCount ?? 0)}
          icon="PackageCheck"
          href={`/t/${slug}/grn`}
          sub={loading ? "" : paiseToCompactINR(stats?.grnMonthValuePaise)}
          chipBg="var(--tint-mint)"
          chipFg="var(--tint-mint-fg)"
        />
        <KpiTile
          label="Spend MTD"
          value={loading ? "—" : paiseToCompactINR(stats?.monthlySpendPaise)}
          icon="IndianRupee"
          chipBg="var(--tint-lilac)"
          chipFg="var(--tint-lilac-fg)"
        />
        <KpiTile
          label="Suppliers"
          value={loading ? "—" : String(stats?.activeVendorsCount ?? 0)}
          icon="Users"
          href={`/t/${slug}/vendors`}
          chipBg="var(--tint-blush)"
          chipFg="var(--tint-blush-fg)"
        />
        <KpiTile
          label="Avg approval"
          value={loading ? "—" : stats?.avgApprovalDays != null ? `${stats.avgApprovalDays}d` : "—"}
          icon="Clock"
          sub="last 90 days"
          subTone="muted"
          chipBg="var(--surface)"
          chipFg="var(--muted)"
        />
      </div>

      {/* Row: monthly trend + PR aging + top vendors */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr] gap-3 mb-4">
        {/* Monthly trend bar chart */}
        <div className="card p-3">
          <SectionLabel
            title="Monthly trend"
            subtitle="PO value · last 6 months"
            right={loading ? null : (
              <span className="text-[10.5px] text-muted">
                Total · {paiseToCompactINR((stats?.monthlyTrend ?? []).reduce((s, m) => s + Number(m.poValuePaise), 0).toString())}
              </span>
            )}
          />
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
                    <div className="text-[10px] tabular-nums leading-none mb-0.5 text-muted">
                      {v > 0 ? paiseToCompactINR(m.poValuePaise) : ""}
                    </div>
                    <div className="w-full bg-surface rounded relative flex-1 flex flex-col justify-end overflow-hidden" style={{ minHeight: 4 }}>
                      <div
                        className="w-full rounded-sm transition-all"
                        style={{
                          height: `${Math.max(heightPct, v > 0 ? 4 : 0)}%`,
                          background: isLast ? "var(--primary)" : "var(--tint-teal-2)",
                        }}
                        title={`${m.poCount} POs · ${paiseToINR(m.poValuePaise)}`}
                      />
                    </div>
                    <div className={`text-[10px] ${isLast ? "font-semibold text-text-default" : "text-muted"}`}>{monthLabel(m.month)}</div>
                    <div className="text-[10px] text-text-default font-medium tabular-nums">{m.poCount} POs</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* PR aging */}
        <div className="card p-3">
          <SectionLabel title="PR aging" subtitle="Pending approval time" />
          {loading ? (
            <div className="h-24 grid place-items-center text-xs text-muted">Loading…</div>
          ) : (stats?.prAgingBuckets ?? []).every((b) => b.count === 0) ? (
            <div className="h-24 grid place-items-center text-xs text-muted text-center">
              <div>
                <Icon name="CircleCheckBig" size={18} className="mx-auto mb-1 text-success-fg" />
                Inbox zero
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {(stats?.prAgingBuckets ?? []).map((b) => {
                const tone = AGING_TONE[b.bucket];
                return (
                  <div
                    key={b.bucket}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 rounded"
                    style={{ background: tone.bg, color: tone.fg }}
                  >
                    <div className="flex items-center gap-2 text-[11.5px] font-semibold">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.dot }} />
                      {AGING_LABEL[b.bucket]}
                    </div>
                    <div className="flex items-baseline gap-2 tabular-nums">
                      <span className="text-[14px] font-bold">{b.count}</span>
                      <span className="text-[10px] opacity-80">{paiseToCompactINR(b.valuePaise)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top suppliers */}
        <div className="card p-3">
          <SectionLabel title="Top suppliers" subtitle="By total PO value" />
          {loading ? (
            <div className="h-24 grid place-items-center text-xs text-muted">Loading…</div>
          ) : (stats?.topVendors ?? []).length === 0 ? (
            <div className="h-24 grid place-items-center text-xs text-muted">No PO data yet</div>
          ) : (
            <div className="space-y-2">
              {(stats?.topVendors ?? []).slice(0, 5).map((v, idx) => {
                const widthPct = (Number(v.totalPaise) / maxVendor) * 100;
                return (
                  <Link
                    href={`/t/${slug}/vendors`}
                    key={v.vendorId}
                    className="block text-[11.5px] hover:bg-surface/60 rounded px-1 -mx-1 py-0.5"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium truncate flex items-center gap-1.5">
                        <span className="text-[10px] text-muted tabular-nums w-3">{idx + 1}.</span>
                        {v.vendorName}
                      </span>
                      <span className="tabular-nums text-text-default font-semibold whitespace-nowrap">
                        {paiseToCompactINR(v.totalPaise)}
                      </span>
                    </div>
                    <div className="h-1 w-full bg-surface rounded-sm mt-0.5 overflow-hidden">
                      <div className="h-full rounded-sm" style={{ width: `${widthPct}%`, background: "var(--primary)" }} />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Pending approvals */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <SectionLabel
            title="Pending approvals"
            subtitle={`${stats?.recentPending.length ?? 0} most recent`}
            noBorder
          />
          <Link href={`/t/${slug}/approvals`} className="text-[11.5px] font-semibold text-primary hover:underline">
            View all →
          </Link>
        </div>
        {loading ? (
          <div className="p-6 text-center text-xs text-muted">Loading…</div>
        ) : !stats?.recentPending.length ? (
          <div className="p-8 text-center">
            <div className="h-10 w-10 mx-auto mb-2 rounded-md grid place-items-center" style={{ background: "var(--tint-mint)", color: "var(--tint-mint-fg)" }}>
              <Icon name="CircleCheckBig" size={18} />
            </div>
            <p className="text-xs text-muted">No requisitions waiting for approval. 🎉</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">PR #</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Title</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Requester</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted">Amount</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Priority</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Status</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Raised</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentPending.map((p) => (
                <tr
                  key={p.id}
                  className="border-t border-border hover:bg-surface/60 cursor-pointer select-none"
                  onClick={() => { window.location.href = `/t/${slug}/pr/${p.id}`; }}
                >
                  <td className="px-3 py-2 font-mono text-[11px]">{p.prNumber ?? "—"}</td>
                  <td className="px-3 py-2 font-medium max-w-xs truncate">{p.title}</td>
                  <td className="px-3 py-2 text-muted">{p.requesterName}</td>
                  <td className="px-3 py-2 font-semibold tabular-nums text-right">{paiseToINR(p.estimatedTotalPaise)}</td>
                  <td className="px-3 py-2"><PriorityBadge priority={p.priority} /></td>
                  <td className="px-3 py-2"><PrStatusBadge status={p.status} /></td>
                  <td className="px-3 py-2 text-[11px] text-muted">{timeAgo(p.createdAt)}</td>
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
  const [, m] = month.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return names[Number(m) - 1] ?? month;
}

function SectionLabel({ title, subtitle, right, noBorder }: { title: string; subtitle?: string; right?: React.ReactNode; noBorder?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${noBorder ? "" : "mb-2"}`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="h-3.5 w-[3px] rounded-sm shrink-0" style={{ background: "var(--primary)" }} aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-[12.5px] font-semibold tracking-tight text-text-default leading-none">{title}</h3>
          {subtitle && <p className="text-[10.5px] text-muted mt-0.5 truncate leading-tight">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

function QuickAction({
  href,
  icon,
  title,
  subtitle,
  tintBg,
  tintFg,
}: {
  href: string;
  icon: IconProps["name"];
  title: string;
  subtitle: string;
  tintBg: string;
  tintFg: string;
}) {
  return (
    <Link
      href={href}
      className="card p-3 hover:border-primary/40 group transition flex items-center gap-3"
    >
      <div
        className="h-9 w-9 rounded-md grid place-items-center shrink-0 transition group-hover:scale-105"
        style={{ background: tintBg, color: tintFg }}
      >
        <Icon name={icon} size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold leading-tight text-text-default">{title}</p>
        <p className="text-[11px] text-muted truncate">{subtitle}</p>
      </div>
      <Icon name="ArrowRight" size={14} className="ml-auto text-muted group-hover:text-text-default transition opacity-0 group-hover:opacity-100" />
    </Link>
  );
}

function KpiTile({
  label,
  value,
  icon,
  sub,
  subTone = "muted",
  href,
  chipBg,
  chipFg,
  highlight,
}: {
  label: string;
  value: string;
  icon: IconProps["name"];
  sub?: string;
  subTone?: "muted" | "danger" | "warning" | "success";
  href?: string;
  chipBg: string;
  chipFg: string;
  highlight?: boolean;
}) {
  const subClass =
    subTone === "danger" ? "text-danger-fg font-semibold" :
    subTone === "warning" ? "text-warning-fg font-medium" :
    subTone === "success" ? "text-success-fg" :
    "text-muted";

  const content = (
    <div className={`card p-2.5 h-full flex flex-col gap-1.5 transition hover:border-primary/40 hover:shadow-md ${highlight ? "ring-1 ring-warning-fg/20" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</span>
        <span className="h-5 w-5 rounded grid place-items-center shrink-0" style={{ background: chipBg, color: chipFg }}>
          <Icon name={icon} size={11} />
        </span>
      </div>
      <div className="text-[18px] font-bold tabular-nums leading-none tracking-tight">{value}</div>
      {sub && <div className={`text-[10.5px] tabular-nums ${subClass}`}>{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
