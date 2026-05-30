"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface InviteInfo {
  email: string;
  fullName: string | null;
  roleName: string | null;
  isTenantAdmin: boolean;
  tenantId: string;
}

export default function AcceptInvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { login } = useAuth();
  const token = params?.token ?? "";

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api<InviteInfo>(`/api/accept-invite/${token}`)
      .then((d) => { setInvite(d); setFullName(d.fullName ?? ""); })
      .catch((err) => setLoadErr(err instanceof ApiError ? err.message : "Could not load invite"));
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting || !invite) return;
    setSubmitErr(null);
    setSubmitting(true);
    try {
      await api(`/api/accept-invite/${token}/accept`, {
        method: "POST",
        body: JSON.stringify({ token, fullName, password }),
      });
      // Auto-login with the credentials they just set
      await login({ email: invite.email, password, keepSignedIn: false });
      const me = useAuth.getState().me;
      if (me) router.push(`/t/${me.tenantSlug}/dashboard`);
    } catch (err) {
      setSubmitErr(err instanceof ApiError ? err.message : "Could not accept invite");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-6" style={{ background: "var(--frame)" }}>
      <div className="w-full max-w-md card p-6" style={{ boxShadow: "var(--shadow-lg)" }}>
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-md grid place-items-center" style={{ background: "var(--primary)", color: "var(--primary-fg)" }}>
            <Icon name="Flower2" size={16} />
          </div>
          <span className="text-[13px] font-semibold tracking-tight">Prathvi&apos;s ERP</span>
        </div>

        {loadErr ? (
          <div className="text-center py-8">
            <div className="h-12 w-12 mx-auto mb-3 rounded-md grid place-items-center" style={{ background: "var(--tint-blush)", color: "var(--tint-blush-fg)" }}>
              <Icon name="CircleX" size={22} />
            </div>
            <h1 className="text-[15px] font-semibold mb-1">Invite unavailable</h1>
            <p className="text-[12px] text-muted">{loadErr}</p>
          </div>
        ) : !invite ? (
          <div className="text-center py-8 text-xs text-muted">Loading invite…</div>
        ) : (
          <>
            <h1 className="text-[17px] font-semibold tracking-tight mb-1">You're invited!</h1>
            <p className="text-[12.5px] text-muted leading-relaxed">
              Join as <strong className="text-text-default">{invite.roleName ?? "team member"}</strong>
              {invite.isTenantAdmin && <span className="badge badge-info text-[10px] ml-1">Admin</span>}
              {" "}— set a password to finish.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3 mt-4">
              <div>
                <label className="label">Email</label>
                <input className="input" value={invite.email} readOnly />
              </div>
              <div>
                <label className="label">Full name</label>
                <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} />
              </div>
              <div>
                <label className="label">Password <span className="text-muted">(min 8 chars)</span></label>
                <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              </div>
              {submitErr && (
                <div className="rounded p-2.5 bg-danger-bg text-danger-fg text-[12px]">{submitErr}</div>
              )}
              <button type="submit" className="btn btn-primary btn-lg w-full" disabled={submitting || !fullName || password.length < 8}>
                {submitting ? "Joining…" : "Accept & Sign in"}
                <Icon name="ArrowRight" size={14} />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
