"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();
  const { register, loading } = useAuth();

  const [fullName, setFullName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const me = await register({ fullName, email, password, organizationName });
      router.push(`/t/${me.tenantSlug}/dashboard`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-8" style={{ background: "var(--frame)" }}>
      <div className="w-full max-w-4xl grid md:grid-cols-2 rounded-2xl overflow-hidden bg-bg min-h-[600px]" style={{ boxShadow: "var(--shadow-lg)", border: "1px solid var(--border)" }}>
        {/* FORM */}
        <div className="p-10 sm:p-12 flex flex-col justify-center">
          <div className="flex items-center gap-2.5 mb-8">
            <div className="h-9 w-9 rounded-xl grid place-items-center font-extrabold" style={{ background: "var(--primary)", color: "var(--primary-fg)" }}>P</div>
            <span className="font-semibold tracking-tight">Prathvi&apos;s ERP</span>
          </div>

          <h1 className="display text-4xl mb-2">Create your workspace</h1>
          <p className="text-sm text-muted mb-8">Start free — no card needed. 14-day trial.</p>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="label">Your name</label>
              <input className="input" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ramesh Kumar" autoComplete="name" />
            </div>
            <div>
              <label className="label">Workspace / company name</label>
              <input className="input" required value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} placeholder="Acme Industries" />
            </div>
            <div>
              <label className="label">Work email</label>
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.in" autoComplete="email" />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
            </div>

            {error && (
              <div className="text-sm rounded-lg p-3" style={{ background: "var(--danger-bg)", color: "var(--danger-fg)" }}>{error}</div>
            )}

            <button type="submit" className="btn btn-primary btn-lg w-full justify-center" disabled={loading}>
              {loading ? "Creating…" : "Create workspace"}
              <Icon name="ArrowRight" />
            </button>
          </form>

          <p className="mt-8 text-xs text-muted text-center">
            Already have an account? <Link href="/login" className="font-semibold" style={{ color: "var(--primary)" }}>Sign in</Link>
            <span className="mx-2">·</span>
            <Link href="/pricing" className="font-semibold" style={{ color: "var(--primary)" }}>See plans</Link>
          </p>
        </div>

        {/* SCENE */}
        <div className="hidden md:block gradient-accent relative overflow-hidden">
          <div className="absolute inset-0 p-10 flex flex-col" style={{ color: "var(--primary-fg)" }}>
            <p className="text-xs font-semibold tracking-[0.2em] uppercase opacity-80">Prathvi&apos;s ERP</p>
            <div className="mt-auto">
              <p className="display text-3xl leading-tight max-w-xs">
                Set up your procurement in under a minute.
              </p>
              <ul className="mt-6 space-y-2.5 text-sm max-w-xs opacity-95">
                <li className="flex items-center gap-2"><Icon name="Check" size={16} /> PR → PO → GRN with multi-level approvals</li>
                <li className="flex items-center gap-2"><Icon name="Check" size={16} /> GST-ready invoices, payments &amp; inventory</li>
                <li className="flex items-center gap-2"><Icon name="Check" size={16} /> AI assistant + real-time spend insights</li>
              </ul>
              <p className="mt-8 text-xs opacity-80">🇮🇳 Made for Indian businesses</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
