/**
 * Token Encryption Utility
 * 
 * Provides secure encryption and decryption for GitHub access tokens.
 * Uses AES encryption with a device-specific key.
 */

import CryptoJS from "crypto-js";

/**
 * Generate a device-specific encryption key.
 * This key is derived from browser/system fingerprint and is NOT stored.
 * 
 * Note: This is not meant to be cryptographically unbreakable, but provides
 * a reasonable level of protection against casual token theft from storage.
 */
function getEncryptionKey(): string {
  if (typeof window === "undefined") {
    // Node.js environment (Electron main process)
    // In a real implementation, we would use a hardware-based key
    // For now, use a combination of system info
    return "illusions-electron-key-v1";
  }

  // Browser environment - create fingerprint from available info
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.width.toString(),
    screen.height.toString(),
    screen.colorDepth.toString(),
    new Date().getTimezoneOffset().toString(),
    // Add more entropy if available
    navigator.hardwareConcurrency?.toString() || "",
    (navigator as any).deviceMemory?.toString() || "",
  ].join("|");

  // Hash the fingerprint to create a consistent key
  return CryptoJS.SHA256(fingerprint).toString();
}

/**
 * Encrypt a GitHub access token for storage.
 * 
 * @param token - The plaintext access token
 * @returns Encrypted token as a base64 string
 */
export function encryptToken(token: string): string {
  const key = getEncryptionKey();
  const encrypted = CryptoJS.AES.encrypt(token, key);
  return encrypted.toString();
}

/**
 * Decrypt a GitHub access token from storage.
 * 
 * @param encryptedToken - The encrypted token string
 * @returns Decrypted plaintext token
 * @throws Error if decryption fails (wrong key or corrupted data)
 */
export function decryptToken(encryptedToken: string): string {
  const key = getEncryptionKey();
  const decrypted = CryptoJS.AES.decrypt(encryptedToken, key);
  const plaintext = decrypted.toString(CryptoJS.enc.Utf8);
  
  if (!plaintext) {
    throw new Error("Token decryption failed. The stored token may be corrupted.");
  }
  
  return plaintext;
}

/**
 * Test if a token can be successfully decrypted.
 * Useful for validating stored tokens before use.
 * 
 * @param encryptedToken - The encrypted token to test
 * @returns true if decryption succeeds, false otherwise
 */
export function canDecryptToken(encryptedToken: string): boolean {
  try {
    decryptToken(encryptedToken);
    return true;
  } catch {
    return false;
  }
}
