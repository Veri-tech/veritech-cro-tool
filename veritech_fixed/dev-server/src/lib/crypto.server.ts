// Server-only AES-256-GCM helper for credential encryption.
// INTEGRATION_ENCRYPTION_KEY must be set; it's used as a passphrase from
// which a 32-byte key is derived via SHA-256.
//
// Output format: base64( iv[12] || authTag[16] || ciphertext )
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

function getKey(): Buffer {
  const passphrase =
    process.env.SUPABASE_ENCRYPTION_KEY ||
    process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!passphrase) {
    throw new Error(
      "SUPABASE_ENCRYPTION_KEY is not configured. " +
      "Generate one with: openssl rand -hex 32"
    );
  }
  return createHash("sha256").update(passphrase, "utf8").digest();
}

export function encryptString(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptString(payload: string): string {
  const key = getKey();
  const buf = Buffer.from(payload, "base64");
  if (buf.length < 28) throw new Error("Encrypted payload too short");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

export function encryptJSON<T>(obj: T): string {
  return encryptString(JSON.stringify(obj));
}

export function decryptJSON<T = unknown>(payload: string): T {
  return JSON.parse(decryptString(payload)) as T;
}
