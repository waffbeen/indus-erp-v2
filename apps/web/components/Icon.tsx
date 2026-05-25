import { icons, type LucideProps } from "lucide-react";

/**
 * Single icon component used everywhere. Wraps lucide-react so we can:
 *   1. Enforce default size/stroke (matches the design system base.css)
 *   2. Swap icon libraries later without touching call sites
 */
export interface IconProps extends Omit<LucideProps, "ref"> {
  name: keyof typeof icons;
}

export function Icon({ name, size = 18, strokeWidth = 1.75, ...rest }: IconProps) {
  const LucideIcon = icons[name];
  if (!LucideIcon) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(`Icon "${String(name)}" not found in lucide-react`);
    }
    return null;
  }
  return <LucideIcon size={size} strokeWidth={strokeWidth} {...rest} />;
}
