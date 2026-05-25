import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type AccessTokenPayload } from "../lib/jwt";
import { Unauthorized } from "../lib/errors";

/**
 * Express request augmentation. Once requireAuth has run, `req.auth` is
 * populated with the validated JWT payload. Downstream code reads from it.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AccessTokenPayload;
      tenant?: { id: string; slug: string; status: string };
    }
  }
}

/** Reads the bearer token, validates it, attaches to req.auth. Throws 401 if missing/invalid. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) {
    return next(Unauthorized("missing_token", "Authorization header missing or malformed"));
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    return next(Unauthorized("missing_token", "Authorization header missing or malformed"));
  }
  try {
    req.auth = verifyAccessToken(token);
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Optional auth — if token present and valid, populate req.auth. Don't fail if absent. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) return next();
  try {
    req.auth = verifyAccessToken(header.slice("Bearer ".length).trim());
  } catch {
    /* swallow — treat as anonymous */
  }
  return next();
}

/** Gate routes to super-admin only (us, the SaaS operator). */
export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(Unauthorized());
  if (!req.auth.sa) {
    return next(Unauthorized("not_super_admin", "Super admin access required"));
  }
  return next();
}
