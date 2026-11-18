import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * API keys are encrypted with AES-256-GCM before being written to the database.
 * Set AI_SECRET in production; AUTH_SECRET is used as a fallback so local
 * development works out of the box.
 */
function encryptionKey() {
  const secret =
    process.env.AI_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    "axiom-development-ai-secret";
  return createHash("sha256").update(secret).digest();
}

export function hasDedicatedAiSecret() {
  return Boolean(process.env.AI_SECRET?.trim());
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSecret(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Stored API key has an unsupported format. Re-enter the key.");
  }
  const [, ivPart, tagPart, dataPart] = parts;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivPart, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error(
      "Could not decrypt the stored API key. Check AI_SECRET/AUTH_SECRET or re-enter the key."
    );
  }
}

export function secretHint(plain: string) {
  const trimmed = plain.trim();
  if (!trimmed) return null;
  return `••••${trimmed.slice(-4)}`;
}
