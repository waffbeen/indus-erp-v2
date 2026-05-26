"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/components/Icon";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";

interface TenantSettings {
  grn?: {
    batchMode?: boolean;
  };
}

export default function SettingsPage() {
  const { me } = useAuth();
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<TenantSettings>("/api/tenant/settings")
      .then(setSettings)
      .catch(() => setSettings({}));
  }, []);

  async function setBatchMode(on: boolean) {
    if (!me?.isTenantAdmin) {
      toast.error("Permission needed", "Only tenant admins can change settings.");
      return;
    }
    setSaving(true);
    try {
      const next = await api<TenantSettings>("/api/tenant/settings", {
        method: "PATCH",
        body: JSON.stringify({ grn: { batchMode: on } }),
      });
      setSettings(next);
      toast.success(
        on ? "Batch-wise GRN enabled" : "Batch-wise GRN disabled",
        on
          ? "Goods receipts ab har row pe batch / mfg / expiry capture karenge."
          : "GRN form vapas simple mode mein chala gaya — batch fields hide ho gaye.",
      );
    } catch (err) {
      toast.error("Could not save", err instanceof ApiError ? err.message : "Try again");
    } finally {
      setSaving(false);
    }
  }

  const batchOn = settings?.grn?.batchMode ?? false;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="display text-3xl">Settings</h1>
        <p className="text-sm text-muted mt-1">Workspace, profile, and appearance.</p>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold mb-3">Profile</h2>
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <dt className="text-muted">Name</dt>
          <dd className="col-span-2 font-medium">{me?.fullName}</dd>
          <dt className="text-muted">Email</dt>
          <dd className="col-span-2 font-medium">{me?.email}</dd>
          <dt className="text-muted">Workspace</dt>
          <dd className="col-span-2 font-medium">{me?.tenantName}</dd>
          <dt className="text-muted">Tenant admin</dt>
          <dd className="col-span-2 font-medium">{me?.isTenantAdmin ? "Yes" : "No"}</dd>
        </dl>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold mb-1">Goods Receipt (GRN)</h2>
        <p className="text-sm text-muted mb-4">
          Enterprise teams jo pharma / FMCG / spares mein batch tracking karte hain — yeh on karo.
          Chhote shops jo single-receipt mein kaam karte hain — band rakho.
        </p>

        <label className={`flex items-start gap-3 p-4 rounded-xl border ${batchOn ? "border-primary bg-tint-mint/30" : "border-border bg-surface"} cursor-pointer hover:border-border-strong transition`}>
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={batchOn}
            disabled={saving || !me?.isTenantAdmin}
            onChange={(e) => setBatchMode(e.target.checked)}
          />
          <div className="flex-1">
            <p className="font-semibold flex items-center gap-2">
              Batch-wise GRN
              {batchOn && (
                <span className="badge badge-success text-[10px] uppercase">On</span>
              )}
            </p>
            <p className="text-sm text-muted mt-1 leading-relaxed">
              Track <strong className="text-text-default">batch number</strong>, <strong className="text-text-default">manufacturing date</strong>, and{" "}
              <strong className="text-text-default">expiry date</strong> per receipt line. A single PO line can have multiple batches with different dates.
            </p>
            {!me?.isTenantAdmin && (
              <p className="text-xs text-warning-fg mt-2">
                <Icon name="Lock" size={12} className="inline mr-1" />
                Sirf tenant admin yeh setting badal sakta hai.
              </p>
            )}
          </div>
        </label>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold mb-1">Appearance</h2>
        <p className="text-sm text-muted mb-4">
          Theme is part of the global design system. Changes apply instantly across every page.
        </p>
        <ThemeSwitcher />
      </div>
    </div>
  );
}
