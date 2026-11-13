import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, SecretBoxError } from "@/lib/crypto/secret-box";

const key = randomBytes(32).toString("base64");

describe("secret-box (AES-256-GCM)", () => {
  it("round-trips and never stores plaintext", () => {
    const enc = encryptSecret("sk-test-1234567890", key);
    expect(enc.startsWith("v1.")).toBe(true);
    expect(enc).not.toContain("sk-test");
    expect(decryptSecret(enc, key)).toBe("sk-test-1234567890");
  });
  it("uses a fresh IV each time", () => {
    expect(encryptSecret("same", key)).not.toBe(encryptSecret("same", key));
  });
  it("rejects a wrong key and tampered data", () => {
    const enc = encryptSecret("secret", key);
    expect(() => decryptSecret(enc, randomBytes(32).toString("base64"))).toThrow(SecretBoxError);
    const parts = enc.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."), key)).toThrow(SecretBoxError);
  });
  it("rejects malformed payloads and bad master keys", () => {
    expect(() => decryptSecret("nope", key)).toThrow(SecretBoxError);
    expect(() => encryptSecret("x", Buffer.from("short").toString("base64"))).toThrow(/32 bytes/);
  });
});
