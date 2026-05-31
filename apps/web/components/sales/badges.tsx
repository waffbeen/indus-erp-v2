import { type ReactNode } from "react";

/**
 * Status badges for the Sales / Distribution module — the sell-side mirror of
 * components/invoices/badges.tsx. Same StatusBadge vocabulary as the rest of
 * the app so buy-side and sell-side feel coherent.
 */

export const SO_STATUS_TINT: Record<string, string> = {
  draft: "badge-tint-lilac",
  pending_approval: "badge-warning",
  approved: "badge-success",
  partially_fulfilled: "badge-tint-peach",
  fulfilled: "badge-tint-mint",
  closed: "badge-info",
  cancelled: "badge-tint-blush",
};

export const SO_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  partially_fulfilled: "Partial",
  fulfilled: "Fulfilled",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const SALES_INVOICE_STATUS_TINT: Record<string, string> = {
  draft: "badge-tint-lilac",
  issued: "badge-info",
  partially_paid: "badge-warning",
  paid: "badge-success",
  cancelled: "badge-tint-blush",
};

export const PAYMENT_STATUS_TINT: Record<string, string> = {
  unpaid: "badge-tint-blush",
  partial: "badge-warning",
  paid: "badge-success",
};

const human = (s: string) => s.replace(/_/g, " ");

export function SalesOrderStatusBadge({ status }: { status: string }): ReactNode {
  return (
    <span className={`badge ${SO_STATUS_TINT[status] ?? "badge-info"}`}>
      {SO_STATUS_LABEL[status] ?? human(status)}
    </span>
  );
}

export function SalesInvoiceStatusBadge({ status }: { status: string }): ReactNode {
  return (
    <span className={`badge ${SALES_INVOICE_STATUS_TINT[status] ?? "badge-info"} capitalize text-[10px]`}>
      {human(status)}
    </span>
  );
}

export function ReceiptStatusBadge({ status }: { status: string }): ReactNode {
  return (
    <span className={`badge ${PAYMENT_STATUS_TINT[status] ?? "badge-info"} capitalize text-[10px]`}>
      {human(status)}
    </span>
  );
}
