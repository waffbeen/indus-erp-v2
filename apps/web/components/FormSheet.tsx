"use client";
import { type ReactNode, useEffect } from "react";
import { Icon } from "./Icon";

/**
 * Modal-style full-page sheet for big forms (PO / GRN / PR-edit). Different
 * from <Modal> in that the form is a real Next.js page route — this is just
 * the visual chrome. Close button calls onClose (typically router.back()).
 *
 * Looks like a modal: dark backdrop, centered card, sticky title + footer,
 * scrollable body. Lets us re-use existing page-based form logic without
 * extracting it into a component.
 */
export function FormSheet({
  title,
  subtitle,
  onClose,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  // Lock body scroll while the sheet is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-3 modal-shell" role="dialog" aria-modal="true">
      <div className="absolute inset-0 modal-backdrop" onClick={onClose} aria-hidden="true" />

      <div
        className="relative w-full bg-bg overflow-hidden max-h-[calc(100vh-24px)] flex flex-col modal-panel"
        style={{ borderRadius: 10, maxWidth: "min(1500px, calc(100vw - 24px))" }}
      >
        {/* Sticky header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-border shrink-0">
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold tracking-tight text-text-default leading-tight truncate">{title}</h3>
            {subtitle && <p className="mt-1 text-[12px] text-muted leading-snug">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded grid place-items-center text-muted hover:bg-surface hover:text-text-default shrink-0"
            aria-label="Close"
          >
            <Icon name="X" size={15} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>

        {/* Sticky footer */}
        {footer && (
          <div className="px-5 py-3 border-t border-border bg-surface flex justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
