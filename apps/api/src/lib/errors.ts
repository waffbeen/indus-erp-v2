/**
 * Typed app errors. Throwing one of these inside a route or service is the
 * normal way to signal a client-facing failure. The errorHandler middleware
 * converts AppError → JSON response with status code.
 *
 * For unexpected throws (DB connection died, etc.), errorHandler logs and
 * returns a generic 500. Never expose stack traces to clients.
 */

export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const BadRequest = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(400, code, message, details);

export const Unauthorized = (code = "unauthorized", message = "Authentication required") =>
  new AppError(401, code, message);

export const Forbidden = (code = "forbidden", message = "You do not have permission to do that") =>
  new AppError(403, code, message);

export const NotFound = (code = "not_found", message = "Resource not found") =>
  new AppError(404, code, message);

export const Conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(409, code, message, details);

export const TooManyRequests = (message = "Rate limit exceeded") =>
  new AppError(429, "rate_limited", message);

export const InternalError = (message = "Something went wrong") =>
  new AppError(500, "internal_error", message);
