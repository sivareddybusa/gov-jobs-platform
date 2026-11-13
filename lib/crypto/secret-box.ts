import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for secrets stored in the database (LLM API keys).
 * The master key lives only in the server environment (APP_ENCRYPTION_KEY, 32
 * random bytes, base64) — never in the database, never sent to the browser.
 * Format: v1.<iv>.<tag>.<ciphertext> (base64url). GCM authenticates, so a
 * tampered value fails to decrypt instead of yielding garbage.
 */
export class SecretBoxError extends Error {}

function loadKey(keyB64?: string): Buffer {
  const raw = keyB64 ?? process.env["APP_ENCRYPTION_KEY"];
  if (!raw) throw new SecretBoxError("APP_ENCRYPTION_KEY is not configured.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new SecretBoxError("APP_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  }
  return key;
}

export function isEncryptionConfigured(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string, keyB64?: string): string {
  const key = loadKey(keyB64);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, ct]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function decryptSecret(payload: string, keyB64?: string): string {
  const key = loadKey(keyB64);
  const [version, iv, tag, ct] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !ct)
    throw new SecretBoxError("Unsupported secret format.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ct, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new SecretBoxError("Could not decrypt the stored secret (wrong key or tampered data).");
  }
}
