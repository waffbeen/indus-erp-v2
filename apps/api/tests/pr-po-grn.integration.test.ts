import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * KEYSTONE integration test: PR -> PO -> GRN -> inventory, then GRN cancel.
 *
 * Flow under test (all via the real service functions):
 *   1. create + submit + approve a PR
 *   2. create + submit + approve a PO (linked to the PR)
 *   3. create a GRN that accepts a quantity against the PO
 *      -> assert stock on-hand for the item increased by exactly the accepted qty
 *   4. cancel the GRN
 *      -> assert stock on-hand returns to its prior value
 *
 * ──────────────────────────────────────────────────────────────────────────
 * SKIPPED until a live Postgres is available. This needs `TEST_DATABASE_URL`
 * (a throwaway Neon/Postgres DB with migrations applied) plus the JWT secrets
 * the env schema requires. See PARALLEL_BUILD_NOTES.md › "Integration test env".
 *
 * Once that exists: remove `.skip`. All service/db imports are DYNAMIC and live
 * inside the hooks/tests on purpose — importing `../src/config/env` at module
 * load time calls `process.exit(1)` when env vars are missing, which would kill
 * the whole runner. Dynamic imports keep this file inert while skipped.
 * ──────────────────────────────────────────────────────────────────────────
 */

const RUN = process.env.TEST_DATABASE_URL ? describe : describe.skip;

