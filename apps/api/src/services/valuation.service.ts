import { eq, and, lte, inArray, asc } from "drizzle-orm";
import { db } from "../db/index";
import { stockMovements } from "../db/schema/stock";
import { items } from "../db/schema/items";
import { units } from "../db/schema/units";

/**
 * Stock valuation, computed entirely from the append-only stock-movement
 * ledger — we never store a cached "stock value" anywhere, so the report is
 * always consistent with the ledger.
 *
 * Two costing methods are derived per (item, unit) from the row-level history:
 *
 *   Weighted Average (default)
 *     avgCost = Σ(inflow qty × inflow price) / Σ(inflow qty)
 *     A simple average of every receipt's price, weighted by quantity.
 *
 *   FIFO
 *     Replay the ledger oldest-first. Inflows push a {qty, price} layer; each
 *     outflow consumes from the oldest layer first. Whatever layers remain are
 *     the on-hand stock, valued at the price they came in at.
 *
 * Money is paise; quantities are ×1000 scaled. We compute per-line value in
 * paise as round(qtyScaled / 1000 × pricePaise) and keep paise as integers.
 */

type Method = "wac" | "fifo";

interface MovementRow {
  itemId: string;
  unitId: string;
  uom: string;
  qtyScaled: number;
  unitPricePaise: number;
  createdAt: Date;
}

interface Layer {
  qtyScaled: number; // remaining qty in this receipt layer
  pricePaise: number; // price per (whole) unit
}

function paiseForQty(qtyScaled: number, pricePaise: number): number {
  // qtyScaled is ×1000; price is per whole unit → divide by 1000.
  return Math.round((qtyScaled / 1000) * pricePaise);
}

/** Weighted-average unit cost (paise per whole unit) from the inflow lines. */
function weightedAverageCost(rows: MovementRow[]): number {
  let qtyIn = 0;
  let valueIn = 0;
  for (const r of rows) {
    if (r.qtyScaled > 0) {
      qtyIn += r.qtyScaled;
      valueIn += paiseForQty(r.qtyScaled, r.unitPricePaise);
    }
  }
  if (qtyIn <= 0) return 0;
  // valueIn paise over qtyIn (×1000 units) → paise per whole unit.
  return Math.round((valueIn / qtyIn) * 1000);
}

/** Replay FIFO; return the closing on-hand value in paise from remaining layers. */
function fifoClosingValuePaise(rows: MovementRow[]): number {
  const layers: Layer[] = [];
  for (const r of rows) {
    if (r.qtyScaled > 0) {
      layers.push({ qtyScaled: r.qtyScaled, pricePaise: r.unitPricePaise });
    } else if (r.qtyScaled < 0) {
      let toConsume = -r.qtyScaled;
      while (toConsume > 0 && layers.length > 0) {
        const head = layers[0]!;
        if (head.qtyScaled <= toConsume) {
          toConsume -= head.qtyScaled;
          layers.shift();
        } else {
          head.qtyScaled -= toConsume;
          toConsume = 0;
        }
      }
      // If outflows exceed all layers (negative on-hand from adjustments), the
      // remaining shortfall has no cost basis — ignore it for valuation.
    }
  }
  return layers.reduce((sum, l) => sum + paiseForQty(l.qtyScaled, l.pricePaise), 0);
}

export interface ValuationRow {
  itemId: string;
  itemName: string;
  itemCode: string | null;
  itemGroupName: string | null;
  unitId: string;
  unitName: string;
  uom: string;
  onHandQty: number;
  wacUnitCostPaise: number;
  fifoUnitCostPaise: number;
  /** Closing value (paise) under the *selected* method. */
  valuePaise: number;
}

