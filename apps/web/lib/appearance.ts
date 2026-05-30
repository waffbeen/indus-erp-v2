"use client";
import { create } from "zustand";

export type Layout = "editorial" | "floating" | "topnav";
export type Accent = "emerald" | "plum" | "clay" | "ink";
export type Mode = "light" | "dark";
export interface Appearance {
  layout: Layout;
  accent: Accent;
  mode: Mode;
}

const KEY = "indus.appearance";
const DEFAULT: Appearance = { layout: "editorial", accent: "emerald", mode: "light" };

const LAYOUTS: Layout[] = ["editorial", "floating", "topnav"];
const ACCENTS: Accent[] = ["emerald", "plum", "clay", "ink"];

function read(): Appearance {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const a = JSON.parse(window.localStorage.getItem(KEY) || "{}");
    return {
      layout: LAYOUTS.includes(a.layout) ? a.layout : DEFAULT.layout,
      accent: ACCENTS.includes(a.accent) ? a.accent : DEFAULT.accent,
      mode: a.mode === "dark" ? "dark" : "light",
    };
  } catch {
    return DEFAULT;
  }
}

function apply(a: Appearance) {
  if (typeof document === "undefined") return;
  const d = document.documentElement;
  d.setAttribute("data-layout", a.layout);
  d.setAttribute("data-accent", a.accent);
  d.setAttribute("data-mode", a.mode);
}

interface AppearanceStore extends Appearance {
  hydrated: boolean;
  /** Read saved appearance from localStorage and apply to <html>. Call once on mount. */
  hydrate: () => void;
  /** Update one or more facets; persists + applies immediately. */
  update: (patch: Partial<Appearance>) => void;
}

export const useAppearance = create<AppearanceStore>((set, get) => ({
  ...DEFAULT,
  hydrated: false,
  hydrate: () => {
    const a = read();
    apply(a);
    set({ ...a, hydrated: true });
  },
  update: (patch) => {
    const next: Appearance = {
      layout: get().layout,
      accent: get().accent,
      mode: get().mode,
      ...patch,
    };
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    apply(next);
    set({ ...next });
  },
}));
