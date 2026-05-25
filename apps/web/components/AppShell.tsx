"use client";
import { type ReactNode, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Icon, type IconProps } from "./Icon";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { useAuth } from "@/lib/auth";
import { sidebarModulesFor } from "@indus/shared";

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
  /** Resolved sidebar items — driven by the module master + tenant's enabledModules. */
  const navItems = useMemo(() => sidebarModulesFor(enabledKeys), [enabledKeys]);

  return (
    <div className="p-1.5 h-screen overflow-hidden">
      <div className="mx-auto grid grid-cols-[110px_1fr] rounded-2xl shadow-dark overflow-hidden h-full bg-bg">

        {/* SIDEBAR — fixed height, scrolls internally only if too many modules */}
        <aside className="bg-frame text-on-dark flex flex-col items-center py-6 overflow-y-auto">
          <div className="mb-8 shrink-0">
            <div className="h-9 w-9 rounded-xl grid place-items-center mx-auto bg-white/10">
              <Icon name="Flower2" />
            </div>
            <p className="text-[11px] mt-1.5 text-center opacity-80 font-medium tracking-wide">Indus</p>
          </div>

          <nav className="flex-1 flex flex-col gap-1 items-stretch w-full px-3">
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
                    "flex flex-col items-center gap-1 py-2 rounded-md transition",
                    isActive ? "bg-bg text-text-default" : "hover:bg-white/5 opacity-80 hover:opacity-100",
                  )}
                >
                  <Icon name={m.icon as IconProps["name"]} />
                  <span className="text-[10px] font-medium leading-tight text-center">{m.shortLabel}</span>
                </Link>
              );
            })}
          </nav>

          <button
            onClick={() => void logout()}
            className="mt-6 h-10 w-10 rounded-xl overflow-hidden grid place-items-center text-sm font-semibold hover:opacity-90 shrink-0"
            style={{
              background: "linear-gradient(135deg, var(--tint-peach), var(--tint-peach-2))",
              color: "var(--tint-peach-fg)",
            }}
            title={me ? `${me.fullName} · click to sign out` : "Sign out"}
          >
            {(me?.fullName ?? "?")
              .split(" ")
              .map((s) => s[0])
              .slice(0, 2)
              .join("")}
          </button>
        </aside>

        {/* MAIN — only this area scrolls when content overflows */}
        <main className="overflow-y-auto">
          <header className="sticky top-0 z-20 flex items-center justify-between px-8 h-20 border-b border-border bg-bg">
            <button
              onClick={() => history.back()}
              className="h-10 w-10 rounded-pill border border-border grid place-items-center bg-bg shadow-sm hover:bg-surface"
              aria-label="Back"
            >
              <Icon name="ChevronLeft" />
            </button>

            <nav className="flex items-center gap-10">
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
                    className="relative text-xs font-bold tracking-[0.18em] uppercase text-text-default hover:opacity-100 transition"
                    style={{ opacity: active ? 1 : 0.6 }}
                  >
                    {it.label}
                    {active && <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full" style={{ background: "var(--primary)" }} />}
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-3">
              <ThemeSwitcher />
              <button className="h-10 w-10 rounded-pill border border-border grid place-items-center bg-bg" aria-label="Notifications">
                <Icon name="Bell" />
              </button>
            </div>
          </header>

          <div className="px-5 py-5 lg:px-6 lg:py-6">{children}</div>
        </main>

      </div>
    </div>
  );
}
