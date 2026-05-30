"use client";
import { useEffect, type ReactNode } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import type { Me } from "@indus/shared";

/**
 * Per-tenant white-label branding (additive, non-structural).
 *
 * The design system already themes the whole app at runtime via
 * `<body data-theme="...">` + CSS tokens (packages/ui). Here we apply the
 * signed-in tenant's branding on top of that:
 *   - `data-theme` chooses the token preset (default "circle").
 *   - a brand colour overrides the `--primary` token (and friends) on <body>,
 *     so buttons, accents and charts pick it up app-wide — inline styles on the
 *     same element the tokens target win over the stylesheet.
 *
 * Branding is read from the `/me` payload. Those fields don't exist on `Me` yet
 * (the SaaS/onboarding work will expose `tenants.themeKey` + `tenants.metadata`),
 * so this is a safe no-op today — it falls back to the default theme with no
 * override. See PARALLEL_BUILD_NOTES.md for the one-line backend hook that lights
 * it up end-to-end. A user's manual theme choice (ThemeSwitcher) still wins.
 */
type TenantBranding = {
  theme?: string;
  brandColor?: string;
  brandColorDark?: string;
  logoUrl?: string;
};

const DEFAULT_THEME = "circle";
const USER_THEME_KEY = "indus.theme";

export default function TenantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { slug: string };
}) {
  const me = useAuth((s) => s.me);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;
    const brand = (me ?? {}) as Partial<Me> & TenantBranding;

    // Theme preset: a user's explicit pick wins; else the tenant's theme; else default.
    let userChoice: string | null = null;
    try {
      userChoice = window.localStorage.getItem(USER_THEME_KEY);
    } catch {
      /* localStorage unavailable */
    }
    body.setAttribute("data-theme", userChoice || brand.theme || DEFAULT_THEME);

    // Brand colour override (white-label). Set on <body> so it overrides the
    // [data-theme] token declarations on the same element.
    if (brand.brandColor) {
      body.style.setProperty("--primary", brand.brandColor);
      body.style.setProperty("--primary-hover", brand.brandColorDark || brand.brandColor);
      body.style.setProperty("--brand", brand.brandColor);
    } else {
      body.style.removeProperty("--primary");
      body.style.removeProperty("--primary-hover");
      body.style.removeProperty("--brand");
    }

    // Expose the logo URL + tenant name as CSS vars for any consumer that wants them.
    if (brand.logoUrl) {
      body.style.setProperty("--brand-logo", `url("${brand.logoUrl}")`);
    } else {
      body.style.removeProperty("--brand-logo");
    }
    if (brand.tenantName) {
      body.style.setProperty("--brand-name", JSON.stringify(brand.tenantName));
    }
  }, [me]);

  return (
    <AuthGate>
      <AppShell tenantSlug={params.slug}>{children}</AppShell>
    </AuthGate>
  );
}
