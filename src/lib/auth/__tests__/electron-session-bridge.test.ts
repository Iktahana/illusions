import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getElectronAuthApi,
  requireElectronAuthApi,
  restoreElectronSession,
  type ElectronAuthApi,
} from "@/lib/auth/electron-session";

describe("Electron auth preload bridge access", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "electronAPI");
  });

  it("keeps nullable auth probing when the preload bridge is absent", () => {
    expect(getElectronAuthApi()).toBeNull();
  });

  it("keeps nullable auth probing when only the auth sub-bridge is absent", () => {
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: { isElectron: true },
    });

    expect(getElectronAuthApi()).toBeNull();
  });

  it("returns the exposed auth bridge", () => {
    const auth = {} as ElectronAuthApi;
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: { isElectron: true, auth },
    });

    expect(getElectronAuthApi()).toBe(auth);
    expect(requireElectronAuthApi()).toBe(auth);
  });

  it("fails explicit auth access with an actionable sub-bridge error", () => {
    expect(requireElectronAuthApi).toThrow(
      "Electron auth API is unavailable: window.electronAPI.auth was not exposed. " +
        "Ensure the Electron preload script exposes the auth IPC bridge.",
    );
  });

  it("fails explicit session restore instead of silently falling back", async () => {
    await expect(restoreElectronSession()).rejects.toThrow(
      "window.electronAPI.auth was not exposed",
    );
  });
});
