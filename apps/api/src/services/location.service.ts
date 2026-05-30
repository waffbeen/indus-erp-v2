import { eq, and, isNull, asc } from "drizzle-orm";
import { db } from "../db/index";
import { storageLocations } from "../db/schema/storage_locations";
import { units } from "../db/schema/units";
import { auditLogs } from "../db/schema/audit_logs";
import { BadRequest, Forbidden, NotFound } from "../lib/errors";
import type { LocationUpsertInput } from "@indus/shared";

interface ActorContext {
  tenantId: string;
  userId: string;
  isTenantAdmin: boolean;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * List storage locations for a tenant, optionally scoped to one unit. Enriched
 * with the unit name and the parent location's name so the UI can render the
 * hierarchy without extra round-trips.
 */
export async function listLocations(
  tenantId: string,
  opts: { unitId?: string; includeInactive?: boolean } = {},
) {
  const conds = [eq(storageLocations.tenantId, tenantId), isNull(storageLocations.deletedAt)];
  if (opts.unitId) conds.push(eq(storageLocations.unitId, opts.unitId));
  if (!opts.includeInactive) conds.push(eq(storageLocations.isActive, true));

  const rows = await db
    .select({
      id: storageLocations.id,
      unitId: storageLocations.unitId,
      unitName: units.name,
      code: storageLocations.code,
      name: storageLocations.name,
      type: storageLocations.type,
      parentId: storageLocations.parentId,
      isActive: storageLocations.isActive,
    })
    .from(storageLocations)
    .leftJoin(units, eq(storageLocations.unitId, units.id))
    .where(and(...conds))
    .orderBy(asc(storageLocations.type), asc(storageLocations.name));

  // Resolve parent names in code so a single query stays cheap.
  const nameById = new Map(rows.map((r) => [r.id, r.name]));
  return rows.map((r) => ({
    ...r,
    parentName: r.parentId ? nameById.get(r.parentId) ?? null : null,
  }));
}

export async function upsertLocation(ctx: ActorContext, input: LocationUpsertInput) {
  const name = input.name.trim();
  if (!name) throw BadRequest("name_required", "Location name is required");

  // Guard the unit belongs to this tenant.
  const [unit] = await db
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.id, input.unitId), eq(units.tenantId, ctx.tenantId), isNull(units.deletedAt)))
    .limit(1);
  if (!unit) throw BadRequest("invalid_unit", "Selected unit does not belong to this workspace");

  const code = (input.code ?? "").trim() || null;
  const parentId = input.parentId && input.parentId !== "" ? input.parentId : null;

  // A location cannot be its own parent, and the parent must be a sibling in
  // the same tenant + unit so the tree never crosses warehouses.
  if (parentId) {
    if (parentId === input.id) throw BadRequest("invalid_parent", "A location cannot be its own parent");
    const [parent] = await db
      .select({ id: storageLocations.id, unitId: storageLocations.unitId })
      .from(storageLocations)
      .where(
        and(
          eq(storageLocations.id, parentId),
          eq(storageLocations.tenantId, ctx.tenantId),
          isNull(storageLocations.deletedAt),
        ),
      )
      .limit(1);
    if (!parent) throw BadRequest("invalid_parent", "Parent location not found");
    if (parent.unitId !== input.unitId)
      throw BadRequest("invalid_parent", "Parent location must be in the same unit");
  }

  if (input.id) {
    const [existing] = await db
      .select()
      .from(storageLocations)
      .where(
        and(
          eq(storageLocations.id, input.id),
          eq(storageLocations.tenantId, ctx.tenantId),
          isNull(storageLocations.deletedAt),
        ),
      )
      .limit(1);
    if (!existing) throw NotFound("location_not_found", "Location not found");

    const [updated] = await db
      .update(storageLocations)
      .set({
        unitId: input.unitId,
        code,
        name,
        type: input.type,
        parentId,
        isActive: input.isActive ?? existing.isActive,
        updatedAt: new Date(),
      })
      .where(eq(storageLocations.id, existing.id))
      .returning();

    await db.insert(auditLogs).values({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "update",
      resourceType: "storage_location",
      resourceId: existing.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      before: { name: existing.name, type: existing.type } as Record<string, unknown>,
      after: { name, type: input.type } as Record<string, unknown>,
    });
    return updated!;
  }

  const [created] = await db
    .insert(storageLocations)
    .values({
      tenantId: ctx.tenantId,
      unitId: input.unitId,
      code,
      name,
      type: input.type,
      parentId,
      isActive: input.isActive ?? true,
    })
    .returning();

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "create",
    resourceType: "storage_location",
    resourceId: created!.id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    after: { name, type: input.type, unitId: input.unitId } as Record<string, unknown>,
  });
  return created!;
}

export async function deleteLocation(ctx: ActorContext, id: string) {
  if (!ctx.isTenantAdmin) throw Forbidden("admin_only", "Only tenant admins can remove locations");

  const [existing] = await db
    .select({ id: storageLocations.id })
    .from(storageLocations)
    .where(
      and(
        eq(storageLocations.id, id),
        eq(storageLocations.tenantId, ctx.tenantId),
        isNull(storageLocations.deletedAt),
      ),
    )
    .limit(1);
  if (!existing) throw NotFound("location_not_found", "Location not found");

  await db
    .update(storageLocations)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(storageLocations.tenantId, ctx.tenantId), eq(storageLocations.id, id)));

  // Orphan any children so they don't point at a deleted parent.
  await db
    .update(storageLocations)
    .set({ parentId: null, updatedAt: new Date() })
    .where(and(eq(storageLocations.tenantId, ctx.tenantId), eq(storageLocations.parentId, id)));

  await db.insert(auditLogs).values({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "delete",
    resourceType: "storage_location",
    resourceId: id,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}
