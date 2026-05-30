"use client";
import { type ReactNode, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Icon, type IconProps } from "./Icon";
import { NotificationsBell } from "./NotificationsBell";
import { useAuth } from "@/lib/auth";
import { useAppearance } from "@/lib/appearance";
import { sidebarModulesFor } from "@indus/shared";

type Mod = ReturnType<typeof sidebarModulesFor>[number];

const GROUP_ORDER = ["core", "procurement", "inventory", "finance", "intelligence", "admin"] as const;
const GROUP_LABEL: Record<string, string> = {
  procurement: "Procurement",
  inventory: "Inventory",
  finance: "Finance",
  intelligence: "Insights",
  admin: "Workspace",
};

export function AppShell({ tenantSlug, children }: { tenantSlug: string; children: ReactNode }) {
  const pathname = usePathname();
  const { me, logout } = useAuth();
  const { layout, mode, hydrate, update } = useAppearance();

  useEffect(() => { hydrate(); }, [hydrate]);

  const base = `/t/${tenantSlug}`;
  const enabledKeys = me?.enabledModules ?? [];
  const navItems = useMemo(() => sidebarModulesFor(enabledKeys), [enabledKeys]);

  const grouped = useMemo(() => {
    const map = new Map<string, Mod[]>();
    for (const m of navItems) {
      const g = m.group ?? "core";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(m);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, items: map.get(g)! }));
  }, [navItems]);

  const isActive = (path: string) =>
    path === "/dashboard" ? pathname === `${base}/dashboard` : Boolean(pathname?.startsWith(`${base}${path}`));

  const initials = (me?.fullName ?? "?").split(" ").map((s) => s[0]).slice(0, 2).join("");

  const brand = (
    <div className="flex items-center gap-2.5 px-2">
      <div className="h-8 w-8 rounded-[10px] grid place-items-center shrink-0 text-white font-extrabold text-[15px]" style={{ background: "var(--primary)" }}>P</div>
      <span className="display font-bold text-[15px] tracking-tight" style={{ color: "var(--text)" }}>Prathvi&apos;s ERP</span>
    </div>
  );

  const darkToggle = (
    <button
      onClick={() => update({ mode: mode === "dark" ? "light" : "dark" })}
      className="h-9 w-9 rounded-[11px] grid place-items-center border transition shrink-0"
      style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--muted)" }}
      title={mode === "dark" ? "Switch to light" : "Switch to dark"}
    >
      <Icon name={mode === "dark" ? "Sun" : "Moon"} size={17} />
    </button>
  );

  const userBlock = (
    <button
      onClick={() => void logout()}
      className="flex items-center gap-2.5 p-2 rounded-xl transition w-full text-left hover:brightness-[0.98]"
      style={{ background: "var(--surface)" }}
      title="Sign out"
    >
      <span className="h-8 w-8 rounded-full grid place-items-center text-[11px] font-bold text-white shrink-0" style={{ background: "var(--primary)" }}>{initials}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold truncate" style={{ color: "var(--text)" }}>{me?.fullName ?? "Account"}</span>
        <span className="block text-[10.5px] truncate" style={{ color: "var(--muted)" }}>{me?.tenantName ?? "Sign out"}</span>
      </span>
      <Icon name="LogOut" size={15} style={{ color: "var(--muted)" }} />
    </button>
  );

  const sidebarNav = (
    <nav className="flex-1 overflow-y-auto px-2 py-1.5 space-y-0.5">
      {grouped.map(({ group, items }) => (
        <div key={group} className="mb-0.5">
          {GROUP_LABEL[group] && (
            <div className="text-[10px] font-bold uppercase tracking-[0.09em] px-3 pt-3.5 pb-1.5" style={{ color: "var(--muted-2)" }}>{GROUP_LABEL[group]}</div>
          )}
          {items.map((m) => {
            const active = isActive(m.path);
            return (
              <Link
                key={m.key}
                href={`${base}${m.path}`}
                title={m.name}
                className="flex items-center gap-3 px-3 py-2 rounded-[10px] text-[13.5px] font-medium transition mb-px"
                style={active
                  ? { background: "var(--side-active-bg)", color: "var(--side-active-fg)", boxShadow: "var(--shadow-sm)" }
                  : { color: "var(--side-text)" }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--side-hover)"; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <Icon name={m.icon as IconProps["name"]} size={17} />
                <span className="truncate">{m.name}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const topbar = (
    <header
      className="sticky top-0 z-10 h-[54px] flex items-center gap-2 px-4 border-b shrink-0"
      style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--bg) 82%, transparent)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
    >
      <nav className="mr-auto flex items-center gap-0.5 overflow-x-auto no-scrollbar">
        {[
          { href: `${base}/dashboard`, label: "Dashboard" },
          { href: `${base}/approvals`, label: "Approvals" },
          { href: `${base}/reports`, label: "Reports" },
        ].map((it) => {
          const active = pathname?.startsWith(it.href);
          return (
            <Link key={it.href} href={it.href} className="px-3 py-1.5 rounded-[9px] text-[12.5px] font-semibold whitespace-nowrap transition"
              style={active ? { background: "var(--surface)", color: "var(--text)" } : { color: "var(--muted)" }}>
              {it.label}
            </Link>
          );
        })}
      </nav>
      {darkToggle}
      <NotificationsBell />
    </header>
  );

  // ---- TOP NAV layout ----
  if (layout === "topnav") {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
        <header className="sticky top-0 z-20 border-b" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--bg) 85%, transparent)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
          <div className="flex items-center gap-4 px-6 h-[60px]">
            {brand}
            <nav className="flex items-center gap-0.5 ml-3 overflow-x-auto no-scrollbar">
              {navItems.map((m) => {
                const active = isActive(m.path);
                return (
                  <Link key={m.key} href={`${base}${m.path}`} className="flex items-center gap-1.5 px-3 py-2 rounded-[9px] text-[13px] font-semibold whitespace-nowrap transition"
                    style={active ? { background: "var(--accent-soft)", color: "var(--accent-ink)" } : { color: "var(--muted)" }}>
                    <Icon name={m.icon as IconProps["name"]} size={14} />
                    {m.name}
                  </Link>
                );
              })}
            </nav>
            <div className="ml-auto flex items-center gap-2">{darkToggle}<NotificationsBell /></div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1200px] mx-auto px-7 py-6">{children}</div>
        </main>
      </div>
    );
  }

  // ---- EDITORIAL + FLOATING (left sidebar) ----
  const floating = layout === "floating";
  return (
    <div className="h-screen overflow-hidden flex" style={{ background: floating ? "var(--frame)" : "var(--bg)", gap: floating ? 14 : 0, padding: floating ? 14 : 0 }}>
      <aside
        className={clsx("flex flex-col shrink-0 w-[246px]", floating ? "rounded-2xl border" : "border-r")}
        style={{ background: "var(--side-bg)", borderColor: "var(--side-border)", boxShadow: floating ? "var(--shadow-md)" : "none", paddingTop: 14, paddingBottom: 14 }}
      >
        <div className="pb-2">{brand}</div>
        {sidebarNav}
        <div className="px-2 pt-2">{userBlock}</div>
      </aside>
      <main
        className={clsx("flex-1 min-w-0 flex flex-col overflow-hidden", floating && "rounded-2xl border")}
        style={{ background: "var(--bg)", borderColor: floating ? "var(--border)" : "transparent", boxShadow: floating ? "var(--shadow-md)" : "none" }}
      >
        {topbar}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">{children}</div>
      </main>
    </div>
  );
}