export async function getStockValuation(
  tenantId: string,
  opts: { unitId?: string; itemGroup?: string; method?: Method; asOf?: string } = {},
) {
  const method: Method = opts.method === "fifo" ? "fifo" : "wac";

  const conds = [eq(stockMovements.tenantId, tenantId)];
  if (opts.unitId) conds.push(eq(stockMovements.unitId, opts.unitId));
  if (opts.asOf) {
    const d = new Date(opts.asOf);
    if (!Number.isNaN(d.getTime())) conds.push(lte(stockMovements.createdAt, d));
  }

  // Row-level pull, oldest-first so FIFO replay is correct.
  const movements = await db
    .select({
      itemId: stockMovements.itemId,
      unitId: stockMovements.unitId,
      uom: stockMovements.uom,
      qtyScaled: stockMovements.qtyScaled,
      unitPricePaise: stockMovements.unitPricePaise,
      createdAt: stockMovements.createdAt,
    })
    .from(stockMovements)
    .where(and(...conds))
    .orderBy(asc(stockMovements.createdAt));

  if (movements.length === 0) {
    return { method, rows: [] as ValuationRow[], totals: { onHandValuePaise: 0, itemCount: 0, positions: 0 } };
  }

  // Bucket by item+unit.
  const buckets = new Map<string, MovementRow[]>();
  for (const m of movements) {
    const key = `${m.itemId}__${m.unitId}`;
    const row: MovementRow = {
      itemId: m.itemId,
      unitId: m.unitId,
      uom: m.uom,
      qtyScaled: m.qtyScaled,
      unitPricePaise: Number(m.unitPricePaise) || 0,
      createdAt: m.createdAt,
    };
    const arr = buckets.get(key);
    if (arr) arr.push(row);
    else buckets.set(key, [row]);
  }

  // Enrich with item + unit names (single fetch each).
  const itemIds = Array.from(new Set(movements.map((m) => m.itemId)));
  const unitIds = Array.from(new Set(movements.map((m) => m.unitId)));
  const [itemRows, unitRows] = await Promise.all([
    db
      .select({ id: items.id, name: items.name, code: items.code, itemGroupName: items.itemGroupName })
      .from(items)
      .where(inArray(items.id, itemIds)),
    db.select({ id: units.id, name: units.name }).from(units).where(inArray(units.id, unitIds)),
  ]);
  const itemMap = new Map(itemRows.map((i) => [i.id, i]));
  const unitMap = new Map(unitRows.map((u) => [u.id, u]));

  const group = opts.itemGroup?.trim().toLowerCase();

  const rows: ValuationRow[] = [];
  for (const bucket of buckets.values()) {
    const first = bucket[0]!;
    const it = itemMap.get(first.itemId);
    if (group && (it?.itemGroupName ?? "").toLowerCase() !== group) continue;

    const onHandScaled = bucket.reduce((s, r) => s + r.qtyScaled, 0);
    const onHandQty = onHandScaled / 1000;

    const wacUnitCostPaise = weightedAverageCost(bucket);
    const wacValuePaise = paiseForQty(onHandScaled, wacUnitCostPaise);
    const fifoValuePaise = fifoClosingValuePaise(bucket);
    const fifoUnitCostPaise =
      onHandScaled > 0 ? Math.round((fifoValuePaise / onHandScaled) * 1000) : 0;

    const valuePaise = method === "fifo" ? fifoValuePaise : wacValuePaise;

    rows.push({
      itemId: first.itemId,
      itemName: it?.name ?? "—",
      itemCode: it?.code ?? null,
      itemGroupName: it?.itemGroupName ?? null,
      unitId: first.unitId,
      unitName: unitMap.get(first.unitId)?.name ?? "—",
      uom: first.uom,
      onHandQty,
      wacUnitCostPaise,
      fifoUnitCostPaise,
      valuePaise,
    });
  }

  // Highest value first.
  rows.sort((a, b) => b.valuePaise - a.valuePaise);

  const onHandValuePaise = rows.reduce((s, r) => s + r.valuePaise, 0);
  const itemCount = new Set(rows.map((r) => r.itemId)).size;

  return { method, rows, totals: { onHandValuePaise, itemCount, positions: rows.length } };
}