RUN("PR -> PO -> GRN -> inventory (integration)", () => {
  // Fixture ids, populated in beforeAll.
  const ids = {
    tenantId: "",
    companyId: "",
    unitId: "",
    vendorId: "",
    itemId: "",
    creatorUserId: "",
    approverUserId: "",
  };

  // Lazily-loaded modules (see header note on why these are dynamic).
  let db: typeof import("../src/db/index")["db"];
  let schema: typeof import("../src/db/schema/index");
  let prService: typeof import("../src/services/pr.service");
  let poService: typeof import("../src/services/po.service");
  let grnService: typeof import("../src/services/grn.service");
  let stockService: typeof import("../src/services/stock.service");

  const ACCEPTED_QTY = 12; // units accepted on the GRN
  const ORDERED_QTY = 20;

  const creatorCtx = () => ({ tenantId: ids.tenantId, userId: ids.creatorUserId, isTenantAdmin: false });
  // A different user approves so the self-approval guard passes.
  const approverCtx = () => ({ tenantId: ids.tenantId, userId: ids.approverUserId, isTenantAdmin: true });

  beforeAll(async () => {
    db = (await import("../src/db/index")).db;
    schema = await import("../src/db/schema/index");
    prService = await import("../src/services/pr.service");
    poService = await import("../src/services/po.service");
    grnService = await import("../src/services/grn.service");
    stockService = await import("../src/services/stock.service");

    // ── Seed the minimal master data the procurement flow needs ──
    const [tenant] = await db
      .insert(schema.tenants)
      .values({ slug: `test-${Date.now()}`, name: "Integration Test Co", status: "active" })
      .returning();
    ids.tenantId = tenant!.id;

    const [company] = await db
      .insert(schema.companies)
      .values({ tenantId: ids.tenantId, name: "Test Company", isPrimary: true })
      .returning();
    ids.companyId = company!.id;

    const [unit] = await db
      .insert(schema.units)
      .values({ tenantId: ids.tenantId, companyId: ids.companyId, name: "Main Warehouse", type: "warehouse" })
      .returning();
    ids.unitId = unit!.id;

    const [vendor] = await db
      .insert(schema.vendors)
      .values({ tenantId: ids.tenantId, name: "Test Vendor", email: "vendor@example.com" })
      .returning();
    ids.vendorId = vendor!.id;

    const [item] = await db
      .insert(schema.items)
      .values({ tenantId: ids.tenantId, name: "Test Widget", uom: "nos", isStocked: true, defaultTaxRate: 18 })
      .returning();
    ids.itemId = item!.id;

    const [creator] = await db
      .insert(schema.users)
      .values({ email: `creator-${Date.now()}@example.com`, passwordHash: "x", fullName: "Creator" })
      .returning();
    ids.creatorUserId = creator!.id;

    const [approver] = await db
      .insert(schema.users)
      .values({ email: `approver-${Date.now()}@example.com`, passwordHash: "x", fullName: "Approver" })
      .returning();
    ids.approverUserId = approver!.id;
  });

  afterAll(async () => {
    if (!db) return;
    const { eq, inArray } = await import("drizzle-orm");
    // Deleting the tenant cascades to its company/unit/vendor/item/PR/PO/GRN/
    // stock rows. Users are global, so remove the two we created explicitly.
    if (ids.tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, ids.tenantId));
    if (ids.creatorUserId) {
      await db
        .delete(schema.users)
        .where(inArray(schema.users.id, [ids.creatorUserId, ids.approverUserId]));
    }
  });

  async function onHandQty(): Promise<number> {
    const rows = await stockService.getStockByItem(ids.tenantId, { unitId: ids.unitId });
    const row = rows.find((r) => r.itemId === ids.itemId && r.unitId === ids.unitId);
    return row?.qty ?? 0;
  }

  it("raises on-hand by the accepted qty, then restores it on GRN cancel", async () => {
    const priorOnHand = await onHandQty();

    // 1) PR: create -> submit -> approve
    const pr = await prService.createPr(
      {
        companyId: ids.companyId,
        unitId: ids.unitId,
        title: "Integration PR",
        priority: "normal",
        prType: "stock",
        items: [{ itemId: ids.itemId, itemName: "Test Widget", quantity: ORDERED_QTY, uom: "nos", estimatedUnitPrice: 100 }],
      } as Parameters<typeof prService.createPr>[0],
      creatorCtx(),
    );
    await prService.submitPr(pr.id, creatorCtx());
    await prService.approvePr(pr.id, approverCtx());

    // 2) PO: create -> submit -> approve
    const po = await poService.createPo(
      {
        companyId: ids.companyId,
        unitId: ids.unitId,
        vendorId: ids.vendorId,
        prId: pr.id,
        title: "Integration PO",
        isInterstate: false,
        items: [
          {
            itemId: ids.itemId,
            itemName: "Test Widget",
            quantity: ORDERED_QTY,
            uom: "nos",
            unitPrice: 100,
            taxRate: 18,
          },
        ],
      } as Parameters<typeof poService.createPo>[0],
      creatorCtx(),
    );
    await poService.submitPo(po.id, creatorCtx());
    await poService.approvePo(po.id, approverCtx());

    // Need the PO line id to link the GRN line back to the PO line.
    const poDetail = await poService.getPo(ids.tenantId, po.id);
    const poLine = poDetail.items[0]!;

    // 3) GRN accepting ACCEPTED_QTY of the ordered line
    const grn = await grnService.createGrn(
      {
        companyId: ids.companyId,
        unitId: ids.unitId,
        poId: po.id,
        vendorId: ids.vendorId,
        receivedDate: new Date().toISOString().slice(0, 10),
        items: [
          {
            poItemId: poLine.id,
            itemId: ids.itemId,
            itemName: "Test Widget",
            uom: "nos",
            orderedQuantity: ORDERED_QTY,
            receivedQuantity: ACCEPTED_QTY,
            acceptedQuantity: ACCEPTED_QTY,
            rejectedQuantity: 0,
            unitPrice: 100,
            condition: "good",
          },
        ],
      } as Parameters<typeof grnService.createGrn>[0],
      creatorCtx(),
    );

    const afterGrn = await onHandQty();
    expect(afterGrn).toBe(priorOnHand + ACCEPTED_QTY);

    // 4) Cancel the GRN -> on-hand returns to prior
    await grnService.cancelGrn(grn.id, creatorCtx());

    const afterCancel = await onHandQty();
    expect(afterCancel).toBe(priorOnHand);
  });
});
