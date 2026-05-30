"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/components/Icon";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";

interface TenantSettings {
  grn?: { batchMode?: boolean };
  approval?: { prLevels?: number; poLevels?: number };
}
interface Department { id: string; name: string; code: string | null; unitId: string | null; }
interface Unit { id: string; companyId: string; name: string; code: string | null; }
interface AiSettings {
  provider: "gemini" | "anthropic" | "openai";
  model: string | null;
  configured: boolean;
  source: "tenant" | "platform" | "none";
  last4: string | null;
}
interface MailSettings {
  host: string | null;
  port: number;
  secure: boolean;
  username: string | null;
  fromAddress: string | null;
  hasPassword: boolean;
  configured: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
}

type TabKey = "profile" | "ai" | "email" | "receiving" | "approvals" | "departments" | "appearance";

export default function SettingsPage() {
  const { me } = useAuth();
  const isAdmin = !!me?.isTenantAdmin;
  const [tab, setTab] = useState<TabKey>("profile");

  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [saving, setSaving] = useState(false);

  // Departments
  const [departments, setDepartments] = useState<Department[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptCode, setNewDeptCode] = useState("");
  const [newDeptUnitId, setNewDeptUnitId] = useState("");
  const [addingDept, setAddingDept] = useState(false);

  // AI
  const [ai, setAi] = useState<AiSettings | null>(null);
  const [aiProvider, setAiProvider] = useState<"gemini" | "anthropic" | "openai">("gemini");
  const [aiKey, setAiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiSaving, setAiSaving] = useState(false);

  // Email
  const [mail, setMail] = useState<MailSettings | null>(null);
  const [mailHost, setMailHost] = useState("");
  const [mailPort, setMailPort] = useState("587");
  const [mailSecure, setMailSecure] = useState(false);
  const [mailUser, setMailUser] = useState("");
  const [mailPass, setMailPass] = useState("");
  const [mailFrom, setMailFrom] = useState("");
  const [mailSaving, setMailSaving] = useState(false);
  const [mailTesting, setMailTesting] = useState(false);

  useEffect(() => {
    api<TenantSettings>("/api/tenant/settings").then(setSettings).catch(() => setSettings({}));
    refreshDepartments();
    api<Unit[]>("/api/tenant/units").then(setUnits).catch(() => setUnits([]));
    api<AiSettings>("/api/ai/settings")
      .then((s) => { setAi(s); setAiProvider(s.provider); setAiModel(s.model ?? ""); })
      .catch(() => setAi(null));
    api<MailSettings>("/api/mail/settings")
      .then((m) => {
        setMail(m);
        setMailHost(m.host ?? "");
        setMailPort(String(m.port ?? 587));
        setMailSecure(m.secure);
        setMailUser(m.username ?? "");
        setMailFrom(m.fromAddress ?? "");
      })
      .catch(() => setMail(null));
  }, []);

  function refreshDepartments() {
    api<Department[]>("/api/tenant/departments").then(setDepartments).catch(() => setDepartments([]));
  }

  async function handleAddDept(e: FormEvent) {
    e.preventDefault();
    if (!newDeptName.trim() || addingDept) return;
    setAddingDept(true);
    try {
      await api("/api/tenant/departments", {
        method: "POST",
        body: JSON.stringify({
          name: newDeptName.trim(),
          code: newDeptCode.trim() || undefined,
          unitId: newDeptUnitId || undefined,
        }),
      });
      toast.success("Department added");
      setNewDeptName("");
      setNewDeptCode("");
      refreshDepartments();
    } catch (err) {
      toast.error("Could not add", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setAddingDept(false);
    }
  }

  async function handleDeleteDept(id: string) {
    try {
      await api(`/api/tenant/departments/${id}`, { method: "DELETE" });
      toast.success("Department removed");
      refreshDepartments();
    } catch (err) {
      toast.error("Could not remove", err instanceof ApiError ? err.message : "Try again");
    }
  }

  async function patchSettings(patch: Partial<TenantSettings>) {
    if (!isAdmin) {
      toast.error("Permission needed", "Only tenant admins can change settings.");
      return;
    }
    setSaving(true);
    try {
      const next = await api<TenantSettings>("/api/tenant/settings", { method: "PATCH", body: JSON.stringify(patch) });
      setSettings(next);
      toast.success("Settings saved");
    } catch (err) {
      toast.error("Could not save", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setSaving(false);
    }
  }

  async function saveAiSettings(e: FormEvent) {
    e.preventDefault();
    if (aiSaving) return;
    setAiSaving(true);
    try {
      const body: { provider: string; apiKey?: string; model?: string | null } = {
        provider: aiProvider,
        model: aiModel.trim() || null,
      };
      if (aiKey.trim()) body.apiKey = aiKey.trim();
      const next = await api<AiSettings>("/api/ai/settings", { method: "PUT", body: JSON.stringify(body) });
      setAi(next);
      setAiKey("");
      toast.success("AI settings saved", next.configured ? "Assistant is ready." : undefined);
    } catch (err) {
      toast.error("Could not save", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setAiSaving(false);
    }
  }

  function mailBody() {
    return {
      host: mailHost.trim(),
      port: Number(mailPort) || 587,
      secure: mailSecure,
      username: mailUser.trim() || null,
      fromAddress: mailFrom.trim(),
      ...(mailPass.trim() ? { password: mailPass.trim() } : {}),
    };
  }

  async function testMail() {
    if (mailTesting) return;
    if (!mailHost.trim() || !mailFrom.trim()) {
      toast.error("Almost there", "Enter at least the SMTP host and a From address to test.");
      return;
    }
    setMailTesting(true);
    try {
      const res = await api<{ ok: boolean; message: string }>("/api/mail/settings/test", {
        method: "POST",
        body: JSON.stringify(mailBody()),
      });
      if (res.ok) toast.success("Test email sent ✓", res.message);
      else toast.error("Test failed", res.message);
    } catch (err) {
      toast.error("Test failed", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setMailTesting(false);
    }
  }

  async function saveMail(e: FormEvent) {
    e.preventDefault();
    if (mailSaving) return;
    setMailSaving(true);
    try {
      const next = await api<MailSettings>("/api/mail/settings", { method: "PUT", body: JSON.stringify(mailBody()) });
      setMail(next);
      setMailPass("");
      toast.success("Email settings saved", "Notifications will now send via your SMTP.");
    } catch (err) {
      toast.error("Could not save", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setMailSaving(false);
    }
  }

  const batchOn = settings?.grn?.batchMode ?? false;
  const prLevels = settings?.approval?.prLevels ?? 1;

  const TABS: { key: TabKey; label: string; icon: string; adminOnly?: boolean }[] = [
    { key: "profile", label: "Profile", icon: "User" },
    { key: "ai", label: "AI Assistant", icon: "Sparkles", adminOnly: true },
    { key: "email", label: "Email", icon: "Mail", adminOnly: true },
    { key: "receiving", label: "Receiving", icon: "PackageCheck" },
    { key: "approvals", label: "Approvals", icon: "ClipboardCheck" },
    { key: "departments", label: "Departments", icon: "Building2" },
    { key: "appearance", label: "Appearance", icon: "Palette" },
  ];
  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="display text-3xl">Settings</h1>
        <p className="text-sm text-muted mt-1">Workspace configuration, integrations &amp; appearance.</p>
      </div>

      <div className="grid lg:grid-cols-[210px_1fr] gap-5 items-start">
        {/* Section nav */}
        <nav className="card p-1.5 lg:sticky lg:top-2 flex lg:flex-col gap-1 overflow-x-auto no-scrollbar">
          {visibleTabs.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium whitespace-nowrap transition shrink-0 ${
                  active ? "bg-primary text-primary-fg shadow-sm" : "text-muted hover:text-text-default hover:bg-surface"
                }`}
              >
                <Icon name={t.icon} size={15} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Panel */}
        <div className="min-w-0 space-y-5">
          {tab === "profile" && (
            <Card title="Profile" subtitle="Your account and workspace.">
              <dl className="grid grid-cols-3 gap-y-3 text-sm">
                <dt className="text-muted">Name</dt>
                <dd className="col-span-2 font-medium">{me?.fullName}</dd>
                <dt className="text-muted">Email</dt>
                <dd className="col-span-2 font-medium">{me?.email}</dd>
                <dt className="text-muted">Workspace</dt>
                <dd className="col-span-2 font-medium">{me?.tenantName}</dd>
                <dt className="text-muted">Role</dt>
                <dd className="col-span-2 font-medium">{me?.isTenantAdmin ? "Workspace admin" : "Member"}</dd>
              </dl>
            </Card>
          )}

          {tab === "ai" && isAdmin && (
            <Card
              title={<span className="flex items-center gap-2"><Icon name="Sparkles" size={16} /> AI Assistant</span>}
              subtitle={<>Power &ldquo;Ask your ERP&rdquo; with your own AI key — stored encrypted, used immediately, no redeploy.</>}
            >
              <div className="mb-4">
                {ai?.configured ? (
                  <span className="badge badge-success text-[11px]">
                    Active — {ai.source === "tenant" ? "your key" : "platform key"}
                    {ai.last4 ? ` ••••${ai.last4}` : ""}
                  </span>
                ) : (
                  <span className="badge badge-warning text-[11px]">Not configured</span>
                )}
              </div>
              <form onSubmit={saveAiSettings} className="space-y-3">
                <div className="flex flex-wrap gap-3">
                  <div className="w-48">
                    <label className="label">Provider</label>
                    <select className="input" value={aiProvider} onChange={(e) => setAiProvider(e.target.value as "gemini" | "anthropic" | "openai")}>
                      <option value="gemini">Google Gemini</option>
                      <option value="openai">OpenAI (ChatGPT)</option>
                      <option value="anthropic">Anthropic Claude</option>
                    </select>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <label className="label">Model (optional)</label>
                    <input
                      className="input font-mono"
                      placeholder={aiProvider === "gemini" ? "gemini-2.0-flash" : aiProvider === "openai" ? "gpt-4o-mini" : "claude-opus-4-8"}
                      value={aiModel}
                      onChange={(e) => setAiModel(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="label">API key</label>
                  <input
                    type="password"
                    className="input font-mono"
                    autoComplete="off"
                    placeholder={
                      ai?.last4
                        ? `•••••••• saved (ending ${ai.last4}) — leave blank to keep`
                        : aiProvider === "gemini"
                          ? "Paste your Google AI Studio API key"
                          : aiProvider === "openai"
                            ? "Paste your OpenAI API key (sk-…)"
                            : "Paste your Anthropic API key"
                    }
                    value={aiKey}
                    onChange={(e) => setAiKey(e.target.value)}
                  />
                  <p className="text-[11px] text-muted mt-1">
                    {aiProvider === "gemini"
                      ? "Free key at aistudio.google.com/app/apikey."
                      : aiProvider === "openai"
                        ? "Key at platform.openai.com/api-keys."
                        : "Key at console.anthropic.com."}{" "}
                    Stored encrypted; never shown again.
                  </p>
                </div>
                <button type="submit" className="btn btn-primary btn-sm" disabled={aiSaving}>
                  <Icon name="Save" size={13} /> {aiSaving ? "Saving…" : "Save AI settings"}
                </button>
              </form>
            </Card>
          )}

          {tab === "email" && isAdmin && (
            <Card
              title={<span className="flex items-center gap-2"><Icon name="Mail" size={16} /> Email (SMTP)</span>}
              subtitle="Send approval &amp; receipt notifications from your own mailbox. Test the connection before saving."
            >
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {mail?.configured ? (
                  <span className="badge badge-success text-[11px]">Configured — {mail.host}</span>
                ) : (
                  <span className="badge badge-warning text-[11px]">Not configured</span>
                )}
                {mail?.lastTestedAt && (
                  <span className={`badge text-[11px] ${mail.lastTestOk ? "badge-success" : "badge-danger"}`}>
                    Last test {mail.lastTestOk ? "passed" : "failed"}
                  </span>
                )}
              </div>

              <form onSubmit={saveMail} className="space-y-3">
                <div className="flex flex-wrap gap-3">
                  <div className="flex-1 min-w-[220px]">
                    <label className="label">SMTP host</label>
                    <input className="input font-mono" placeholder="smtp.gmail.com" value={mailHost} onChange={(e) => setMailHost(e.target.value)} required />
                  </div>
                  <div className="w-24">
                    <label className="label">Port</label>
                    <input className="input font-mono" inputMode="numeric" placeholder="587" value={mailPort} onChange={(e) => setMailPort(e.target.value)} />
                  </div>
                  <div className="w-32">
                    <label className="label">Encryption</label>
                    <select className="input" value={mailSecure ? "ssl" : "tls"} onChange={(e) => setMailSecure(e.target.value === "ssl")}>
                      <option value="tls">TLS (587)</option>
                      <option value="ssl">SSL (465)</option>
                    </select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="flex-1 min-w-[220px]">
                    <label className="label">Username</label>
                    <input className="input font-mono" placeholder="you@yourdomain.com" value={mailUser} onChange={(e) => setMailUser(e.target.value)} autoComplete="off" />
                  </div>
                  <div className="flex-1 min-w-[220px]">
                    <label className="label">Password</label>
                    <input
                      type="password"
                      className="input font-mono"
                      autoComplete="new-password"
                      placeholder={mail?.hasPassword ? "•••••••• saved — leave blank to keep" : "App password / SMTP password"}
                      value={mailPass}
                      onChange={(e) => setMailPass(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="label">From address</label>
                  <input className="input" placeholder='Acme ERP <noreply@acme.in>' value={mailFrom} onChange={(e) => setMailFrom(e.target.value)} required />
                  <p className="text-[11px] text-muted mt-1">
                    Tip: for Gmail use an <strong className="text-text-default">App Password</strong> (not your login password). The test sends a mail to <strong className="text-text-default">{me?.email}</strong>.
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void testMail()} disabled={mailTesting || mailSaving}>
                    <Icon name="Send" size={13} /> {mailTesting ? "Testing…" : "Send test email"}
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={mailSaving || mailTesting}>
                    <Icon name="Save" size={13} /> {mailSaving ? "Saving…" : "Save email settings"}
                  </button>
                </div>
              </form>
            </Card>
          )}

          {tab === "receiving" && (
            <Card title="Goods Receipt (GRN)" subtitle="Batch tracking for pharma / FMCG / spares teams. Small single-receipt shops can leave it off.">
              <label className={`flex items-start gap-3 p-4 rounded-xl border ${batchOn ? "border-primary bg-tint-mint/30" : "border-border bg-surface"} cursor-pointer hover:border-border-strong transition`}>
                <input type="checkbox" className="mt-1 h-4 w-4" checked={batchOn} disabled={saving || !isAdmin} onChange={(e) => patchSettings({ grn: { batchMode: e.target.checked } })} />
                <div className="flex-1">
                  <p className="font-semibold flex items-center gap-2">
                    Batch-wise GRN
                    {batchOn && <span className="badge badge-success text-[10px] uppercase">On</span>}
                  </p>
                  <p className="text-sm text-muted mt-1 leading-relaxed">
                    Track <strong className="text-text-default">batch number</strong>, <strong className="text-text-default">mfg date</strong> and{" "}
                    <strong className="text-text-default">expiry</strong> per receipt line. One PO line can have multiple batches.
                  </p>
                  {!isAdmin && <p className="text-xs text-warning-fg mt-2"><Icon name="Lock" size={12} className="inline mr-1" />Only a workspace admin can change this.</p>}
                </div>
              </label>
            </Card>
          )}

          {tab === "approvals" && (
            <Card title="Approval workflow" subtitle="How many approval levels a Purchase Requisition passes through before it's finalised.">
              <div className="flex items-center gap-2 flex-wrap">
                {[1, 2, 3].map((n) => (
                  <button key={n} onClick={() => patchSettings({ approval: { prLevels: n } })} disabled={saving || !isAdmin} className={`btn btn-sm ${prLevels === n ? "btn-primary" : "btn-ghost"}`}>
                    {n} level{n === 1 ? "" : "s"}
                  </button>
                ))}
                <span className="text-[11.5px] text-muted ml-2">Current: <strong className="text-text-default">{prLevels} level{prLevels === 1 ? "" : "s"}</strong></span>
              </div>
              {!isAdmin && <p className="text-xs text-warning-fg mt-3"><Icon name="Lock" size={12} className="inline mr-1" />Only a workspace admin can change this.</p>}
            </Card>
          )}

          {tab === "departments" && (
            <Card title="Departments" subtitle={'Departments that can raise requisitions — shown in the "Requesting Department" field on every PR.'}>
              {isAdmin && (
                <form onSubmit={handleAddDept} className="flex flex-wrap items-end gap-2 mb-4 pb-4 border-b border-border">
                  <div className="flex-1 min-w-[180px]">
                    <label className="label">Name</label>
                    <input className="input" placeholder="e.g. Production" value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)} required />
                  </div>
                  <div className="w-28">
                    <label className="label">Code</label>
                    <input className="input font-mono" placeholder="PROD" value={newDeptCode} onChange={(e) => setNewDeptCode(e.target.value)} />
                  </div>
                  <div className="w-44">
                    <label className="label">Unit</label>
                    <select className="input" value={newDeptUnitId} onChange={(e) => setNewDeptUnitId(e.target.value)}>
                      <option value="">— Select unit —</option>
                      {units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.code ? ` (${u.code})` : ""}</option>)}
                    </select>
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={!newDeptName.trim() || addingDept}>
                    <Icon name="Plus" size={13} /> {addingDept ? "Adding…" : "Add"}
                  </button>
                </form>
              )}
              {departments.length === 0 ? (
                <p className="text-[12px] text-muted">No departments yet.</p>
              ) : (
                <table className="w-full">
                  <thead className="bg-surface">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted text-[11px]">Name</th>
                      <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted text-[11px]">Code</th>
                      <th className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider text-muted text-[11px]">Unit</th>
                      <th className="text-right px-3 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {departments.map((d) => (
                      <tr key={d.id} className="border-t border-border">
                        <td className="px-3 py-1.5 font-medium">{d.name}</td>
                        <td className="px-3 py-1.5 font-mono text-[11px] text-muted">{d.code ?? "—"}</td>
                        <td className="px-3 py-1.5 text-[11.5px] text-muted">{d.unitId ? units.find((u) => u.id === d.unitId)?.name ?? "—" : "Any"}</td>
                        <td className="px-3 py-1.5 text-right">
                          {isAdmin && (
                            <button className="text-[11px] text-muted hover:text-danger-fg" onClick={() => handleDeleteDept(d.id)} title="Remove">
                              <Icon name="Trash2" size={12} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          )}

          {tab === "appearance" && (
            <Card title="Appearance" subtitle="Theme is part of the global design system. Changes apply instantly across every page.">
              <ThemeSwitcher />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-6">
      <h2 className="font-semibold text-[15px]">{title}</h2>
      {subtitle && <p className="text-sm text-muted mt-1 mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </section>
  );
}
