import { type ReactNode } from "react";

type StatusMeta = { label: string; className: string };

const PR_STATUS: Record<string, StatusMeta> = {
  draft:            { label: "Draft",        className: "badge-tint-lilac" },
  submitted:        { label: "Submitted",    className: "badge-info" },
  pending_l1:       { label: "Pending L1",   className: "badge-warning" },
  pending_l2:       { label: "L2 review",    className: "badge-tint-lilac" },
  escalated:        { label: "Escalated",    className: "badge-danger" },
  approved:         { label: "Approved",     className: "badge-success" },
  rejected:         { label: "Rejected",     className: "badge-danger" },
  cancelled:        { label: "Cancelled",    className: "badge-tint-blush" },
  converted_to_po:  { label: "→ PO",         className: "badge-tint-mint" },
};

const PO_STATUS: Record<string, StatusMeta> = {
  draft:               { label: "Draft",            className: "badge-tint-lilac" },
  pending_approval:    { label: "Pending approval", className: "badge-warning" },
  approved:            { label: "Approved",         className: "badge-success" },
  sent_to_vendor:      { label: "Sent",             className: "badge-info" },
  partially_received:  { label: "Partial GRN",      className: "badge-tint-peach" },
  received:            { label: "Received",         className: "badge-success" },
  closed:              { label: "Closed",           className: "badge-tint-mint" },
  cancelled:           { label: "Cancelled",        className: "badge-tint-blush" },
};

export function PrStatusBadge({ status }: { status: string }) {
  const meta = PR_STATUS[status] ?? { label: status, className: "badge-info" };
  return <span className={`badge ${meta.className}`}>{meta.label}</span>;
}

export function PoStatusBadge({ status }: { status: string }) {
  const meta = PO_STATUS[status] ?? { label: status, className: "badge-info" };
  return <span className={`badge ${meta.className}`}>{meta.label}</span>;
}

export function PriorityBadge({ priority }: { priority: string }): ReactNode {
  const map: Record<string, string> = {
    low:    "badge-tint-mint",
    normal: "badge-info",
    high:   "badge-warning",
    urgent: "badge-danger",
  };
  return <span className={`badge ${map[priority] ?? "badge-info"}`}>{priority}</span>;
}
