"use client";
import { useEffect } from "react";
import { Icon, type IconProps } from "./Icon";
import { useToastStore, type Toast, type ToastTone } from "@/lib/toast";

const TONE_STYLE: Record<ToastTone, { bg: string; fg: string; iconBg: string; icon: IconProps["name"] }> = {
  success: { bg: "var(--tint-mint)",  fg: "var(--tint-mint-fg)",  iconBg: "rgba(255,255,255,0.6)", icon: "CircleCheckBig" },
  error:   { bg: "var(--tint-blush)", fg: "var(--tint-blush-fg)", iconBg: "rgba(255,255,255,0.6)", icon: "CircleX" },
  info:    { bg: "var(--tint-lilac)", fg: "var(--tint-lilac-fg)", iconBg: "rgba(255,255,255,0.6)", icon: "Info" },
  warning: { bg: "var(--tint-peach)", fg: "var(--tint-peach-fg)", iconBg: "rgba(255,255,255,0.6)", icon: "TriangleAlert" },
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2 pointer-events-none"
      style={{ maxWidth: "min(420px, calc(100vw - 32px))" }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const style = TONE_STYLE[toast.tone];

  useEffect(() => {
    const handle = window.setTimeout(() => dismiss(toast.id), toast.durationMs);
    return () => window.clearTimeout(handle);
  }, [toast.id, toast.durationMs, dismiss]);

  return (
    <div
      role="status"
      className="pointer-events-auto rounded-lg p-3 flex items-start gap-2.5 toast-enter shadow-md"
      style={{ background: style.bg, color: style.fg, border: "1px solid rgba(0,0,0,0.06)" }}
    >
      <div
        className="h-7 w-7 rounded-md grid place-items-center shrink-0"
        style={{ background: style.iconBg, color: style.fg }}
      >
        <Icon name={style.icon} size={15} />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="font-semibold text-[12.5px] leading-tight">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 text-[11.5px] opacity-85 leading-snug">{toast.description}</p>
        )}
      </div>
      <button
        onClick={() => dismiss(toast.id)}
        className="h-6 w-6 rounded grid place-items-center opacity-50 hover:opacity-100"
        aria-label="Dismiss"
        style={{ color: style.fg }}
      >
        <Icon name="X" size={12} />
      </button>
      <style jsx>{`
        .toast-enter {
          animation: toastIn 220ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes toastIn {
          from { transform: translate3d(20px, 0, 0); opacity: 0; }
          to   { transform: translate3d(0, 0, 0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
