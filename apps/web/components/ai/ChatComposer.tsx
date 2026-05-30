"use client";
import { useRef, type KeyboardEvent } from "react";
import { Icon } from "@/components/Icon";

/**
 * The message input row for the AI assistant. Auto-grows up to a few lines,
 * sends on Enter (Shift+Enter inserts a newline), and disables while a reply
 * is in flight.
 */
export function ChatComposer({
  value,
  onChange,
  onSend,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  disabled: boolean;
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
  }

  function autoGrow() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }

  return (
    <div className="flex items-end gap-2">
      <textarea
        ref={taRef}
        className="input flex-1 resize-none"
        rows={1}
        placeholder="Ask about your POs, requisitions, vendors or spend…"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          autoGrow();
        }}
        onKeyDown={handleKeyDown}
      />
      <button
        type="button"
        className="btn btn-primary shrink-0"
        style={{ height: 36 }}
        disabled={disabled || !value.trim()}
        onClick={() => {
          if (!disabled && value.trim()) onSend();
        }}
        aria-label="Send message"
      >
        <Icon name="Send" size={14} />
      </button>
    </div>
  );
}
