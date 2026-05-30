import { describe, it, expect } from "vitest";
import {
  computeLine,
  computeHeaderTotals,
  splitGstRate,
  type GstLineInput,
} from "../src/lib/po-math";

/**
 * GST split + line/header math.
 *
 * The invariant that matters for compliance: for any single line, the per-head
 * taxes (CGST+SGST intrastate, or IGST interstate) must SUM to the line tax
 * total, and the intrastate and interstate paths must produce the SAME total
 * tax for the same taxable value. We assert behaviour through the public
 * helpers only — never the internal field layout.
 */

describe("splitGstRate", () => {
  it("intrastate splits the rate into CGST + SGST that sum back to taxRate", () => {
    const { cgstRate, sgstRate, igstRate } = splitGstRate(18, false);
    expect(cgstRate).toBe(9);
    expect(sgstRate).toBe(9);
    expect(igstRate).toBe(0);
    expect(cgstRate + sgstRate).toBe(18);
  });

  it("interstate puts the whole rate on IGST", () => {
    const { cgstRate, sgstRate, igstRate } = splitGstRate(18, true);
    expect(cgstRate).toBe(0);
    expect(sgstRate).toBe(0);
    expect(igstRate).toBe(18);
  });

  it("floors CGST on an odd rate so the halves still sum to the original", () => {
    const { cgstRate, sgstRate } = splitGstRate(5, false);
    expect(cgstRate).toBe(2);
    expect(sgstRate).toBe(3);
    expect(cgstRate + sgstRate).toBe(5);
  });
});

describe("computeLine — intrastate (CGST + SGST)", () => {
  const line: GstLineInput = { quantity: 10, unitPrice: 100, taxRate: 18 };

  it("computes subtotal/taxable in paise with quantities scaled ×1000", () => {
    const r = computeLine(line, false);
    // 10 units × ₹100 = ₹1000 = 100000 paise
    expect(r.qtyScaled).toBe(10_000);
    expect(r.unitPaise).toBe(10_000);
    expect(r.subtotalPaise).toBe(100_000n);
    expect(r.taxableAmountPaise).toBe(100_000n);
  });

  it("splits tax into CGST + SGST that sum to the line tax total", () => {
    const r = computeLine(line, false);
    expect(r.cgstPaise).toBe(9_000n); // 9% of 100000
    expect(r.sgstPaise).toBe(9_000n); // 9% of 100000
    expect(r.igstPaise).toBe(0n);
    expect(r.cgstPaise + r.sgstPaise).toBe(r.taxPaise);
    expect(r.taxPaise).toBe(18_000n);
  });

  it("grand total = taxable + tax", () => {
    const r = computeLine(line, false);
    expect(r.totalPaise).toBe(r.taxableAmountPaise + r.taxPaise);
    expect(r.totalPaise).toBe(118_000n);
  });
});

describe("computeLine — interstate (IGST)", () => {
  const line: GstLineInput = { quantity: 10, unitPrice: 100, taxRate: 18 };

  it("puts the whole tax on IGST and zeroes CGST/SGST", () => {
    const r = computeLine(line, true);
    expect(r.cgstPaise).toBe(0n);
    expect(r.sgstPaise).toBe(0n);
    expect(r.igstPaise).toBe(18_000n);
    expect(r.taxPaise).toBe(r.igstPaise);
  });
});

