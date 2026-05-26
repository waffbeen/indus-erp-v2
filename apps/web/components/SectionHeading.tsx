import { type ReactNode } from "react";

/**
 * In-card section header. Title is a clean sentence-case label (no uppercase
 * tracking — that looked cheap at the new small sizes). Accent strip on the
 * left ties it visually to the primary color without being loud.
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
  const titleSize = size === "lg" ? "text-[14px]" : size === "sm" ? "text-[12px]" : "text-[13px]";
  return (
    <div className="flex items-center justify-between gap-3 pb-2.5 mb-3 border-b border-border">
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className="h-4 w-[3px] rounded-sm shrink-0"
          style={{ background: "var(--primary)" }}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h3 className={`${titleSize} font-semibold tracking-tight text-text-default leading-none`}>
            {title}
          </h3>
          {subtitle && <p className="text-[11.5px] text-muted mt-1 truncate leading-tight">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex items-center gap-1.5 shrink-0">{action}</div>}
    </div>
  );
}
