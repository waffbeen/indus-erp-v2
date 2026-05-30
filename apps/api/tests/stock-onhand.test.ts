import { describe, it, expect } from "vitest";

/**
 * Stock on-hand aggregation.
 *
 * The real netting happens in stock.service.ts: `getStockByItem` does
 * `SUM(qtyScaled)` grouped by (item, unit); `getItemLedger` computes a running
 * balance per unit in code; `recordGrnAcceptances` inserts positive movements
 * and `reverseGrnMovements` inserts negated ones on cancel. This suite encodes
 * that pure summation as a spec and checks it nets correctly — most importantly
 * that a GRN acceptance followed by a cancel returns on-hand to its prior value.
 *
 * Convention under test: quantities are signed integers scaled ×1000. A receipt
 * is positive; an issue / reversal is negative. Display qty = scaledSum / 1000.
 */

interface Movement {
  itemId: string;
  unitId: string;
  /** Signed, scaled ×1000. Positive = into stock, negative = out. */
  qtyScaled: number;
}

const key = (m: Pick<Movement, "itemId" | "unitId">) => `${m.itemId}|${m.unitId}`;

/** Mirror of getStockByItem: net the ledger to one scaled total per (item, unit). */
function onHandByKey(movements: Movement[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of movements) {
    out.set(key(m), (out.get(key(m)) ?? 0) + m.qtyScaled);
  }
  return out;
}

/** Convenience: netted on-hand (in display units) for one item+unit. */
function onHand(movements: Movement[], itemId: string, unitId: string): number {
  return (onHandByKey(movements).get(`${itemId}|${unitId}`) ?? 0) / 1000;
}

/** Mirror of getItemLedger: running balance per unit over a chronological list. */
function runningBalance(movements: Movement[]): number[] {
  const balByUnit = new Map<string, number>();
  return movements.map((m) => {
    const next = (balByUnit.get(m.unitId) ?? 0) + m.qtyScaled;
    balByUnit.set(m.unitId, next);
    return next;
  });
}

/** Mirror of recordGrnAcceptances: only accepted (>0) lines with an itemId post. */
function grnAcceptanceMovements(
  itemId: string | null,
  unitId: string,
  acceptedQuantity: number,
): Movement[] {
  if (!itemId || acceptedQuantity <= 0) return [];
  return [{ itemId, unitId, qtyScaled: Math.round(acceptedQuantity * 1000) }];
}

/** Mirror of reverseGrnMovements: insert inverse rows so on-hand drops back. */
function reversalMovements(originals: Movement[]): Movement[] {
  return originals.map((m) => ({ ...m, qtyScaled: -m.qtyScaled }));
}

describe("stock on-hand — netting", () => {
  it("nets a sequence of in/out movements for one item+unit", () => {
    const movements: Movement[] = [
      { itemId: "item-A", unitId: "wh-1", qtyScaled: 100_000 }, // +100
      { itemId: "item-A", unitId: "wh-1", qtyScaled: -30_000 }, // -30
      { itemId: "item-A", unitId: "wh-1", qtyScaled: 5_000 }, //   +5
    ];
    expect(onHand(movements, "item-A", "wh-1")).toBe(75); // 100 - 30 + 5
  });

  it("keeps a row that nets to exactly zero (had 100, issued 100)", () => {
    const movements: Movement[] = [
      { itemId: "item-A", unitId: "wh-1", qtyScaled: 100_000 },
      { itemId: "item-A", unitId: "wh-1", qtyScaled: -100_000 },
    ];
    const netted = onHandByKey(movements);
    expect(netted.has("item-A|wh-1")).toBe(true); // present, not dropped
    expect(onHand(movements, "item-A", "wh-1")).toBe(0);
  });

  it("aggregates each (item, unit) independently — no cross-bleed", () => {
    const movements: Movement[] = [
      { itemId: "item-A", unitId: "wh-1", qtyScaled: 40_000 },
      { itemId: "item-A", unitId: "wh-2", qtyScaled: 10_000 }, // different warehouse
      { itemId: "item-B", unitId: "wh-1", qtyScaled: 7_000 }, //  different item
    ];
    expect(onHand(movements, "item-A", "wh-1")).toBe(40);
    expect(onHand(movements, "item-A", "wh-2")).toBe(10);
    expect(onHand(movements, "item-B", "wh-1")).toBe(7);
  });
});

describe("stock on-hand — running balance ledger", () => {
  it("produces a per-unit running balance after each movement", () => {
    const movements: Movement[] = [
      { itemId: "item-A", unitId: "wh-1", qtyScaled: 50_000 }, // bal 50
      { itemId: "item-A", unitId: "wh-1", qtyScaled: 25_000 }, // bal 75
      { itemId: "item-A", unitId: "wh-1", qtyScaled: -20_000 }, // bal 55
    ];
    expect(runningBalance(movements)).toEqual([50_000, 75_000, 55_000]);
  });

  it("tracks separate running balances per warehouse interleaved", () => {
    const movements: Movement[] = [
      { itemId: "item-A", unitId: "wh-1", qtyScaled: 10_000 }, // wh-1 -> 10
      { itemId: "item-A", unitId: "wh-2", qtyScaled: 3_000 }, //  wh-2 -> 3
      { itemId: "item-A", unitId: "wh-1", qtyScaled: 5_000 }, //  wh-1 -> 15
    ];
    expect(runningBalance(movements)).toEqual([10_000, 3_000, 15_000]);
  });
});

describe("stock on-hand — GRN acceptance then cancel returns to prior", () => {
  it("a GRN raises on-hand by the accepted qty; cancelling reverses it exactly", () => {
    const opening: Movement[] = [{ itemId: "item-A", unitId: "wh-1", qtyScaled: 20_000 }]; // 20 on hand
    const priorOnHand = onHand(opening, "item-A", "wh-1");
    expect(priorOnHand).toBe(20);

    // GRN accepts 12 units of item-A into wh-1
    const grnMoves = grnAcceptanceMovements("item-A", "wh-1", 12);
    const afterGrn = [...opening, ...grnMoves];
    expect(onHand(afterGrn, "item-A", "wh-1")).toBe(32); // 20 + 12

    // Cancel the GRN -> inverse rows appended
    const afterCancel = [...afterGrn, ...reversalMovements(grnMoves)];
    expect(onHand(afterCancel, "item-A", "wh-1")).toBe(priorOnHand); // back to 20
  });

  it("rejected-only lines (acceptedQuantity 0) never touch stock", () => {
    expect(grnAcceptanceMovements("item-A", "wh-1", 0)).toEqual([]);
  });

  it("free-text receipts without an itemId never touch stock", () => {
    expect(grnAcceptanceMovements(null, "wh-1", 5)).toEqual([]);
  });
});
