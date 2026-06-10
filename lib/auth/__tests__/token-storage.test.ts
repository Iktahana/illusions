import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  saveTokens,
  loadTokens,
  clearTokens,
  resetTokenStorageForTests,
  type StoredTokens,
} from "@/lib/auth/token-storage";

const TOKENS: StoredTokens = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  expiresAt: 1_900_000_000_000,
};

interface MockElectronApi {
  storage: {
    setItem: ReturnType<typeof vi.fn>;
    getItem: ReturnType<typeof vi.fn>;
    removeItem: ReturnType<typeof vi.fn>;
  };
  safeStorage: {
    isAvailable: ReturnType<typeof vi.fn>;
    encrypt: ReturnType<typeof vi.fn>;
    decrypt: ReturnType<typeof vi.fn>;
  };
}

function installMockApi(opts: { safeStorageAvailable: boolean }): MockElectronApi {
  const api: MockElectronApi = {
    storage: {
      setItem: vi.fn().mockResolvedValue(undefined),
      getItem: vi.fn().mockResolvedValue(null),
      removeItem: vi.fn().mockResolvedValue(undefined),
    },
    safeStorage: {
      isAvailable: vi.fn().mockResolvedValue(opts.safeStorageAvailable),
      encrypt: vi.fn().mockImplementation((plaintext: string) => {
        if (!opts.safeStorageAvailable) return Promise.resolve(null);
        return Promise.resolve(`encrypted:${plaintext}`);
      }),
      decrypt: vi.fn().mockImplementation((cipher: string) => {
        if (!cipher.startsWith("encrypted:")) {
          return Promise.reject(new Error("decryption failed"));
        }
        return Promise.resolve(cipher.slice("encrypted:".length));
      }),
    },
  };
  Object.defineProperty(window, "electronAPI", {
    value: api as unknown as Window["electronAPI"],
    configurable: true,
    writable: true,
  });
  return api;
}

beforeEach(() => {
  resetTokenStorageForTests();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, "electronAPI");
});

describe("saveTokens", () => {
  it("persists encrypted tokens when safeStorage is available", async () => {
    const api = installMockApi({ safeStorageAvailable: true });

    await saveTokens(TOKENS);

    expect(api.storage.setItem).toHaveBeenCalledWith(
      "auth:tokens",
      `encrypted:${JSON.stringify(TOKENS)}`,
    );
  });

  it("never writes plaintext tokens to disk when safeStorage is unavailable (#1563)", async () => {
    const api = installMockApi({ safeStorageAvailable: false });

    await saveTokens(TOKENS);

    // The pre-fix behavior wrote JSON.stringify(tokens) via setItem — this
    // assertion fails without the fix.
    expect(api.storage.setItem).not.toHaveBeenCalled();
    // Any stale persisted copy is purged.
    expect(api.storage.removeItem).toHaveBeenCalledWith("auth:tokens");
  });

  it("keeps tokens in memory for the current session when safeStorage is unavailable", async () => {
    installMockApi({ safeStorageAvailable: false });

    await saveTokens(TOKENS);

    await expect(loadTokens()).resolves.toEqual(TOKENS);
  });

  it("warns once (and only once) about the session-only downgrade", async () => {
    installMockApi({ safeStorageAvailable: false });

    await saveTokens(TOKENS);
    await saveTokens(TOKENS);

    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("falls back to session-only storage when encrypt returns null", async () => {
    const api = installMockApi({ safeStorageAvailable: true });
    api.safeStorage.encrypt.mockResolvedValue(null);

    await saveTokens(TOKENS);

    expect(api.storage.setItem).not.toHaveBeenCalled();
    await expect(loadTokens()).resolves.toEqual(TOKENS);
  });
});

describe("loadTokens", () => {
  it("decrypts persisted tokens when safeStorage is available", async () => {
    const api = installMockApi({ safeStorageAvailable: true });
    api.storage.getItem.mockResolvedValue(`encrypted:${JSON.stringify(TOKENS)}`);

    await expect(loadTokens()).resolves.toEqual(TOKENS);
  });

  it("purges legacy plaintext tokens from disk after restoring them once", async () => {
    const api = installMockApi({ safeStorageAvailable: false });
    api.storage.getItem.mockResolvedValue(JSON.stringify(TOKENS));

    await expect(loadTokens()).resolves.toEqual(TOKENS);

    expect(api.storage.removeItem).toHaveBeenCalledWith("auth:tokens");
    // Restored copy is held in memory for the session.
    api.storage.getItem.mockResolvedValue(null);
    await expect(loadTokens()).resolves.toEqual(TOKENS);
  });

  it("migrates legacy plaintext tokens even when safeStorage is available", async () => {
    const api = installMockApi({ safeStorageAvailable: true });
    api.storage.getItem.mockResolvedValue(JSON.stringify(TOKENS));

    await expect(loadTokens()).resolves.toEqual(TOKENS);
    expect(api.storage.removeItem).toHaveBeenCalledWith("auth:tokens");

    // The next save re-encrypts and persists.
    await saveTokens(TOKENS);
    expect(api.storage.setItem).toHaveBeenCalledWith(
      "auth:tokens",
      `encrypted:${JSON.stringify(TOKENS)}`,
    );
  });

  it("returns null when nothing is stored", async () => {
    installMockApi({ safeStorageAvailable: true });

    await expect(loadTokens()).resolves.toBeNull();
  });

  it("returns null for undecryptable non-JSON data", async () => {
    const api = installMockApi({ safeStorageAvailable: false });
    api.storage.getItem.mockResolvedValue("not-json-ciphertext");

    await expect(loadTokens()).resolves.toBeNull();
  });
});

describe("clearTokens", () => {
  it("clears both persisted and in-memory tokens", async () => {
    const api = installMockApi({ safeStorageAvailable: false });
    await saveTokens(TOKENS);

    await clearTokens();

    expect(api.storage.removeItem).toHaveBeenCalledWith("auth:tokens");
    await expect(loadTokens()).resolves.toBeNull();
  });
});
