import type { ReactNode } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";

export default function TenantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { slug: string };
}) {
  return (
    <AuthGate>
      <AppShell tenantSlug={params.slug}>{children}</AppShell>
    </AuthGate>
  );
}
