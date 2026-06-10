/**
 * Electron-only auth token persistence (safeStorage / IPC).
 *
 * Tokens are persisted to disk only when OS-level encryption (safeStorage)
 * is available. When it is not (e.g. Linux without a keychain daemon),
 * tokens are downgraded to session-only in-memory storage and any plaintext
 * copy left behind by older builds is purged from disk (#1563).
 */

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const TOKEN_STORAGE_KEY = "auth:tokens";

/** Session-only fallback used when safeStorage encryption is unavailable. */
let inMemoryTokens: StoredTokens | null = null;
let encryptionUnavailableWarned = false;

function warnEncryptionUnavailable(): void {
  if (encryptionUnavailableWarned) return;
  encryptionUnavailableWarned = true;
  console.warn(
    "[auth] OS の安全なストレージ (safeStorage) が利用できないため、ログイン状態はこのセッション限りで保持されます。アプリを再起動すると再ログインが必要です。",
  );
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  const api = window.electronAPI;
  if (!api?.safeStorage || !api?.storage) return;

  try {
    const isAvailable = await api.safeStorage.isAvailable();
    if (isAvailable) {
      const encrypted = await api.safeStorage.encrypt(JSON.stringify(tokens));
      if (encrypted) {
        inMemoryTokens = null;
        await api.storage.setItem(TOKEN_STORAGE_KEY, encrypted);
        return;
      }
    }
  } catch {
    // safeStorage unavailable — fall through to the session-only path
  }

  // No encryption available: never write plaintext tokens to disk (#1563).
  // Keep them in memory for this session and purge any stale persisted copy.
  inMemoryTokens = tokens;
  try {
    await api.storage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Best effort — nothing sensitive was written in this session
  }
  warnEncryptionUnavailable();
}

export async function loadTokens(): Promise<StoredTokens | null> {
  if (inMemoryTokens) return inMemoryTokens;

  const api = window.electronAPI;
  if (!api?.storage) return null;

  try {
    const stored = await api.storage.getItem(TOKEN_STORAGE_KEY);
    if (!stored) return null;

    // Try to decrypt first (encrypted data)
    if (api.safeStorage) {
      try {
        const isAvailable = await api.safeStorage.isAvailable();
        if (isAvailable) {
          const decrypted = await api.safeStorage.decrypt(stored);
          if (decrypted) {
            return JSON.parse(decrypted) as StoredTokens;
          }
        }
      } catch {
        // Not encrypted or decryption failed — handle as legacy plaintext below
      }
    }

    // Legacy plaintext tokens written by older builds: restore them once into
    // memory for this session, then purge the plaintext copy from disk (#1563).
    // A subsequent saveTokens() re-encrypts them when safeStorage is available.
    const legacy = JSON.parse(stored) as StoredTokens;
    inMemoryTokens = legacy;
    await api.storage.removeItem(TOKEN_STORAGE_KEY);
    return legacy;
  } catch {
    return null;
  }
}

export async function clearTokens(): Promise<void> {
  inMemoryTokens = null;
  const api = window.electronAPI;
  if (!api?.storage) return;
  await api.storage.removeItem(TOKEN_STORAGE_KEY);
}

/** Test-only helper: reset module-level state between test cases. */
export function resetTokenStorageForTests(): void {
  inMemoryTokens = null;
  encryptionUnavailableWarned = false;
}
