import type { Request, Response, NextFunction } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db/index";
import { memberships } from "../db/schema/memberships";
import { roles } from "../db/schema/roles";
import { Forbidden, Unauthorized } from "../lib/errors";
import type { Action, Resource, Scope } from "@indus/shared";

/**
 * Permission gate. Checks the current user has at least one (resource, action, *)
 * permission for the requested resource+action. Scope check is performed by
 * the service layer (since it needs the actual resource ownership info).
 *
 * Tenant admins bypass all checks. Super admins bypass too.
 */
export function requirePermission(resource: Resource, action: Action) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(Unauthorized());

    // Super admin & tenant admin shortcuts — see [[project-pain-points]] #33
    if (req.auth.sa || req.auth.ta) return next();

    try {
      // Look up the user's memberships in this tenant and their roles
      const userMemberships = await db
        .select({
          membership: memberships,
          role: roles,
        })
        .from(memberships)
        .innerJoin(roles, eq(memberships.roleId, roles.id))
        .where(
          and(
            eq(memberships.tenantId, req.auth.tid),
            eq(memberships.userId, req.auth.sub),
            eq(memberships.status, "active"),
            isNull(memberships.deletedAt),
          ),
        );

      const allPermissions = userMemberships.flatMap((m) => m.role.permissions);
      const hasAny = allPermissions.some((p) => p.resource === resource && p.action === action);

      if (!hasAny) {
        return next(
          Forbidden(
            "missing_permission",
            `You don't have permission to ${action} ${resource}`,
          ),
        );
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * Helper for service layer: given an array of role permissions + a target
 * resource's scope context, decides if access is allowed.
 *
 * Scope ladder: own < unit < company < tenant < global.
 * A permission with broader scope satisfies narrower checks.
 */
const SCOPE_RANK: Record<Scope, number> = {
  own: 1,
  unit: 2,
  company: 3,
  tenant: 4,
  global: 5,
};

export function canAccess(
  permissions: Array<{ resource: string; action: string; scope: string }>,
  needed: { resource: Resource; action: Action; minScope: Scope },
): boolean {
  return permissions.some(
    (p) =>
      p.resource === needed.resource &&
      p.action === needed.action &&
      SCOPE_RANK[p.scope as Scope] >= SCOPE_RANK[needed.minScope],
  );
}
