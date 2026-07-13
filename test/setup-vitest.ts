import { beforeEach } from "vitest";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

function installBrowserStorageGlobals(): void {
  const local = createMemoryStorage();
  const session = createMemoryStorage();

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: local,
  });

  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: session,
  });

  if (typeof window !== "undefined") {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: local,
    });

    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: session,
    });
  }
}

installBrowserStorageGlobals();

beforeEach(() => {
  installBrowserStorageGlobals();
});
