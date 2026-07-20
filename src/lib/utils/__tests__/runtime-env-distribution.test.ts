import { afterEach, describe, expect, it, vi } from "vitest";

describe("runtime distribution helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  it.each([
    ["1.3.0", "stable"],
    ["1.3.0-beta.20260708.1", "beta"],
    ["1.3.0-dev", "dev"],
    ["1.3.0-alpha.1", "alpha"],
    [undefined, "unknown"],
  ] as const)("detects release channel for %s", async (version, expected) => {
    const { detectReleaseChannel } = await import("../runtime-env");
    expect(detectReleaseChannel(version)).toBe(expected);
  });

  it("returns direct provider for Electron renderer without store metadata", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.3.0-beta.20260708.1");
    (window as unknown as { electronAPI: { isElectron: boolean } }).electronAPI = {
      isElectron: true,
    };

    const { getAppRuntimeInfo } = await import("../runtime-env");

    expect(getAppRuntimeInfo()).toEqual({
      distributionProvider: "direct",
      releaseChannel: "beta",
    });
  });

  it("uses platform distribution provider from preload metadata", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.3.0");
    (
      window as unknown as { electronAPI: { isElectron: boolean; appRuntime: unknown } }
    ).electronAPI = {
      isElectron: true,
      appRuntime: {
        distributionProvider: "microsoft-store",
        releaseChannel: "beta",
      },
    };

    const { getAppRuntimeInfo } = await import("../runtime-env");

    expect(getAppRuntimeInfo()).toEqual({
      distributionProvider: "microsoft-store",
      releaseChannel: "stable",
    });
  });
});
