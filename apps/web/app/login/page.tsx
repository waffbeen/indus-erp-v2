"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";

/**
 * Testing-phase auto-login. While set to true, opening /login auto-submits the
 * seeded demo credentials so the tester lands straight on the dashboard.
 * Flip to false (or wire to an env var) before opening the app to real users.
 */
const TESTING_AUTO_LOGIN = true;

export default function LoginPage() {
  const router = useRouter();
  const { login, loading, me } = useAuth();

  const [email, setEmail] = useState("ramesh@acme.in");
  const [password, setPassword] = useState("Demo!2026");
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoTried, setAutoTried] = useState(false);
  const autoFiredRef = useRef(false);

  async function performLogin(em: string, pw: string, keep: boolean) {
    setError(null);
    try {
      await login({ email: em, password: pw, keepSignedIn: keep });
      const me = useAuth.getState().me;
      if (me) router.push(`/t/${me.tenantSlug}/dashboard`);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Something went wrong. Please try again.");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await performLogin(email, password, keepSignedIn);
  }

  // Auto-login on page mount during testing phase. Skips when:
  //   - flag is off
  //   - user is already logged in (would loop)
  //   - a previous auto-login attempt already failed (so they can see the error)
  useEffect(() => {
    if (!TESTING_AUTO_LOGIN || autoFiredRef.current || me || autoTried) return;
    autoFiredRef.current = true;
    setAutoTried(true);
    performLogin("ramesh@acme.in", "Demo!2026", false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  return (
    <div className="min-h-screen grid place-items-center p-8">
      <div className="fixed top-4 right-4 z-50 bg-white/10 backdrop-blur rounded-pill p-1">
        <ThemeSwitcher />
      </div>

      <div className="w-full max-w-4xl grid md:grid-cols-2 rounded-2xl shadow-dark overflow-hidden bg-bg min-h-[580px]">

        {/* FORM */}
        <div className="p-12 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-10">
            <div className="h-9 w-9 rounded-xl grid place-items-center bg-primary text-on-dark">
              <Icon name="Flower2" />
            </div>
            <span className="font-semibold tracking-tight">Indus</span>
          </div>

          <h1 className="display text-4xl mb-2">Welcome back</h1>
          <p className="text-sm text-muted mb-8">Sign in to your procurement workspace.</p>

          {TESTING_AUTO_LOGIN && loading && !error && (
            <div className="mb-4 rounded-lg p-3 bg-tint-mint text-sm flex items-center gap-2" style={{ color: "var(--tint-mint-fg)" }}>
              <span className="inline-block h-3 w-3 rounded-full bg-current animate-pulse" />
              Testing mode — auto-signing you in as Demo Admin…
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="label">Work email</label>
              <div className="relative">
                <input
                  className="input pl-11"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.in"
                />
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
                  <Icon name="Mail" />
                </span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label !mb-0">Password</label>
                <a href="#" className="text-xs font-semibold text-primary">Forgot?</a>
              </div>
              <div className="relative">
                <input
                  className="input pl-11"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
                  <Icon name="Lock" />
                </span>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={keepSignedIn}
                onChange={(e) => setKeepSignedIn(e.target.checked)}
                className="rounded"
              />
              Keep me signed in for 30 days
            </label>

            {error && (
              <div className="text-sm rounded-lg p-3 bg-danger-bg text-danger-fg">
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-lg w-full justify-center" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
              <Icon name="ArrowRight" />
            </button>
          </form>

          <p className="mt-8 text-xs text-muted text-center">
            New to Indus? <a href="#" className="font-semibold text-primary">Request access</a>
          </p>
        </div>

        {/* SCENE */}
        <div className="hidden md:block gradient-teal relative overflow-hidden">
          <div className="absolute inset-0 p-10 flex flex-col text-on-dark">
            <p className="text-xs font-semibold tracking-[0.2em] uppercase opacity-80">Indus ERP v2</p>
            <div className="mt-auto">
              <p className="display text-3xl leading-tight max-w-xs" style={{ color: "var(--tint-teal-fg)" }}>
                Procurement<br />
                that&apos;s effortless,<br />
                insights that are<br />
                instant.
              </p>
              <p className="mt-4 text-sm max-w-xs" style={{ color: "var(--tint-teal-fg)" }}>
                PR → PO → GRN in 2 clicks. Multi-level approvals. Real-time spend.
              </p>
              <p className="mt-8 text-xs opacity-80" style={{ color: "var(--tint-teal-fg)" }}>
                🇮🇳 Made for Indian businesses · GST + e-Invoice ready
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
