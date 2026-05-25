import { z, type ZodSchema } from "zod";
import { ApiError } from "./api";

/**
 * Field-level errors keyed by dot-notation path.
 * Examples: "title", "items.0.itemName", "items.2.quantity"
 */
export type FieldErrors = Record<string, string>;

export interface FormErrorState {
  /** Top banner message (for non-field errors or summary). */
  summary: string | null;
  /** Per-field error map. */
  fields: FieldErrors;
}

export const emptyErrors: FormErrorState = { summary: null, fields: {} };

/** Run a Zod schema against input; return field-level errors if any. */
export function validate<T>(schema: ZodSchema<T>, input: unknown): { ok: true; data: T } | { ok: false; errors: FormErrorState } {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, errors: zodToFormErrors(result.error) };
}

/** Convert a Zod error to our field-error shape. */
export function zodToFormErrors(error: z.ZodError): FormErrorState {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    if (path && !fields[path]) {
      fields[path] = issue.message;
    }
  }
  const summary = Object.keys(fields).length === 1
    ? Object.values(fields)[0]!
    : `${Object.keys(fields).length} fields need attention`;
  return { summary, fields };
}

/** Convert an ApiError (server response) to our field-error shape. */
export function apiErrorToFormErrors(err: unknown): FormErrorState {
  if (err instanceof ApiError) {
    const details = err.details as { fieldErrors?: Record<string, string[] | string>; formErrors?: string[] } | undefined;
    const fields: FieldErrors = {};
    if (details?.fieldErrors) {
      for (const [k, v] of Object.entries(details.fieldErrors)) {
        const msg = Array.isArray(v) ? v[0] : String(v);
        if (msg) fields[k] = msg;
      }
    }
    if (Object.keys(fields).length > 0) {
      return {
        summary: Object.keys(fields).length === 1 ? Object.values(fields)[0]! : err.message,
        fields,
      };
    }
    return { summary: err.message, fields: {} };
  }
  return { summary: err instanceof Error ? err.message : "Something went wrong", fields: {} };
}

/** Combine client and server errors (server wins on overlap). */
export function mergeErrors(a: FormErrorState, b: FormErrorState): FormErrorState {
  return {
    summary: b.summary ?? a.summary,
    fields: { ...a.fields, ...b.fields },
  };
}

/** Look up error for a specific path. Supports prefix matching for nested rows. */
export function fieldError(errors: FieldErrors, path: string): string | undefined {
  return errors[path];
}
