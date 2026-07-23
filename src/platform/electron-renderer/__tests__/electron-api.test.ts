import { afterEach, describe, expect, it, vi } from "vitest";

const UNAVAILABLE_MESSAGE =
  "Electron preload bridge is unavailable: window.electronAPI was not exposed. " +
  "Ensure the Electron preload script is configured and loaded before using Electron-only features.";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();

  if (typeof window !== "undefined") {
    Reflect.deleteProperty(window, "electronAPI");
  }
});

describe("Electron preload bridge access", () => {
  it("can be imported and evaluated when window is unavailable", async () => {
    vi.stubGlobal("window", undefined);

    await expect(import("@/platform/electron-renderer/electron-api")).resolves.toMatchObject({
      getElectronAPI: expect.any(Function),
      requireElectronAPI: expect.any(Function),
    });
  });

  it("returns null when window is unavailable", async () => {
    vi.stubGlobal("window", undefined);
    const { getElectronAPI } = await import("@/platform/electron-renderer/electron-api");

    expect(getElectronAPI()).toBeNull();
  });

  it("returns null when the preload bridge is absent", async () => {
    Reflect.deleteProperty(window, "electronAPI");
    const { getElectronAPI } = await import("@/platform/electron-renderer/electron-api");

    expect(getElectronAPI()).toBeNull();
  });

  it("returns the exposed preload bridge", async () => {
    const electronAPI = { isElectron: true } as Window["electronAPI"];
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: electronAPI,
    });
    const { getElectronAPI, requireElectronAPI } =
      await import("@/platform/electron-renderer/electron-api");

    expect(getElectronAPI()).toBe(electronAPI);
    expect(requireElectronAPI()).toBe(electronAPI);
  });

  it("fails fast with an actionable stable error when the bridge is absent", async () => {
    Reflect.deleteProperty(window, "electronAPI");
    const { requireElectronAPI } = await import("@/platform/electron-renderer/electron-api");

    expect(requireElectronAPI).toThrowError(UNAVAILABLE_MESSAGE);
  });
});
