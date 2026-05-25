/** Format paise (stored as string for big-int safety) as ₹ amount with grouping. */
export function paiseToINR(paise: string | number | null | undefined, opts: { withSymbol?: boolean } = {}): string {
  if (paise === null || paise === undefined) return "—";
  const value = typeof paise === "string" ? Number(paise) : paise;
  if (!Number.isFinite(value)) return "—";
  const rupees = value / 100;
  const formatted = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: rupees % 1 === 0 ? 0 : 2,
  }).format(rupees);
  return opts.withSymbol === false ? formatted : `₹${formatted}`;
}

/** Compact amount: ₹12.4L for big numbers. */
export function paiseToCompactINR(paise: string | number | null | undefined): string {
  if (paise === null || paise === undefined) return "—";
  const value = typeof paise === "string" ? Number(paise) : paise;
  if (!Number.isFinite(value)) return "—";
  const rupees = value / 100;
  if (rupees >= 10_000_000) return `₹${(rupees / 10_000_000).toFixed(rupees % 10_000_000 === 0 ? 0 : 2)}Cr`;
  if (rupees >= 100_000)   return `₹${(rupees / 100_000).toFixed(rupees % 100_000 === 0 ? 0 : 1)}L`;
  if (rupees >= 1_000)     return `₹${(rupees / 1_000).toFixed(rupees % 1_000 === 0 ? 0 : 1)}k`;
  return `₹${new Intl.NumberFormat("en-IN").format(rupees)}`;
}

/** Quantity stored as integer (qty * 1000) → human number. */
export function quantityScaledToHuman(scaled: number | null | undefined): string {
  if (scaled === null || scaled === undefined) return "—";
  const value = scaled / 1000;
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 3,
    minimumFractionDigits: value % 1 === 0 ? 0 : 0,
  }).format(value);
}

/** ISO datetime → "2 May 2026, 3:45 PM" */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Relative time: "2 hours ago", "Yesterday", "Tomorrow". */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (Math.abs(diff) < 60) return "just now";
  if (Math.abs(diff) < 3600) return `${Math.round(diff / 60)}m ago`;
  if (Math.abs(diff) < 86400) return `${Math.round(diff / 3600)}h ago`;
  if (Math.abs(diff) < 7 * 86400) return `${Math.round(diff / 86400)}d ago`;
  return formatDate(iso);
}
