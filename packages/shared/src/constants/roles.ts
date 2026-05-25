import { Actions, Resources, Scopes, type Permission } from "../types/permissions";

/**
 * System roles — seeded on tenant creation. Tenant admins can create
 * additional custom roles by combining permissions.
 *
 * `scope` here is the DEFAULT scope; the tenant admin can tighten it
 * (e.g. limit approver to a single unit) when assigning roles to users.
 */

export interface SystemRole {
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
}

const all = (resource: any): Permission[] =>
  Object.values(Actions).map((action) => ({
    resource,
    action,
    scope: Scopes.Tenant,
  }));

export const SYSTEM_ROLES: SystemRole[] = [
  {
    key: "tenant_admin",
    name: "Tenant Admin",
    description: "Full access within the organization — manages users, roles, modules, billing.",
    permissions: [
      ...all(Resources.PR),
      ...all(Resources.PO),
      ...all(Resources.Vendor),
      ...all(Resources.Item),
      ...all(Resources.User),
      ...all(Resources.Role),
      ...all(Resources.Module),
      ...all(Resources.Company),
      ...all(Resources.Unit),
      ...all(Resources.Approval),
      ...all(Resources.Report),
      ...all(Resources.AuditLog),
      ...all(Resources.Billing),
    ],
  },
  {
    key: "company_admin",
    name: "Company Admin",
    description: "Manages a single legal company — its units, departments, users.",
    permissions: [
      ...all(Resources.PR),
      ...all(Resources.PO),
      ...all(Resources.Vendor),
      ...all(Resources.Item),
      ...all(Resources.Unit),
      ...all(Resources.User).map((p) => ({ ...p, scope: Scopes.Company })),
      ...all(Resources.Approval).map((p) => ({ ...p, scope: Scopes.Company })),
      ...all(Resources.Report).map((p) => ({ ...p, scope: Scopes.Company })),
    ],
  },
  {
    key: "procurement",
    name: "Procurement",
    description: "Raises PRs, drafts POs, manages vendors. No final approval rights.",
    permissions: [
      { resource: Resources.PR, action: Actions.Create, scope: Scopes.Unit },
      { resource: Resources.PR, action: Actions.Read, scope: Scopes.Unit },
      { resource: Resources.PR, action: Actions.Update, scope: Scopes.Own },
      { resource: Resources.PR, action: Actions.Submit, scope: Scopes.Own },
      { resource: Resources.PR, action: Actions.Cancel, scope: Scopes.Own },
      { resource: Resources.PO, action: Actions.Create, scope: Scopes.Unit },
      { resource: Resources.PO, action: Actions.Read, scope: Scopes.Unit },
      { resource: Resources.PO, action: Actions.Update, scope: Scopes.Own },
      { resource: Resources.PO, action: Actions.Submit, scope: Scopes.Own },
      { resource: Resources.Vendor, action: Actions.Read, scope: Scopes.Tenant },
      { resource: Resources.Vendor, action: Actions.Create, scope: Scopes.Tenant },
      { resource: Resources.Vendor, action: Actions.Update, scope: Scopes.Tenant },
      { resource: Resources.Item, action: Actions.Read, scope: Scopes.Tenant },
      { resource: Resources.Item, action: Actions.Create, scope: Scopes.Tenant },
    ],
  },
  {
    key: "approver",
    name: "Approver",
    description: "Reviews and approves/rejects PRs and POs in their scope.",
    permissions: [
      { resource: Resources.PR, action: Actions.Read, scope: Scopes.Unit },
      { resource: Resources.PR, action: Actions.Approve, scope: Scopes.Unit },
      { resource: Resources.PR, action: Actions.Reject, scope: Scopes.Unit },
      { resource: Resources.PO, action: Actions.Read, scope: Scopes.Unit },
      { resource: Resources.PO, action: Actions.Approve, scope: Scopes.Unit },
      { resource: Resources.PO, action: Actions.Reject, scope: Scopes.Unit },
      { resource: Resources.Approval, action: Actions.Read, scope: Scopes.Unit },
    ],
  },
  {
    key: "accountant",
    name: "Accountant",
    description: "Views all financial data; exports reports.",
    permissions: [
      { resource: Resources.PR, action: Actions.Read, scope: Scopes.Tenant },
      { resource: Resources.PO, action: Actions.Read, scope: Scopes.Tenant },
      { resource: Resources.Report, action: Actions.Read, scope: Scopes.Tenant },
      { resource: Resources.Report, action: Actions.Export, scope: Scopes.Tenant },
    ],
  },
  {
    key: "viewer",
    name: "Viewer",
    description: "Read-only access — sees data but cannot modify or approve.",
    permissions: [
      { resource: Resources.PR, action: Actions.Read, scope: Scopes.Unit },
      { resource: Resources.PO, action: Actions.Read, scope: Scopes.Unit },
      { resource: Resources.Vendor, action: Actions.Read, scope: Scopes.Tenant },
      { resource: Resources.Item, action: Actions.Read, scope: Scopes.Tenant },
    ],
  },
];

export const SYSTEM_ROLE_KEYS = SYSTEM_ROLES.map((r) => r.key);
export type SystemRoleKey = (typeof SYSTEM_ROLES)[number]["key"];
