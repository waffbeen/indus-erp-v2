import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db/index";
import { companies } from "../db/schema/companies";
import { units } from "../db/schema/units";
import { departments } from "../db/schema/departments";
import { memberships } from "../db/schema/memberships";
import { users } from "../db/schema/users";
import { roles } from "../db/schema/roles";

/** Lightweight lookups for dropdowns. NOT full CRUD — see future settings UI. */

export async function listCompanies(tenantId: string) {
  return db
    .select({
      id: companies.id,
      name: companies.name,
      isPrimary: companies.isPrimary,
      city: companies.city,
      state: companies.state,
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
