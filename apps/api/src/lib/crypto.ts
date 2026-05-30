import crypto from "node:crypto";
import { env } from "../config/env";

/**
 * Symmetric encryption for secrets stored at rest — currently per-tenant AI
 * provider API keys (`tenant_ai_settings.api_key_cipher`).
 *
 * AES-256-GCM (authenticated). The 32-byte key is derived (SHA-256) from
 * `AI_KEY_SECRET`, falling back to `JWT_ACCESS_SECRET` (always present, >=32
 * chars). NOTE: rotating that secret makes existing ciphertexts undecryptable —
 * tenants must re-enter their keys after a rotation. The ciphertext format is
 * `ivBase64:tagBase64:dataBase64`.
 */

const DERIVED_KEY = crypto
  .createHash("sha256")
  .update(env.AI_KEY_SECRET || env.JWT_ACCESS_SECRET)
  .digest();

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", DERIVED_KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("malformed_ciphertext");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    DERIVED_KEY,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return dec.toString("utf8");
}

/** Last 4 characters of a secret — safe to surface in the UI for "…key ending 1234". */
export function last4(secret: string): string {
  return secret.length <= 4 ? secret : secret.slice(-4);
}