describe("computeLine — interstate vs intrastate equivalence", () => {
  it("yields the same total tax regardless of the split path", () => {
    const line: GstLineInput = { quantity: 7, unitPrice: 250.5, taxRate: 12 };
    const intra = computeLine(line, false);
    const inter = computeLine(line, true);

    expect(intra.taxableAmountPaise).toBe(inter.taxableAmountPaise);
    // CGST + SGST (intrastate) === IGST (interstate)
    expect(intra.cgstPaise + intra.sgstPaise).toBe(inter.igstPaise);
    expect(intra.taxPaise).toBe(inter.taxPaise);
    expect(intra.totalPaise).toBe(inter.totalPaise);
  });

  it("keeps the CGST+SGST == tax invariant on an odd rate (5%)", () => {
    const line: GstLineInput = { quantity: 4, unitPrice: 1000, taxRate: 5 };
    const r = computeLine(line, false);
    // taxable = 4 × ₹1000 = 400000 paise; CGST 2% = 8000, SGST 3% = 12000
    expect(r.cgstPaise).toBe(8_000n);
    expect(r.sgstPaise).toBe(12_000n);
    expect(r.cgstPaise + r.sgstPaise).toBe(r.taxPaise);
    expect(r.taxPaise).toBe(20_000n);
  });
});

describe("computeLine — discount applies before tax", () => {
  it("taxes the post-discount (taxable) amount, not the subtotal", () => {
    const line: GstLineInput = { quantity: 10, unitPrice: 100, discountPercent: 10, taxRate: 18 };
    const r = computeLine(line, false);
    expect(r.subtotalPaise).toBe(100_000n);
    expect(r.discountPaise).toBe(10_000n); // 10% of 100000
    expect(r.taxableAmountPaise).toBe(90_000n);
    expect(r.taxPaise).toBe(16_200n); // 18% of 90000
    expect(r.totalPaise).toBe(106_200n);
  });

  it("treats a missing discountPercent as zero", () => {
    const withUndef = computeLine({ quantity: 1, unitPrice: 50, taxRate: 18 }, false);
    const withZero = computeLine({ quantity: 1, unitPrice: 50, discountPercent: 0, taxRate: 18 }, false);
    expect(withUndef.taxableAmountPaise).toBe(withZero.taxableAmountPaise);
    expect(withUndef.totalPaise).toBe(withZero.totalPaise);
  });

  it("handles a zero tax rate (exempt goods) — no tax, total == taxable", () => {
    const r = computeLine({ quantity: 3, unitPrice: 200, taxRate: 0 }, false);
    expect(r.taxPaise).toBe(0n);
    expect(r.cgstPaise).toBe(0n);
    expect(r.sgstPaise).toBe(0n);
    expect(r.totalPaise).toBe(r.taxableAmountPaise);
  });
});

describe("computeHeaderTotals", () => {
  const lines = [
    computeLine({ quantity: 10, unitPrice: 100, taxRate: 18 }, false), // taxable 100000, tax 18000
    computeLine({ quantity: 5, unitPrice: 200, taxRate: 12 }, false), // taxable 100000, tax 12000
  ];

  it("sums each per-line bucket across the lines", () => {
    const t = computeHeaderTotals(lines);
    expect(t.taxable).toBe(200_000n);
    // line1: cgst 9000 + sgst 9000; line2: cgst 6000 + sgst 6000
    expect(t.cgst).toBe(15_000n);
    expect(t.sgst).toBe(15_000n);
    expect(t.igst).toBe(0n);
    expect(t.tax).toBe(30_000n);
    expect(t.cgst + t.sgst + t.igst).toBe(t.tax);
  });

  it("folds freight / other / round-off (in ₹) into the grand total as paise", () => {
    const t = computeHeaderTotals(lines, 500, 250, 1.5);
    // taxable 200000 + tax 30000 + freight 50000 + other 25000 + roundoff 150
    expect(t.freight).toBe(50_000n);
    expect(t.other).toBe(25_000n);
    expect(t.roundOff).toBe(150n);
    expect(t.total).toBe(200_000n + 30_000n + 50_000n + 25_000n + 150n);
  });

  it("defaults charges to zero when omitted", () => {
    const t = computeHeaderTotals(lines);
    expect(t.freight).toBe(0n);
    expect(t.other).toBe(0n);
    expect(t.roundOff).toBe(0n);
    expect(t.total).toBe(t.taxable + t.tax);
  });
});
