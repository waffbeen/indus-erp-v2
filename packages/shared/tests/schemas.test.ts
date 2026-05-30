import { describe, it, expect } from "vitest";

/**
 * Public Zod schema contract tests for @indus/shared.
 *
 * These bind to the *stable* public surface (parse behaviour + defaults), not
 * internal field layout, so they keep passing while other tabs extend the
 * package. We import the specific schema files rather than the barrel so an
 * in-progress sibling export elsewhere can't break this suite.
 */
import { poCreateSchema, poStatusSchema } from "../src/schemas/po";
import { prCreateSchema, prStatusSchema } from "../src/schemas/pr";
import { grnConditionSchema } from "../src/schemas/grn";

const COMPANY = "11111111-1111-1111-1111-111111111111";
const UNIT = "22222222-2222-2222-2222-222222222222";
const VENDOR = "33333333-3333-3333-3333-333333333333";

describe("poCreateSchema", () => {
  it("applies GST-relevant defaults (isInterstate=false, taxRate=18, discount=0)", () => {
    const parsed = poCreateSchema.parse({
      companyId: COMPANY,
      unitId: UNIT,
      vendorId: VENDOR,
      title: "Test PO",
      items: [{ itemName: "Widget", quantity: 5, uom: "nos", unitPrice: 100 }],
    });
    expect(parsed.isInterstate).toBe(false);
    expect(parsed.items[0]!.taxRate).toBe(18);
    expect(parsed.items[0]!.discountPercent).toBe(0);
    expect(parsed.freightCharges).toBe(0);
  });

  it("rejects a PO with no line items", () => {
    const result = poCreateSchema.safeParse({
      companyId: COMPANY,
      unitId: UNIT,
      vendorId: VENDOR,
      title: "Empty PO",
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive quantity", () => {
    const result = poCreateSchema.safeParse({
      companyId: COMPANY,
      unitId: UNIT,
      vendorId: VENDOR,
      title: "Bad qty",
      items: [{ itemName: "Widget", quantity: 0, uom: "nos", unitPrice: 100 }],
    });
    expect(result.success).toBe(false);
  });
});

describe("prCreateSchema", () => {
  it("defaults prType=stock and priority=normal", () => {
    const parsed = prCreateSchema.parse({
      companyId: COMPANY,
      unitId: UNIT,
      title: "Test PR",
      items: [{ itemName: "Widget", quantity: 5, uom: "nos" }],
    });
    expect(parsed.prType).toBe("stock");
    expect(parsed.priority).toBe("normal");
  });
});

describe("status enums", () => {
  it("PR status includes the approval-flow states", () => {
    for (const s of ["draft", "pending_l1", "approved", "rejected", "cancelled", "converted_to_po"]) {
      expect(prStatusSchema.safeParse(s).success).toBe(true);
    }
    expect(prStatusSchema.safeParse("nonsense").success).toBe(false);
  });

  it("PO status includes the receipt-flow states", () => {
    for (const s of ["draft", "pending_approval", "approved", "partially_received", "received", "cancelled"]) {
      expect(poStatusSchema.safeParse(s).success).toBe(true);
    }
  });

  it("GRN condition enum is good/damaged/shortage/excess", () => {
    expect(grnConditionSchema.options).toEqual(["good", "damaged", "shortage", "excess"]);
  });
});
