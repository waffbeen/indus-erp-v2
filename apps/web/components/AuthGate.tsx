"use client";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

/**
 * Wraps tenant-scoped pages. If user isn't authenticated, redirects to /login.
 * Hydrates the auth store on first render.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { me, hydrated, hydrate } = useAuth();

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  useEffect(() => {
    if (hydrated && !me) router.replace("/login");
  }, [hydrated, me, router]);

  if (!hydrated || !me) {
    return (
      <div className="grid place-items-center min-h-screen">
        <div className="text-sm text-muted">Loading…</div>
      </div>
    );
  }

  return <>{children}</>;
}
