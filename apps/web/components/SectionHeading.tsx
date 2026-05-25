import { type ReactNode } from "react";

/**
 * Clear section header inside cards / pages.
 *   - Accent vertical stripe on the left (primary color)
 *   - Bold dark title (not muted)
 *   - Optional subtitle / right-side action slot
 *   - Built-in bottom border for visual separation
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
  const titleSize = size === "lg" ? "text-base" : size === "sm" ? "text-xs" : "text-sm";
  return (
    <div className="flex items-center justify-between gap-3 pb-3 mb-4 border-b border-border">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="h-5 w-1 rounded-full shrink-0"
          style={{ background: "var(--primary)" }}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h3 className={`${titleSize} font-bold uppercase tracking-wider text-text-default`}>{title}</h3>
          {subtitle && <p className="text-xs text-muted mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
    </div>
  );
}
