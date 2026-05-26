"use client";
import { type ReactNode } from "react";
import Link from "next/link";
import { Icon, type IconProps } from "./Icon";

/**
 * Segmented status filter with optional count badge per tab.
 * Underline accent matches the dashboard sub-section style.
 */
export function StatusTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ key: T; label: string; count?: number }>;
  value: T;
  onChange: (k: T) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 border-b border-border">
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`relative px-3 py-1.5 text-[12px] font-medium transition flex items-center gap-1.5 ${
              active ? "text-text-default" : "text-muted hover:text-text-default"
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span
                className={`inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] font-bold tabular-nums ${
                  active ? "bg-primary text-on-dark" : "bg-surface text-muted"
                }`}
              >
                {t.count}
              </span>
            )}
            {active && (
              <span
                className="absolute left-0 right-0 -bottom-px h-0.5"
                style={{ background: "var(--primary)" }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Skeleton table — shown while real data is loading. Same column rhythm as
 * the actual table so the layout doesn't jump.
 */
export function SkeletonRows({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-t border-border">
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} className="px-3 py-2">
              <div
                className="h-3 rounded animate-pulse"
                style={{ background: "var(--surface-2)", width: `${50 + ((i * j) % 5) * 8}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

/**
 * Standardised empty state — icon chip + small title + body + optional CTA.
 * Mirrors the dashboard's empty-state vocabulary so the app feels coherent.
 */
export function EmptyState({
  icon,
  iconTint = "var(--tint-teal)",
  iconColor = "var(--tint-teal-fg)",
  title,
  description,
  cta,
  ctaHref,
  ctaIcon = "Plus",
}: {
  icon: IconProps["name"];
  iconTint?: string;
  iconColor?: string;
  title: string;
  description?: ReactNode;
  cta?: string;
  ctaHref?: string;
  ctaIcon?: IconProps["name"];
}) {
  return (
    <div className="p-10 text-center">
      <div
        className="h-10 w-10 rounded-md mx-auto grid place-items-center mb-2.5"
        style={{ background: iconTint, color: iconColor }}
      >
        <Icon name={icon} size={18} />
      </div>
      <h3 className="text-[14px] font-semibold tracking-tight mb-1">{title}</h3>
      {description && (
        <p className="text-[12px] text-muted leading-relaxed max-w-sm mx-auto">{description}</p>
      )}
      {cta && ctaHref && (
        <Link href={ctaHref} className="btn btn-primary btn-sm mt-4">
          <Icon name={ctaIcon} size={13} /> {cta}
        </Link>
      )}
    </div>
  );
}

/**
 * Compact list table header row. Use inside <table><thead>.
 */
export function ListHeader({ columns }: { columns: Array<{ label: string; align?: "left" | "right" | "center"; width?: string }> }) {
  return (
    <thead className="bg-surface">
      <tr>
        {columns.map((c, i) => (
          <th
            key={i}
            className={`text-${c.align ?? "left"} px-3 py-2 font-semibold uppercase tracking-wider text-muted`}
            style={c.width ? { width: c.width } : undefined}
          >
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/**
 * Generic filter bar — search input + free slot for filters/toggles.
 * Sits above lists; matches the GRN/Inventory style we already shipped.
 */
export function FilterBar({
  search,
  onSearch,
  placeholder = "Search…",
  children,
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder?: string;
  children?: ReactNode;
}) {
  return (
    <div className="card p-2 mb-3 flex flex-wrap items-center gap-2">
      <div className="flex-1 min-w-[200px] relative">
        <Icon name="Search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          type="text"
          className="input pl-7"
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      {children}
    </div>
  );
}
