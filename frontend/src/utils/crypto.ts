/**
 * Secure crypto utilities for API key storage.
 *
 * Uses Web Crypto API (AES-256-GCM) with PBKDF2 key derivation.
 * Each encryption uses a random salt + IV, so the same plaintext
 * produces different ciphertext every time.
 *
 * Format: aigm:v2:<base64(salt)>:<base64(iv)>:<base64(ciphertext)>
 *
 * Electron safeStorage is available via IPC and should be preferred
 * when running inside Electron (OS keychain backed).
 */

const VERSION_PREFIX = 'aigm:v2:';
const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 256; // bits
const IV_LENGTH = 12;   // bytes (96 bits for GCM)
const SALT_LENGTH = 16; // bytes

// App-specific base key material (not the encryption key itself)
// In production this could be rotated or derived from user password
const KEY_MATERIAL = 'aigm-secure-storage-2026';

/**
 * Derive an AES-GCM key from a password and salt using PBKDF2.
 */
async function deriveKey(salt: ArrayBuffer): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(KEY_MATERIAL),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a sensitive string using AES-256-GCM.
 * Returns a version-prefixed string with embedded salt + IV.
 */
export async function encrypt(text: string): Promise<string> {
  if (!text) return '';
  try {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    // Extract plain ArrayBuffer for Web Crypto API (TS compat)
    const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength);
    const key = await deriveKey(saltBuffer as ArrayBuffer);

    const encoder = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(text)
    );

    const saltB64 = btoa(String.fromCharCode(...salt));
    const ivB64 = btoa(String.fromCharCode(...iv));
    const cipherB64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));

    return `${VERSION_PREFIX}${saltB64}:${ivB64}:${cipherB64}`;
  } catch (_err) {
    return '';
  }
}

/**
 * Decrypt a string previously encrypted with `encrypt()`.
 */
export async function decrypt(cipher: string): Promise<string> {
  if (!cipher) return '';
  if (!cipher.startsWith(VERSION_PREFIX)) {
    // Not our format — might be old XOR data or plaintext
    return '';
  }

  try {
    const payload = cipher.slice(VERSION_PREFIX.length);
    const [saltB64, ivB64, cipherB64] = payload.split(':');
    if (!saltB64 || !ivB64 || !cipherB64) return '';

    const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(cipherB64), (c) => c.charCodeAt(0));

    const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength);
    const key = await deriveKey(saltBuffer as ArrayBuffer);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch (_err) {
    return '';
  }
}

/**
 * Check if a value looks like our encrypted format.
 * Also returns true for old base64 XOR format so callers
 * can distinguish plaintext from any kind of ciphertext.
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  // New format
  if (value.startsWith(VERSION_PREFIX)) return true;
  // Old XOR format (base64 without prefix)
  try {
    atob(value);
    return true;
  } catch {
    return false;
  }
}
