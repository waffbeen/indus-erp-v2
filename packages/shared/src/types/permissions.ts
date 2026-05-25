/**
 * Permission model:
 *   permission = (resource, action, scope)
 *
 * A user has roles. Each role has permissions. The Can() check on
 * frontend AND the RBAC middleware on backend both consult this triple.
 *
 * Keep these enums in sync between FE and BE — that's why they live in
 * `packages/shared`. NEVER hand-roll a string literal in app code.
 */

export const Resources = {
  PR: "pr",
  PO: "po",
  GRN: "grn",
  GateEntry: "gate_entry",
  Vendor: "vendor",
  Item: "item",
  Approval: "approval",
  Report: "report",
  User: "user",
  Role: "role",
  Module: "module",
  Tenant: "tenant",
  Company: "company",
  Unit: "unit",
  AuditLog: "audit_log",
  Billing: "billing",
} as const;
export type Resource = (typeof Resources)[keyof typeof Resources];

export const Actions = {
  Create: "create",
  Read: "read",
  Update: "update",
  Delete: "delete",
  Approve: "approve",
  Reject: "reject",
  Submit: "submit",
  Cancel: "cancel",
  Export: "export",
  Assign: "assign",
} as const;
export type Action = (typeof Actions)[keyof typeof Actions];

export const Scopes = {
  Own: "own",         // only resources the user created
  Unit: "unit",       // resources within user's unit
  Company: "company", // resources within user's company
  Tenant: "tenant",   // resources within user's tenant
  Global: "global",   // super-admin only — cross-tenant
} as const;
export type Scope = (typeof Scopes)[keyof typeof Scopes];

export interface Permission {
  resource: Resource;
  action: Action;
  scope: Scope;
}

/** Compact wire format: "pr:approve:unit" — easy to log, easy to read. */
export function permissionKey(p: Permission): string {
  return `${p.resource}:${p.action}:${p.scope}`;
}

export function parsePermissionKey(key: string): Permission | null {
  const parts = key.split(":");
  if (parts.length !== 3) return null;
  const [resource, action, scope] = parts as [Resource, Action, Scope];
  return { resource, action, scope };
}
