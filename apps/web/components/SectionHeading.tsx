import { type ReactNode } from "react";

/**
 * Dense in-card section header. Uppercase label + thin underline keeps the
 * visual weight low so the data underneath stays the hero.
 */
export function SectionHeading({
  title,
  subtitle,
  action,
  size = "md",
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const titleSize = size === "lg" ? "text-[13px]" : size === "sm" ? "text-[10px]" : "text-[11px]";
  return (
    <div className="flex items-center justify-between gap-3 pb-2 mb-3 border-b border-border">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="h-3.5 w-0.5 shrink-0"
          style={{ background: "var(--primary)" }}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h3 className={`${titleSize} font-bold uppercase tracking-wider text-text-default leading-none`}>
            {title}
          </h3>
          {subtitle && <p className="text-[11px] text-muted mt-0.5 truncate leading-tight">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex items-center gap-1.5 shrink-0">{action}</div>}
    </div>
  );
}
