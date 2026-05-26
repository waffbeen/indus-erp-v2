import { type ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3 pb-3 border-b border-border">
      <div className="min-w-0">
        <h1 className="text-[15px] font-semibold leading-tight text-text-default truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[12px] mt-0.5 leading-snug" style={{ color: "var(--muted)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
    </div>
  );
}
