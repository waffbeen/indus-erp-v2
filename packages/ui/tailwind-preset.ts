import type { Config } from "tailwindcss";

/**
 * Shared Tailwind preset — maps utility classes to the CSS variables
 * defined in `packages/ui/tokens/*.css`. Apps extend this preset.
 *
 * IMPORTANT: never add hex literals here. Every color must be a `var(--...)`
 * so theme swap works.
 */

export const indusPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        // Brand
        frame: "var(--frame)",
        "frame-2": "var(--frame-2)",
        primary: "var(--primary)",
        "primary-hover": "var(--primary-hover)",
        "primary-fg": "var(--primary-fg)",

        // Surfaces
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",

        // Text
        "text-default": "var(--text)",
        muted: "var(--muted)",
        "muted-2": "var(--muted-2)",
        "on-dark": "var(--text-on-dark)",

        // Tints
        "tint-teal": "var(--tint-teal)",
        "tint-teal-2": "var(--tint-teal-2)",
        "tint-teal-fg": "var(--tint-teal-fg)",
        "tint-peach": "var(--tint-peach)",
        "tint-peach-2": "var(--tint-peach-2)",
        "tint-peach-fg": "var(--tint-peach-fg)",
        "tint-sand": "var(--tint-sand)",
        "tint-sand-fg": "var(--tint-sand-fg)",
        "tint-mint": "var(--tint-mint)",
        "tint-mint-fg": "var(--tint-mint-fg)",
        "tint-lilac": "var(--tint-lilac)",
        "tint-lilac-fg": "var(--tint-lilac-fg)",
        "tint-blush": "var(--tint-blush)",
        "tint-blush-fg": "var(--tint-blush-fg)",

        // Accents
        "accent-orange": "var(--accent-orange)",
        "accent-orange-fg": "var(--accent-orange-fg)",

        // Status
        success: "var(--success)",
        "success-bg": "var(--success-bg)",
        "success-fg": "var(--success-fg)",
        warning: "var(--warning)",
        "warning-bg": "var(--warning-bg)",
        "warning-fg": "var(--warning-fg)",
        danger: "var(--danger)",
        "danger-bg": "var(--danger-bg)",
        "danger-fg": "var(--danger-fg)",
        info: "var(--info)",
        "info-bg": "var(--info-bg)",
        "info-fg": "var(--info-fg)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius-md)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow-md)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        dark: "var(--shadow-dark)",
      },
      fontFamily: {
        sans: "var(--font-sans)" as unknown as string[],
        mono: "var(--font-mono)" as unknown as string[],
      },
      letterSpacing: {
        tightish: "var(--tracking-tight)",
        display: "var(--tracking-display)",
      },
      transitionTimingFunction: {
        out: "var(--ease-out)",
        spring: "var(--ease-spring)",
      },
      transitionDuration: {
        fast: "120ms",
        normal: "200ms",
        slow: "320ms",
      },
    },
  },
};

export default indusPreset;
