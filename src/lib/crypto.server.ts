// AES-256-GCM encryption for OAuth tokens stored in the database.

declare const __SUPABASE_ENCRYPTION_KEY__: string | undefined;

function getEncryptionKey(): string {
  const key =
    (typeof __SUPABASE_ENCRYPTION_KEY__ !== 'undefined' && __SUPABASE_ENCRYPTION_KEY__) ||
    (typeof process !== 'undefined' && process.env?.SUPABASE_ENCRYPTION_KEY) ||
    null;

  if (!key || key.length < 32) {
    throw new Error(
      "SUPABASE_ENCRYPTION_KEY is not configured. " +
      "Set it in your environment variables (64-char hex string)."
    );
  }
  return key;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

async function encrypt(plaintext: string): Promise<string> {
  const keyHex = getEncryptionKey();
  const keyBytes = hexToBytes(keyHex.slice(0, 64));
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, encoded);
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(encrypted: string): Promise<string> {
  const keyHex = getEncryptionKey();
  const keyBytes = hexToBytes(keyHex.slice(0, 64));
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]
  );
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, ciphertext);
  return new TextDecoder().decode(plaintext);
}

// String encryption/decryption
export async function encryptString(plaintext: string): Promise<string> {
  return encrypt(plaintext);
}

export async function decryptString(encrypted: string): Promise<string> {
  return decrypt(encrypted);
}

// JSON encryption/decryption
export async function encryptJSON(data: unknown): Promise<string> {
  return encrypt(JSON.stringify(data));
}

export async function decryptJSON<T = unknown>(encrypted: string): Promise<T> {
  const plaintext = await decrypt(encrypted);
  return JSON.parse(plaintext) as T;
}

// Legacy aliases (keep for backward compatibility)
export const encryptToken = encryptString;
export const decryptToken = decryptString;
