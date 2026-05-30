import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db/index";
import { companies } from "../db/schema/companies";
import { units } from "../db/schema/units";
import { departments } from "../db/schema/departments";
import { memberships } from "../db/schema/memberships";
import { users } from "../db/schema/users";
import { roles } from "../db/schema/roles";
import { tenants } from "../db/schema/tenants";
import { NotFound } from "../lib/errors";

/** Lightweight lookups for dropdowns. NOT full CRUD — see future settings UI. */

export async function listCompanies(tenantId: string) {
  return db
    .select({
      id: companies.id,
      name: companies.name,
      legalName: companies.legalName,
      gstin: companies.gstin,
      address: companies.address,
      city: companies.city,
      state: companies.state,
      pincode: companies.pincode,
      isPrimary: companies.isPrimary,
    })
    .from(companies)
    .where(and(eq(companies.tenantId, tenantId), isNull(companies.deletedAt)));
}

export async function listUnits(tenantId: string, companyId?: string) {
  const conds = [eq(units.tenantId, tenantId), isNull(units.deletedAt)];
  if (companyId) conds.push(eq(units.companyId, companyId));
  return db
    .select({
      id: units.id,
      companyId: units.companyId,
      name: units.name,
      code: units.code,
      city: units.city,
      type: units.type,
    })
    .from(units)
    .where(and(...conds));
}

/** Active members of a tenant — for buyer / approver / assignee dropdowns. */
export async function listTenantUsers(tenantId: string) {
  const rows = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      isTenantAdmin: memberships.isTenantAdmin,
      roleName: roles.name,
      roleKey: roles.key,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .where(
      and(
        eq(memberships.tenantId, tenantId),
        eq(memberships.status, "active"),
        isNull(memberships.deletedAt),
        isNull(users.deletedAt),
      ),
    );
  return rows;
}

export async function listDepartments(tenantId: string, unitId?: string) {
  const conds = [eq(departments.tenantId, tenantId), isNull(departments.deletedAt)];
  if (unitId) conds.push(eq(departments.unitId, unitId));
  return db
    .select({
      id: departments.id,
      unitId: departments.unitId,
      name: departments.name,
      code: departments.code,
    })
    .from(departments)
    .where(and(...conds));
}

export async function createDepartment(
  tenantId: string,
  input: { name: string; code?: string | null; unitId?: string | null },
) {
  if (!input.name.trim()) throw new Error("Department name is required");
  if (!input.unitId) throw new Error("A unit is required to create a department");
  const [created] = await db
    .insert(departments)
    .values({
      tenantId,
      name: input.name.trim(),
      code: input.code?.trim() || null,
      unitId: input.unitId,
    })
    .returning();
  return created!;
}

export async function deleteDepartment(tenantId: string, id: string) {
  await db
    .update(departments)
    .set({ deletedAt: new Date() })
    .where(and(eq(departments.tenantId, tenantId), eq(departments.id, id)));
}

/** Read the tenant's feature-toggle settings. Always returns an object. */
export async function getTenantSettings(tenantId: string) {
  const [row] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!row) throw NotFound("tenant_not_found", "Tenant not found");
  return row.settings ?? {};
}

/**
 * Merge-patch tenant settings — we deliberately don't replace the whole JSON
 * so future fields added by other features don't get wiped by an old client.
 * Shallow-merges the top-level keys (grn, etc.) and shallow-merges within them.
 */
export async function updateTenantSettings(
  tenantId: string,
  patch: { grn?: { batchMode?: boolean }; approval?: { prLevels?: number; poLevels?: number } },
) {
  const current = await getTenantSettings(tenantId);
  const next: typeof current = { ...current };
  if (patch.grn) next.grn = { ...(current.grn ?? {}), ...patch.grn };
  if (patch.approval) next.approval = { ...(current.approval ?? {}), ...patch.approval };
  await db.update(tenants).set({ settings: next, updatedAt: new Date() }).where(eq(tenants.id, tenantId));
  return next;
}
