import jwt, { type SignOptions } from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import { env } from "../config/env";
import { Unauthorized } from "./errors";

/**
 * Access tokens are short-lived (15min default), stateless JWT.
 * Refresh tokens are long-lived (7d default), STORED HASHED in the sessions
 * table so we can revoke them (logout, password change).
 *
 * The raw refresh token never lives on the server side — only its SHA-256 hash.
 */

export interface AccessTokenPayload {
  sub: string;            // user id
  tid: string;            // tenant id
  tsl: string;            // tenant slug
  sa: boolean;            // is super admin
  ta: boolean;            // is tenant admin
  jti: string;            // unique token id (for tracing in logs)
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;            // session id in DB
  jti: string;
}

export function signAccessToken(payload: Omit<AccessTokenPayload, "jti">): { token: string; expiresAt: Date } {
  const jti = randomBytes(8).toString("hex");
  const options: SignOptions = { expiresIn: env.JWT_ACCESS_TTL as SignOptions["expiresIn"] };
  const token = jwt.sign({ ...payload, jti }, env.JWT_ACCESS_SECRET, options);
  const decoded = jwt.decode(token) as { exp: number };
  return { token, expiresAt: new Date(decoded.exp * 1000) };
}

export function signRefreshToken(payload: Omit<RefreshTokenPayload, "jti">): {
  token: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const jti = randomBytes(12).toString("hex");
  const options: SignOptions = { expiresIn: env.JWT_REFRESH_TTL as SignOptions["expiresIn"] };
  const token = jwt.sign({ ...payload, jti }, env.JWT_REFRESH_SECRET, options);
  const decoded = jwt.decode(token) as { exp: number };
  return {
    token,
    tokenHash: hashRefreshToken(token),
    expiresAt: new Date(decoded.exp * 1000),
  };
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  } catch {
    throw Unauthorized("invalid_token", "Access token is invalid or expired");
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
  } catch {
    throw Unauthorized("invalid_refresh", "Refresh token is invalid or expired");
  }
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
