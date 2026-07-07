/**
 * Simple crypto utilities for API key storage.
 * Uses base64 + XOR obfuscation as a placeholder for real encryption.
 * In production, use OS keychain (keytar) or electron safeStorage.
 */

const XOR_KEY = 'aigm-2026-key-v1';

function xorString(input: string, key: string): string {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    out += String.fromCharCode(input.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return out;
}

/**
 * Encrypt a sensitive string.
 * Process: plain -> XOR -> base64
 */
export function encrypt(text: string): string {
  if (!text) return '';
  try {
    const xored = xorString(text, XOR_KEY);
    // btoa handles binary strings fine for XOR output
    return btoa(xored);
  } catch {
    return '';
  }
}

/**
 * Decrypt a previously encrypted string.
 * Process: base64 -> XOR -> plain
 */
export function decrypt(cipher: string): string {
  if (!cipher) return '';
  try {
    const xored = atob(cipher);
    return xorString(xored, XOR_KEY);
  } catch {
    return '';
  }
}

/**
 * Check if a value looks like our encrypted format (base64 string).
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  try {
    atob(value);
    return true;
  } catch {
    return false;
  }
}
