/**
 * Pure GST / line-total math for Purchase Orders.
 *
 * Extracted from `po.service.ts` (`computeLine` / `computeHeaderTotals`) so the
 * tax split can be unit-tested without a database or any service wiring. This
 * module is intentionally dependency-free and side-effect-free — feed it plain
 * numbers, get plain results back.
 *
 * Conventions (mirror the rest of the codebase):
 *   - Money is paise (integer). Returned as `bigint` to avoid float drift.
 *   - Quantities are scaled ×1000.
 *   - Intrastate -> CGST + SGST (each ~half of taxRate; CGST is floored so an
 *     odd rate like 5 % splits 2 / 3, never 2.5 / 2.5).
 *   - Interstate -> IGST (the full taxRate, with CGST/SGST = 0).
 *
 * NOTE: this is a faithful copy of the math embedded in po.service.ts. During
 * consolidation, po.service.ts should import `computeLine`/`computeHeaderTotals`
 * from here so there is a single source of truth (see PARALLEL_BUILD_NOTES.md).
 */

/** Minimal shape the line math needs — decoupled from the full PoItemInput. */
export interface GstLineInput {
  /** Human-entered quantity (e.g. 2.5). Scaled ×1000 internally. */
  quantity: number;
  /** Unit price in rupees (e.g. 100.50). Scaled ×100 (paise) internally. */
  unitPrice: number;
  /** Whole-percent line discount (0–100). Rounded to an integer. */
  discountPercent?: number;
  /** Whole-percent GST rate (e.g. 18, 12, 5). */
  taxRate: number;
}

export interface ComputedLine {
  qtyScaled: number;
  unitPaise: number;
  subtotalPaise: bigint;
  discountPaise: bigint;
  taxableAmountPaise: bigint;
  taxRate: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  taxPaise: bigint;
  cgstPaise: bigint;
  sgstPaise: bigint;
  igstPaise: bigint;
  totalPaise: bigint;
}

/**
 * Split a whole-percent GST rate into CGST/SGST (intrastate) or IGST (interstate).
 * Intrastate floors CGST and gives the remainder to SGST so the two halves always
 * sum back to the original rate even when it is odd.
 */
export function splitGstRate(
  taxRate: number,
  isInterstate: boolean,
): { cgstRate: number; sgstRate: number; igstRate: number } {
  if (isInterstate) {
    return { cgstRate: 0, sgstRate: 0, igstRate: taxRate };
  }
  const cgstRate = Math.floor(taxRate / 2);
  const sgstRate = taxRate - cgstRate;
  return { cgstRate, sgstRate, igstRate: 0 };
}

/** Compute the full money breakdown for a single PO line. */
export function computeLine(it: GstLineInput, isInterstate: boolean): ComputedLine {
  const qtyScaled = Math.round(it.quantity * 1000);
  const unitPaise = Math.round(it.unitPrice * 100);
  const subtotal = (BigInt(qtyScaled) * BigInt(unitPaise)) / 1000n;
  const discountPercent = BigInt(Math.round(it.discountPercent ?? 0));
  const discount = (subtotal * discountPercent) / 100n;
  const taxable = subtotal - discount;
  const taxRate = it.taxRate;
  const { cgstRate, sgstRate, igstRate } = splitGstRate(taxRate, isInterstate);
  const cgst = (taxable * BigInt(cgstRate)) / 100n;
  const sgst = (taxable * BigInt(sgstRate)) / 100n;
  const igst = (taxable * BigInt(igstRate)) / 100n;
  const tax = cgst + sgst + igst;
  return {
    qtyScaled,
    unitPaise,
    subtotalPaise: subtotal,
    discountPaise: discount,
    taxableAmountPaise: taxable,
    taxRate,
    cgstRate,
    sgstRate,
    igstRate,
    taxPaise: tax,
    cgstPaise: cgst,
    sgstPaise: sgst,
    igstPaise: igst,
    totalPaise: taxable + tax,
  };
}

export interface HeaderTotals {
  subtotal: bigint;
  discount: bigint;
  taxable: bigint;
  cgst: bigint;
  sgst: bigint;
  igst: bigint;
  tax: bigint;
  freight: bigint;
  other: bigint;
  roundOff: bigint;
  total: bigint;
}

/** Roll a set of computed lines + header charges up into the PO grand total. */
export function computeHeaderTotals(
  lines: ComputedLine[],
  freightRupees = 0,
  otherRupees = 0,
  roundOffRupees = 0,
): HeaderTotals {
  let subtotal = 0n;
  let discount = 0n;
  let taxable = 0n;
  let cgst = 0n;
  let sgst = 0n;
  let igst = 0n;
  let tax = 0n;
  for (const l of lines) {
    subtotal += l.subtotalPaise;
    discount += l.discountPaise;
    taxable += l.taxableAmountPaise;
    cgst += l.cgstPaise;
    sgst += l.sgstPaise;
    igst += l.igstPaise;
    tax += l.taxPaise;
  }
  const freight = BigInt(Math.round(freightRupees * 100));
  const other = BigInt(Math.round(otherRupees * 100));
  const roundOff = BigInt(Math.round(roundOffRupees * 100));
  const total = taxable + tax + freight + other + roundOff;
  return { subtotal, discount, taxable, cgst, sgst, igst, tax, freight, other, roundOff, total };
}
