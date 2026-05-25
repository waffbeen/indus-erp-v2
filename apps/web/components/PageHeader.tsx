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
    <div className="flex items-end justify-between gap-4 mb-6 pb-5 border-b border-border">
      <div className="min-w-0">
        <h1 className="display text-[28px] leading-tight text-text-default">{title}</h1>
        {subtitle && (
          <p className="text-sm font-medium mt-1.5" style={{ color: "var(--muted)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
