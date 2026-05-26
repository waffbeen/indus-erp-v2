"use client";
import { type ReactNode, useEffect } from "react";
import { Icon } from "./Icon";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
}

const SIZES = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  "2xl": "max-w-6xl",
} as const;

export function Modal({ open, onClose, title, description, children, footer, size = "md" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 modal-shell" role="dialog" aria-modal="true">
      {/* Backdrop — soft, dark, light blur */}
      <div className="absolute inset-0 modal-backdrop" onClick={onClose} aria-hidden="true" />

      {/* Panel — soft pop entrance */}
      <div
        className={`relative w-full ${SIZES[size]} bg-bg overflow-hidden max-h-[calc(100vh-32px)] flex flex-col modal-panel`}
        style={{ borderRadius: 10 }}
      >
        {/* Header — tight, dense, hairline border below */}
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-border shrink-0">
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold tracking-tight text-text-default leading-tight truncate">{title}</h3>
            {description && <p className="mt-1 text-[12px] text-muted leading-snug">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded grid place-items-center text-muted hover:bg-surface hover:text-text-default shrink-0"
            aria-label="Close"
          >
            <Icon name="X" size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="px-5 py-3 border-t border-border bg-surface flex justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
