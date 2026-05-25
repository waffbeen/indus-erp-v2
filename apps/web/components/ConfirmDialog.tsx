"use client";
import { type ReactNode, useState } from "react";
import { Icon, type IconProps } from "./Icon";
import { Modal } from "./Modal";

type Tone = "danger" | "warning" | "primary" | "success";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
}

const TONE: Record<Tone, { iconName: IconProps["name"]; iconBg: string; iconFg: string; btnClass: string }> = {
  danger:  { iconName: "AlertTriangle", iconBg: "var(--tint-blush)", iconFg: "var(--tint-blush-fg)", btnClass: "btn-danger" },
  warning: { iconName: "AlertCircle",   iconBg: "var(--tint-peach)", iconFg: "var(--tint-peach-fg)", btnClass: "btn-primary" },
  primary: { iconName: "Info",          iconBg: "var(--tint-lilac)", iconFg: "var(--tint-lilac-fg)", btnClass: "btn-primary" },
  success: { iconName: "CheckCircle2",  iconBg: "var(--tint-mint)",  iconFg: "var(--tint-mint-fg)",  btnClass: "btn-primary" },
};

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary",
}: Props) {
  const [loading, setLoading] = useState(false);
  const style = TONE[tone];

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onClose}
      title={title}
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </button>
          <button type="button" className={`btn ${style.btnClass}`} onClick={handleConfirm} disabled={loading}>
            {loading ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        <div
          className="h-12 w-12 rounded-2xl grid place-items-center shrink-0"
          style={{ background: style.iconBg, color: style.iconFg }}
        >
          <Icon name={style.iconName} size={22} />
        </div>
        {description && (
          <div className="flex-1 pt-1 text-sm text-muted leading-relaxed">
            {description}
          </div>
        )}
      </div>
    </Modal>
  );
}
