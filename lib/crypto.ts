/**
 * Token Encryption Utility
 *
 * Provides secure encryption and decryption for access tokens.
 * - Electron: Uses OS-level safeStorage (macOS Keychain / Windows DPAPI)
 * - Browser: Uses Web Crypto API with a per-session derived key
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isElectron(): boolean {
  return typeof window !== "undefined" && !!window.electronAPI?.safeStorage;
}

// ---------------------------------------------------------------------------
// Electron path – delegates to safeStorage IPC
// ---------------------------------------------------------------------------

async function electronEncrypt(plaintext: string): Promise<string> {
  const api = window.electronAPI?.safeStorage;
  if (!api) throw new Error("safeStorage API is not available");
  const result = await api.encrypt(plaintext);
  if (result === null) {
    throw new Error("safeStorage encryption failed — OS encryption unavailable");
  }
  return result;
}

async function electronDecrypt(base64Cipher: string): Promise<string> {
  const api = window.electronAPI?.safeStorage;
  if (!api) throw new Error("safeStorage API is not available");
  const result = await api.decrypt(base64Cipher);
  if (result === null) {
    throw new Error("Token decryption failed. The stored token may be corrupted.");
  }
  return result;
}

// ---------------------------------------------------------------------------
// Browser path – Web Crypto AES-GCM with a derived key stored in IndexedDB
// ---------------------------------------------------------------------------

const DB_NAME = "illusions-keystore";
const STORE_NAME = "keys";
const KEY_ID = "token-encryption-key";

async function openKeyStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getOrCreateKey(): Promise<CryptoKey> {
  const db = await openKeyStore();
  try {
    // Try to load existing key
    const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(KEY_ID);
      req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
      req.onerror = () => reject(req.error);
    });

    if (existing) return existing;

    // Generate new key
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false, // not extractable
      ["encrypt", "decrypt"],
    );

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).put(key, KEY_ID);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    return key;
  } finally {
    db.close();
  }
}

async function browserEncrypt(plaintext: string): Promise<string> {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );
  // Prefix IV (12 bytes) + ciphertext, encode as base64
  const combined = new Uint8Array(iv.length + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.length);
  return btoa(combined.reduce((s, b) => s + String.fromCharCode(b), ""));
}

async function browserDecrypt(base64Cipher: string): Promise<string> {
  const key = await getOrCreateKey();
  const raw = Uint8Array.from(atob(base64Cipher), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const ciphertext = raw.slice(12);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plainBuf);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypt an access token for secure storage.
 *
 * @param token - The plaintext access token
 * @returns Encrypted token as a base64 string
 */
export async function encryptToken(token: string): Promise<string> {
  if (isElectron()) return electronEncrypt(token);
  return browserEncrypt(token);
}

/**
 * Decrypt an access token from storage.
 *
 * @param encryptedToken - The encrypted token string (base64)
 * @returns Decrypted plaintext token
 * @throws Error if decryption fails
 */
export async function decryptToken(encryptedToken: string): Promise<string> {
  if (isElectron()) return electronDecrypt(encryptedToken);
  return browserDecrypt(encryptedToken);
}

/**
 * Test if a token can be successfully decrypted.
 *
 * @param encryptedToken - The encrypted token to test
 * @returns true if decryption succeeds, false otherwise
 */
export async function canDecryptToken(encryptedToken: string): Promise<boolean> {
  try {
    await decryptToken(encryptedToken);
    return true;
  } catch {
    return false;
  }
}
