"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

/**
 * Wraps tenant-scoped pages. If user isn't authenticated, redirects to /login.
 * Hydrates the auth store on first render.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { me, hydrated, hydrate } = useAuth();
  const [slowHint, setSlowHint] = useState(false);

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  useEffect(() => {
    if (hydrated && !me) router.replace("/login");
  }, [hydrated, me, router]);

  // After 5s of "loading", show a hint that the API may be cold-starting.
  // Render free tier dynos can take ~30s to wake; this stops users from
  // thinking the app is broken.
  useEffect(() => {
    if (hydrated) return;
    const t = setTimeout(() => setSlowHint(true), 5000);
    return () => clearTimeout(t);
  }, [hydrated]);

  if (!hydrated || !me) {
    return (
      <div className="grid place-items-center min-h-screen">
        <div className="text-center max-w-sm px-6">
          <div className="inline-flex h-8 w-8 rounded-full border-2 border-current border-r-transparent animate-spin text-primary mb-3" />
          <p className="text-sm text-muted">Loading your workspace…</p>
          {slowHint && (
            <p className="text-xs text-muted mt-3 leading-relaxed">
              First request after a quiet period takes ~30 seconds while the
              server wakes up. After this, navigation is fast.
            </p>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
