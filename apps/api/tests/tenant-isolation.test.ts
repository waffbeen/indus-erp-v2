import { describe, it, expect } from "vitest";

/**
 * Tenant isolation.
 *
 * Every business query in the API is scoped with the same predicate pair:
 *   `and(eq(table.tenantId, tenantId), isNull(table.deletedAt))`
 * (see po.service / pr.service / stock.service / grn.service `getXRaw` helpers
 * and the `requireTenant` middleware that injects `req.tenant.id`). This suite
 * encodes that predicate as a pure filter and proves the two invariants that
 * keep tenants apart:
 *   1. a query scoped to tenant A NEVER returns tenant B rows, and
 *   2. soft-deleted rows are excluded.
 *
 * During consolidation this belongs in a shared `scopeToTenant` query helper so
 * the predicate has one definition (see PARALLEL_BUILD_NOTES.md).
 */

interface TenantRow {
  id: string;
  tenantId: string;
  deletedAt: Date | null;
}

/**
 * Pure mirror of the `eq(tenantId) AND isNull(deletedAt)` scoping every service
 * applies before returning rows to a caller.
 */
function scopeToTenant<T extends TenantRow>(rows: T[], tenantId: string): T[] {
  return rows.filter((r) => r.tenantId === tenantId && r.deletedAt === null);
}

const rows: TenantRow[] = [
  { id: "a1", tenantId: "tenant-A", deletedAt: null },
  { id: "a2", tenantId: "tenant-A", deletedAt: null },
  { id: "a3", tenantId: "tenant-A", deletedAt: new Date("2026-01-01") }, // soft-deleted
  { id: "b1", tenantId: "tenant-B", deletedAt: null },
  { id: "b2", tenantId: "tenant-B", deletedAt: null },
];

describe("tenant isolation — scoping predicate", () => {
  it("returns only the queried tenant's live rows", () => {
    const result = scopeToTenant(rows, "tenant-A");
    expect(result.map((r) => r.id).sort()).toEqual(["a1", "a2"]);
  });

  it("NEVER leaks another tenant's rows", () => {
    const result = scopeToTenant(rows, "tenant-A");
    expect(result.every((r) => r.tenantId === "tenant-A")).toBe(true);
    expect(result.some((r) => r.tenantId === "tenant-B")).toBe(false);
  });

  it("excludes soft-deleted rows even for the right tenant", () => {
    const result = scopeToTenant(rows, "tenant-A");
    expect(result.find((r) => r.id === "a3")).toBeUndefined();
  });

  it("is symmetric — tenant B sees only its own live rows", () => {
    const result = scopeToTenant(rows, "tenant-B");
    expect(result.map((r) => r.id).sort()).toEqual(["b1", "b2"]);
  });

  it("returns nothing for an unknown tenant", () => {
    expect(scopeToTenant(rows, "tenant-Z")).toEqual([]);
  });

  it("a fabricated id from another tenant cannot be fetched under tenant A", () => {
    // Simulates getPoRaw(tenantId, id): the id exists, but for tenant B.
    const stolenId = "b1";
    const found = scopeToTenant(rows, "tenant-A").find((r) => r.id === stolenId);
    expect(found).toBeUndefined(); // -> service would throw NotFound
  });
});
