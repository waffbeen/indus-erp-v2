type StatusMeta = { label: string; className: string };

const RFQ_STATUS: Record<string, StatusMeta> = {
  draft:     { label: "Draft",     className: "badge-tint-lilac" },
  sent:      { label: "Sent",      className: "badge-info" },
  closed:    { label: "Closed",    className: "badge-tint-peach" },
  awarded:   { label: "Awarded",   className: "badge-success" },
  cancelled: { label: "Cancelled", className: "badge-tint-blush" },
};

export function RfqStatusBadge({ status }: { status: string }) {
  const meta = RFQ_STATUS[status] ?? { label: status, className: "badge-info" };
  return <span className={`badge ${meta.className}`}>{meta.label}</span>;
}
