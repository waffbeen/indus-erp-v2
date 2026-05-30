import { type ReactNode } from "react";

/**
 * Shared tint maps + tiny badge components for the AP (invoices/payments)
 * module. Mirrors the StatusBadge vocabulary used elsewhere in the app.
 */

export const INVOICE_STATUS_TINT: Record<string, string> = {
  draft: "badge-tint-lilac",
  matched: "badge-tint-mint",
  price_variance: "badge-warning",
  qty_variance: "badge-tint-peach",
  unmatched: "badge-danger",
  approved: "badge-success",
  cancelled: "badge-tint-blush",
};

export const MATCH_TINT: Record<string, string> = {
  matched: "badge-success",
  price_variance: "badge-warning",
  qty_variance: "badge-tint-peach",
  unmatched: "badge-danger",
};

export const PAYMENT_STATUS_TINT: Record<string, string> = {
  unpaid: "badge-tint-blush",
  partial: "badge-warning",
  paid: "badge-success",
};

export const PAYMENT_RECORD_TINT: Record<string, string> = {
  draft: "badge-tint-lilac",
  posted: "badge-success",
  cancelled: "badge-tint-blush",
};

const human = (s: string) => s.replace(/_/g, " ");

export function InvoiceStatusBadge({ status }: { status: string }): ReactNode {
  return <span className={`badge ${INVOICE_STATUS_TINT[status] ?? "badge-info"} capitalize text-[10px]`}>{human(status)}</span>;
}

export function MatchBadge({ status }: { status: string }): ReactNode {
  return <span className={`badge ${MATCH_TINT[status] ?? "badge-info"} capitalize text-[10px]`}>{human(status)}</span>;
}

export function PaymentStatusBadge({ status }: { status: string }): ReactNode {
  return <span className={`badge ${PAYMENT_STATUS_TINT[status] ?? "badge-info"} capitalize text-[10px]`}>{human(status)}</span>;
}

export function PaymentRecordBadge({ status }: { status: string }): ReactNode {
  return <span className={`badge ${PAYMENT_RECORD_TINT[status] ?? "badge-info"} capitalize text-[10px]`}>{human(status)}</span>;
}
