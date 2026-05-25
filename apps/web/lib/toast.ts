"use client";
import { create } from "zustand";

export type ToastTone = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  durationMs: number;
}

interface ToastStore {
  toasts: Toast[];
  show: (input: Omit<Toast, "id" | "durationMs"> & { durationMs?: number }) => string;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  show: ({ durationMs, ...rest }) => {
    const id = Math.random().toString(36).slice(2, 10);
    set((s) => ({ toasts: [...s.toasts, { id, durationMs: durationMs ?? 3500, ...rest }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Imperative API — call from event handlers, services, etc. */
export const toast = {
  success: (title: string, description?: string) =>
    useToastStore.getState().show({ tone: "success", title, description }),
  error: (title: string, description?: string) =>
    useToastStore.getState().show({ tone: "error", title, description, durationMs: 5000 }),
  info: (title: string, description?: string) =>
    useToastStore.getState().show({ tone: "info", title, description }),
  warning: (title: string, description?: string) =>
    useToastStore.getState().show({ tone: "warning", title, description }),
};
