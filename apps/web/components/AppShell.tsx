"use client";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Icon, type IconProps } from "./Icon";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { useAuth } from "@/lib/auth";
import { sidebarModulesFor } from "@indus/shared";

/** localStorage key for the sidebar expanded/collapsed preference. */
const SIDEBAR_KEY = "indus.sidebar.expanded";

export function AppShell({
  tenantSlug,
  children,
}: {
  tenantSlug: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { me, logout } = useAuth();

  const base = `/t/${tenantSlug}`;
  const enabledKeys = me?.enabledModules ?? [];
  const navItems = useMemo(() => sidebarModulesFor(enabledKeys), [enabledKeys]);

  // Collapsible sidebar — small SaaS-style icon rail by default, expandable
  // to show labels next to icons. Preference persists across navigation.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_KEY);
      if (stored === "true") setExpanded(true);
    } catch {
      /* localStorage unavailable — keep default */
    }
  }, []);
  function toggleSidebar() {
    setExpanded((v) => {
      const next = !v;
      try { window.localStorage.setItem(SIDEBAR_KEY, String(next)); } catch { /* noop */ }
      return next;
    });
  }

  return (
    <div className="h-screen overflow-hidden flex" style={{ background: "var(--frame)" }}>

      {/* SIDEBAR — fixed icon rail, optional expanded mode with labels */}
      <aside
        className={clsx(
          "flex flex-col shrink-0 border-r border-border transition-[width] duration-150",
          expanded ? "w-56" : "w-14",
        )}
        style={{ background: "var(--frame)", color: "var(--text-on-dark)" }}
      >
        {/* Logo */}
        <div className="h-12 flex items-center px-3 border-b border-white/5">
          <div className="h-7 w-7 rounded-md grid place-items-center bg-white/10 shrink-0">
            <Icon name="Flower2" size={16} />
          </div>
          {expanded && (
            <span className="ml-2 text-sm font-semibold tracking-tight truncate">Prathvi&apos;s ERP</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-1.5">
          {navItems.map((m) => {
            const href = `${base}${m.path}`;
            const isActive =
              m.key === "dashboard"
                ? pathname === `${base}/dashboard`
                : pathname?.startsWith(`${base}${m.path}`);
            return (
              <Link
                key={m.key}
                href={href}
                title={m.name}
                className={clsx(
                  "flex items-center rounded-md mb-0.5 transition gap-2.5",
                  expanded ? "px-2.5 py-1.5" : "justify-center py-2",
                  isActive
                    ? "bg-bg text-text-default font-semibold"
                    : "opacity-70 hover:opacity-100 hover:bg-white/5",
                )}
              >
                <Icon name={m.icon as IconProps["name"]} size={16} />
                {expanded && (
                  <span className="text-[12.5px] leading-none truncate flex-1">{m.name}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom: collapse toggle + user avatar */}
        <div className="border-t border-white/5 p-1.5 flex flex-col gap-1">
          <button
            onClick={toggleSidebar}
            className={clsx(
              "flex items-center rounded-md text-[11px] opacity-70 hover:opacity-100 hover:bg-white/5",
              expanded ? "px-2.5 py-1.5 gap-2.5" : "justify-center py-2",
            )}
            title={expanded ? "Collapse sidebar" : "Expand sidebar"}
          >
            <Icon name={expanded ? "PanelLeftClose" : "PanelLeftOpen"} size={16} />
            {expanded && <span>Collapse</span>}
          </button>

          <button
            onClick={() => void logout()}
            className={clsx(
              "flex items-center rounded-md text-[11px] opacity-70 hover:opacity-100 hover:bg-white/5",
              expanded ? "px-2.5 py-1.5 gap-2.5" : "justify-center py-2",
            )}
            title={me ? `${me.fullName} — sign out` : "Sign out"}
          >
            <span
              className="h-6 w-6 rounded-full grid place-items-center text-[10px] font-bold shrink-0"
              style={{
                background: "linear-gradient(135deg, var(--tint-peach), var(--tint-peach-2))",
                color: "var(--tint-peach-fg)",
              }}
            >
              {(me?.fullName ?? "?")
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("")}
            </span>
            {expanded && (
              <span className="truncate flex-1 text-left">{me?.fullName ?? "Sign out"}</span>
            )}
          </button>
        </div>
      </aside>

      {/* MAIN COLUMN — only this scrolls */}
      <main className="flex-1 min-w-0 overflow-y-auto" style={{ background: "var(--bg)" }}>
        {/* Top bar — compact 48px height, sticky on scroll */}
        <header className="sticky top-0 z-20 h-12 flex items-center justify-between px-4 border-b border-border bg-bg">
          <div className="flex items-center gap-3">
            <button
              onClick={() => history.back()}
              className="h-7 w-7 rounded grid place-items-center hover:bg-surface text-muted hover:text-text-default"
              aria-label="Back"
            >
              <Icon name="ChevronLeft" size={16} />
            </button>
            <nav className="flex items-center gap-1">
              {[
                { href: `${base}/dashboard`,  label: "Dashboard" },
                { href: `${base}/approvals`,  label: "Approvals" },
                { href: `${base}/reports`,    label: "Reports" },
              ].map((it) => {
                const active = pathname?.startsWith(it.href);
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={clsx(
                      "px-2.5 py-1 rounded text-[12px] font-medium transition",
                      active
                        ? "text-text-default bg-surface"
                        : "text-muted hover:text-text-default hover:bg-surface/60",
                    )}
                  >
                    {it.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            <button className="h-7 w-7 rounded grid place-items-center text-muted hover:text-text-default hover:bg-surface" aria-label="Notifications">
              <Icon name="Bell" size={16} />
            </button>
          </div>
        </header>

        {/* Content area — compact padding, no outer card chrome */}
        <div className="px-4 py-4 lg:px-5 lg:py-5">{children}</div>
      </main>

    </div>
  );
}
