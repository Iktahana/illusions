import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const nodeRequire = createRequire(import.meta.url);
const { startMacOSAuthSession, cancelMacOSAuthSession, cancelAllMacOSAuthSessionsForShutdown } =
  nodeRequire("../macos-auth-session.js") as {
    startMacOSAuthSession: (
      url: string,
      callbackScheme: string,
      requestId: string,
      options: { platform: string; loadBinding: () => { start: ReturnType<typeof vi.fn> } },
    ) => Promise<string> | null;
    cancelMacOSAuthSession: (
      requestId: string,
      options: { platform: string; loadBinding: () => { cancel: ReturnType<typeof vi.fn> } },
    ) => void;
    cancelAllMacOSAuthSessionsForShutdown: (options: {
      platform: string;
      loadBinding: () => { cancelAllForShutdown: ReturnType<typeof vi.fn> };
    }) => void;
  };

describe("macos-auth-session", () => {
  it.each(["win32", "linux"])("never loads the macOS native bridge on %s", (platform) => {
    const loadBinding = vi.fn();

    const result = startMacOSAuthSession("https://example.test/oauth", "illusions", "request-1", {
      platform,
      loadBinding,
    });

    expect(result).toBeNull();
    expect(loadBinding).not.toHaveBeenCalled();
  });

  it("loads the bridge and returns its session promise on macOS", async () => {
    const start = vi.fn().mockResolvedValue("illusions://auth/callback?code=code&state=state");
    const loadBinding = vi.fn(() => ({ start }));

    await expect(
      startMacOSAuthSession("https://example.test/oauth", "illusions", "request-1", {
        platform: "darwin",
        loadBinding,
      }),
    ).resolves.toContain("illusions://auth/callback");
    expect(loadBinding).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith("https://example.test/oauth", "illusions", "request-1");
  });

  it.each(["win32", "linux"])("does not load the bridge to cancel on %s", (platform) => {
    const loadBinding = vi.fn();

    cancelMacOSAuthSession("request-1", { platform, loadBinding });
    cancelAllMacOSAuthSessionsForShutdown({ platform, loadBinding });

    expect(loadBinding).not.toHaveBeenCalled();
  });

  it("cancels a matching macOS request and all requests during shutdown", () => {
    const cancel = vi.fn();
    const cancelAllForShutdown = vi.fn();
    const loadBinding = vi.fn(() => ({ cancel, cancelAllForShutdown }));

    cancelMacOSAuthSession("request-1", { platform: "darwin", loadBinding });
    cancelAllMacOSAuthSessionsForShutdown({ platform: "darwin", loadBinding });

    expect(cancel).toHaveBeenCalledWith("request-1");
    expect(cancelAllForShutdown).toHaveBeenCalledTimes(1);
  });
});
