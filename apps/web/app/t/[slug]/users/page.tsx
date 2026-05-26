"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { Modal } from "@/components/Modal";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";
import { formatDateTime, timeAgo } from "@/lib/format";

interface Member {
  userId: string;
  email: string;
  fullName: string;
  roleName: string;
  roleId: string;
  isTenantAdmin: boolean;
  status: string;
  lastLoginAt: string | null;
  joinedAt: string;
}

interface InviteRow {
  id: string;
  email: string;
  fullName: string | null;
  roleName: string | null;
  isTenantAdmin: boolean;
  token: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  inviterName: string;
  createdAt: string;
}

interface Role { id: string; name: string; key: string; }

export default function UsersPage() {
  const params = useParams<{ slug: string }>();
  const { me } = useAuth();

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  // Invite form
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [m, i, r] = await Promise.all([
        api<Member[]>("/api/invites/members"),
        api<InviteRow[]>("/api/invites"),
        api<Role[]>("/api/invites/roles"),
      ]);
      setMembers(m);
      setInvites(i);
      setRoles(r);
      if (r[0] && !roleId) setRoleId(r[0].id);
    } catch (err) {
      toast.error("Could not load", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const created = await api<{ token: string }>("/api/invites", {
        method: "POST",
        body: JSON.stringify({ email, fullName: fullName || undefined, roleId, isTenantAdmin: isAdmin }),
      });
      const link = `${window.location.origin}/invite/${created.token}`;
      setLastInviteLink(link);
      toast.success("Invite created", `Share the link with ${email}.`);
      setEmail("");
      setFullName("");
      setIsAdmin(false);
      load();
    } catch (err) {
      toast.error("Could not invite", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(id: string) {
    try {
      await api(`/api/invites/${id}/revoke`, { method: "POST", body: JSON.stringify({}) });
      toast.success("Invite revoked");
      load();
    } catch (err) {
      toast.error("Could not revoke", err instanceof ApiError ? err.message : "Try again");
    }
  }

  async function handleMemberUpdate(userId: string, patch: { roleId?: string; isTenantAdmin?: boolean; status?: "active" | "suspended" }) {
    try {
      await api(`/api/invites/members/${userId}`, { method: "PATCH", body: JSON.stringify(patch) });
      toast.success("Member updated");
      load();
    } catch (err) {
      toast.error("Could not update", err instanceof ApiError ? err.message : "Try again");
    }
  }

  function copyLink(token: string) {
    const link = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(link).then(() => toast.success("Invite link copied", link));
  }

  const openInvites = invites.filter((i) => !i.acceptedAt && !i.revokedAt && new Date(i.expiresAt) > new Date());
  const acceptedInvites = invites.filter((i) => i.acceptedAt);

  return (
    <>
      <PageHeader
        title="Team & Invitations"
        subtitle="Members, roles, and outstanding invites for this workspace"
        actions={
          me?.isTenantAdmin ? (
            <button className="btn btn-primary btn-sm" onClick={() => { setLastInviteLink(null); setShowInvite(true); }}>
              <Icon name="UserPlus" size={14} /> Invite member
            </button>
          ) : null
        }
      />

      {/* Members table */}
      <div className="card overflow-hidden mb-4">
        <div className="px-3 py-2 border-b border-border">
          <h3 className="text-[12.5px] font-semibold">
            <span className="inline-block h-3 w-[3px] mr-2 align-middle rounded-sm" style={{ background: "var(--primary)" }} />
            Members <span className="text-muted font-normal">· {members.length}</span>
          </h3>
        </div>
        {loading ? (
          <div className="p-6 text-center text-xs text-muted">Loading…</div>
        ) : members.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted">No members yet.</div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Name</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Email</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Role</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Admin</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Status</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Last login</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Joined</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{m.fullName}{m.userId === me?.id && <span className="ml-1.5 text-[10px] text-muted">(you)</span>}</td>
                  <td className="px-3 py-2 text-muted">{m.email}</td>
                  <td className="px-3 py-2">
                    {me?.isTenantAdmin && m.userId !== me.id ? (
                      <select
                        className="input !py-1 !h-7 text-[11.5px]"
                        value={m.roleId}
                        onChange={(e) => handleMemberUpdate(m.userId, { roleId: e.target.value })}
                      >
                        {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    ) : (
                      <span className="text-[12px]">{m.roleName}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {me?.isTenantAdmin && m.userId !== me.id ? (
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5"
                        checked={m.isTenantAdmin}
                        onChange={(e) => handleMemberUpdate(m.userId, { isTenantAdmin: e.target.checked })}
                      />
                    ) : (
                      <span className={`badge ${m.isTenantAdmin ? "badge-info" : ""} text-[10px]`}>
                        {m.isTenantAdmin ? "Admin" : "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {me?.isTenantAdmin && m.userId !== me.id ? (
                      <select
                        className="input !py-1 !h-7 text-[11.5px]"
                        value={m.status}
                        onChange={(e) => handleMemberUpdate(m.userId, { status: e.target.value as "active" | "suspended" })}
                      >
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    ) : (
                      <span className={`badge ${m.status === "active" ? "badge-success" : "badge-warning"} text-[10px]`}>
                        {m.status}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-muted">{m.lastLoginAt ? timeAgo(m.lastLoginAt) : "Never"}</td>
                  <td className="px-3 py-2 text-[11px] text-muted">{timeAgo(m.joinedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Open invites */}
      {openInvites.length > 0 && (
        <div className="card overflow-hidden mb-4">
          <div className="px-3 py-2 border-b border-border">
            <h3 className="text-[12.5px] font-semibold">
              <span className="inline-block h-3 w-[3px] mr-2 align-middle rounded-sm" style={{ background: "var(--warning)" }} />
              Pending invites <span className="text-muted font-normal">· {openInvites.length}</span>
            </h3>
          </div>
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Email</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Role</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Invited by</th>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-muted">Expires</th>
                <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider text-muted"></th>
              </tr>
            </thead>
            <tbody>
              {openInvites.map((i) => (
                <tr key={i.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{i.email}</td>
                  <td className="px-3 py-2 text-[12px]">{i.roleName}{i.isTenantAdmin && <span className="badge badge-info text-[10px] ml-1.5">Admin</span>}</td>
                  <td className="px-3 py-2 text-muted text-[11.5px]">{i.inviterName}</td>
                  <td className="px-3 py-2 text-[11px] text-muted">{formatDateTime(i.expiresAt)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button className="btn btn-ghost btn-sm" onClick={() => copyLink(i.token)} title="Copy invite link">
                        <Icon name="Link2" size={12} /> Copy
                      </button>
                      {me?.isTenantAdmin && (
                        <button className="btn btn-ghost btn-sm" onClick={() => handleRevoke(i.id)} title="Revoke invite">
                          <Icon name="X" size={12} /> Revoke
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Accepted history (collapsed-ish) */}
      {acceptedInvites.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <h3 className="text-[12.5px] font-semibold text-muted">
              <span className="inline-block h-3 w-[3px] mr-2 align-middle rounded-sm" style={{ background: "var(--muted-2)" }} />
              Accepted ({acceptedInvites.length})
            </h3>
          </div>
          <table className="w-full">
            <tbody>
              {acceptedInvites.slice(0, 10).map((i) => (
                <tr key={i.id} className="border-t border-border">
                  <td className="px-3 py-2 text-muted text-[12px]">{i.email}</td>
                  <td className="px-3 py-2 text-muted text-[11px]">{i.roleName}</td>
                  <td className="px-3 py-2 text-muted text-[11px]">Accepted {timeAgo(i.acceptedAt!)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite modal */}
      <Modal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        title="Invite a team member"
        size="md"
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowInvite(false)}>
              {lastInviteLink ? "Done" : "Cancel"}
            </button>
            {!lastInviteLink && (
              <button type="submit" form="invite-form" className="btn btn-primary btn-sm" disabled={submitting || !email || !roleId}>
                {submitting ? "Inviting…" : "Create invite"}
              </button>
            )}
          </>
        }
      >
        {lastInviteLink ? (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-md grid place-items-center shrink-0" style={{ background: "var(--tint-mint)", color: "var(--tint-mint-fg)" }}>
                <Icon name="CheckCircle2" size={18} />
              </div>
              <div className="text-[12.5px] text-muted leading-relaxed">
                Invite created. Share the link below — once the invitee opens it, they'll be asked to set a password and join.
              </div>
            </div>
            <div>
              <label className="label">Invite link</label>
              <div className="flex gap-2">
                <input className="input flex-1 font-mono text-[11.5px]" value={lastInviteLink} readOnly onFocus={(e) => e.target.select()} />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => navigator.clipboard.writeText(lastInviteLink).then(() => toast.success("Copied"))}
                >
                  <Icon name="Copy" size={12} /> Copy
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form id="invite-form" onSubmit={handleInvite} className="space-y-2.5">
            <div>
              <label className="label">Email <span className="text-danger">*</span></label>
              <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@company.com" autoFocus />
            </div>
            <div>
              <label className="label">Full name <span className="text-muted">(optional)</span></label>
              <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Rakesh Kumar" />
            </div>
            <div>
              <label className="label">Role <span className="text-danger">*</span></label>
              <select className="input" value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <label className="flex items-start gap-2 mt-2 text-[12px] text-muted cursor-pointer">
              <input type="checkbox" className="h-3.5 w-3.5 mt-0.5" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
              <span>
                <strong className="text-text-default">Tenant admin</strong> — full settings access, can invite others.
              </span>
            </label>
          </form>
        )}
      </Modal>
    </>
  );
}
