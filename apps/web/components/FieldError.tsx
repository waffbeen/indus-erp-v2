/** Inline error caption shown below an input. */
export function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="mt-1 text-xs font-medium" style={{ color: "var(--danger-fg)" }}>
      {error}
    </p>
  );
}

/** Apply red border + error caption to wrap an input. */
export function fieldClass(error?: string, base = "input"): string {
  return error ? `${base} !border-danger-fg focus:!border-danger-fg` : base;
}
