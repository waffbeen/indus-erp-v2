"use client";
import { useAuth } from "@/lib/auth";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

export default function SettingsPage() {
  const { me } = useAuth();

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
        <h2 className="font-semibold mb-1">Appearance</h2>
        <p className="text-sm text-muted mb-4">
          Theme is part of the global design system. Changes apply instantly across every page.
        </p>
        <ThemeSwitcher />
      </div>
    </div>
  );
}
