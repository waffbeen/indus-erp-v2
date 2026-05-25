import type { Request, Response, NextFunction } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db/index";
import { tenants } from "../db/schema/tenants";
import { Forbidden, NotFound, Unauthorized } from "../lib/errors";

/**
 * After requireAuth, this middleware:
 * 1. Looks up the tenant referenced in the JWT
 * 2. Validates tenant.status is "active" or "trial" (not suspended/deleted)
 * 3. Attaches tenant to req.tenant for downstream handlers
 *
 * Combined with requireAuth, this is the standard chain for every
 * tenant-scoped route.
 */
export async function requireTenant(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(Unauthorized());

  const [tenant] = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      status: tenants.status,
      suspendedReason: tenants.suspendedReason,
    })
    .from(tenants)
    .where(and(eq(tenants.id, req.auth.tid), isNull(tenants.deletedAt)))
    .limit(1);

  if (!tenant) {
    return next(NotFound("tenant_not_found", "Tenant not found or has been removed"));
  }

  if (tenant.status === "suspended") {
    return next(
      Forbidden(
        "tenant_suspended",
        tenant.suspendedReason
          ? `Your workspace is suspended: ${tenant.suspendedReason}`
          : "Your workspace is suspended. Contact support.",
      ),
    );
  }

  if (tenant.status === "deleted") {
    return next(Forbidden("tenant_deleted", "Your workspace has been deleted"));
  }

  req.tenant = { id: tenant.id, slug: tenant.slug, status: tenant.status };
  return next();
}
