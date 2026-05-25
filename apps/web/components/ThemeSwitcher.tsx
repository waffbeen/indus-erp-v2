"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";

const THEMES = [
  { key: "circle", label: "Circle" },
  { key: "starline", label: "Starline" },
] as const;

const STORAGE_KEY = "indus.theme";

/**
 * Demonstrates global theming. Sets <body data-theme="...">.
 * All CSS in packages/ui/tokens responds via the [data-theme] selector.
 */
export function ThemeSwitcher() {
  const [active, setActive] = useState<string>("circle");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && THEMES.some((t) => t.key === stored)) {
      setActive(stored);
      document.body.setAttribute("data-theme", stored);
    }
  }, []);

  const handlePick = (key: string) => {
    setActive(key);
    document.body.setAttribute("data-theme", key);
    window.localStorage.setItem(STORAGE_KEY, key);
  };

  return (
    <div className="inline-flex items-center gap-1 bg-surface rounded-pill p-1">
      {THEMES.map((t) => (
        <button
          key={t.key}
          onClick={() => handlePick(t.key)}
          className={clsx(
            "px-3 py-1.5 rounded-pill text-[11px] font-semibold transition",
            active === t.key
              ? "bg-bg text-text-default shadow-sm"
              : "text-muted hover:text-text-default",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
