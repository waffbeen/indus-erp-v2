import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import { env } from "../config/env";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // Zod validation failure → 400 with field-level details
  if (err instanceof ZodError) {
    res.status(400).json({
      code: "validation_failed",
      message: "Request validation failed",
      details: err.flatten().fieldErrors,
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger.error({ err, path: req.path }, "app_error_5xx");
    } else {
      logger.warn({ err: { code: err.code, message: err.message }, path: req.path }, "app_error_4xx");
    }
    res.status(err.status).json({
      code: err.code,
      message: err.message,
      details: err.details,
    });
    return;
  }

  // Unexpected — log full detail, return generic 500
  logger.error({ err, path: req.path }, "unhandled_error");
  res.status(500).json({
    code: "internal_error",
    message: env.NODE_ENV === "production" ? "Something went wrong" : (err as Error).message,
  });
};

export const notFoundHandler = (req: any, res: any) => {
  res.status(404).json({
    code: "not_found",
    message: `No route matches ${req.method} ${req.path}`,
  });
};
