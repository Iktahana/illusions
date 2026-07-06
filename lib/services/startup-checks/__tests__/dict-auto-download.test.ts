import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { loadAppState } = vi.hoisted(() => ({ loadAppState: vi.fn() }));
vi.mock("@/lib/storage/storage-service", () => ({
  getStorageService: () => ({ loadAppState }),
}));
vi.mock("@/lib/dict/dict-access", () => ({
  getDictAccess: () => ({ invalidate: vi.fn() }),
}));
vi.mock("@/lib/services/notification-manager", () => ({
  notificationManager: {
    showProgress: vi.fn(() => "id"),
    updateProgress: vi.fn(),
    updateMessage: vi.fn(),
    showMessage: vi.fn(() => "id"),
    dismiss: vi.fn(),
    error: vi.fn(),
  },
}));

import { notificationManager } from "@/lib/services/notification-manager";
import {
  isAutoDownloadAllowed,
  startCountdownDownload,
} from "@/lib/services/startup-checks/dict-auto-download";
import type { NotificationAction } from "@/types/notification";

type ConnectionLike = { type?: string; saveData?: boolean };

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", { value: online, configurable: true });
}
function setConnection(conn: ConnectionLike | undefined) {
  Object.defineProperty(navigator, "connection", { value: conn, configurable: true });
}

describe("isAutoDownloadAllowed", () => {
  beforeEach(() => {
    loadAppState.mockReset();
    loadAppState.mockResolvedValue(null);
    setOnline(true);
    setConnection(undefined);
  });
  afterEach(() => {
    setConnection(undefined);
    setOnline(true);
  });

  it("allows when online, no connection info, and power-save off", async () => {
    expect(await isAutoDownloadAllowed()).toBe(true);
  });

  it("blocks when offline", async () => {
    setOnline(false);
    expect(await isAutoDownloadAllowed()).toBe(false);
  });

  it("blocks on a cellular connection (metered radio)", async () => {
    setConnection({ type: "cellular" });
    expect(await isAutoDownloadAllowed()).toBe(false);
  });

  it("blocks when the OS data-saver is on", async () => {
    setConnection({ type: "wifi", saveData: true });
    expect(await isAutoDownloadAllowed()).toBe(false);
  });

  it("allows on wifi without data-saver", async () => {
    setConnection({ type: "wifi", saveData: false });
    expect(await isAutoDownloadAllowed()).toBe(true);
  });

  it("blocks when the app power-save (throttle) mode is on", async () => {
    loadAppState.mockResolvedValue({ powerSaveMode: true });
    expect(await isAutoDownloadAllowed()).toBe(false);
  });

  it("allows when loadAppState throws (no signal → fall back to other gates)", async () => {
    loadAppState.mockRejectedValue(new Error("storage error"));
    expect(await isAutoDownloadAllowed()).toBe(true);
  });
});

describe("startCountdownDownload duplicate guard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(notificationManager.showMessage).mockClear();
    vi.mocked(notificationManager.showProgress).mockClear();
    vi.mocked(notificationManager.dismiss).mockClear();
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  const options = {
    key: "test-dict-download",
    seconds: 3,
    buildMessage: (remaining: number) => `download in ${remaining}`,
    downloadMessage: "downloading",
  };

  const cancelLatestCountdown = (): void => {
    const calls = vi.mocked(notificationManager.showMessage).mock.calls;
    const latestCall = calls[calls.length - 1];
    const actions = latestCall?.[1]?.actions as NotificationAction[] | undefined;
    actions?.find((action) => action.label === "キャンセル")?.onClick?.();
  };

  it("does not show a second countdown for the same key while active, then allows one after cancel", () => {
    startCountdownDownload(options);
    startCountdownDownload(options);

    expect(notificationManager.showMessage).toHaveBeenCalledTimes(1);

    cancelLatestCountdown();

    startCountdownDownload(options);

    expect(notificationManager.showMessage).toHaveBeenCalledTimes(2);
    cancelLatestCountdown();
  });

  it("keeps the key guarded while the download is running, then allows one after it resolves", async () => {
    let resolveDownload: (value: { success: boolean }) => void = () => {};
    const download = vi.fn(
      () =>
        new Promise<{ success: boolean }>((resolve) => {
          resolveDownload = resolve;
        }),
    );
    (window as unknown as { electronAPI?: unknown }).electronAPI = {
      dict: { download },
    };

    startCountdownDownload({ ...options, key: "test-dict-download-resolve", seconds: 1 });
    vi.advanceTimersByTime(1000);

    expect(download).toHaveBeenCalledTimes(1);
    expect(notificationManager.showProgress).toHaveBeenCalledTimes(1);

    startCountdownDownload({ ...options, key: "test-dict-download-resolve", seconds: 1 });
    expect(notificationManager.showMessage).toHaveBeenCalledTimes(1);

    resolveDownload({ success: true });
    // The internal chain is `downloadPromise.then(A).catch(B).finally(C)` — each
    // link adds one more microtask hop before `finally` (which releases the key)
    // actually runs, so flush a few ticks rather than just one or two.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    startCountdownDownload({ ...options, key: "test-dict-download-resolve", seconds: 1 });
    expect(notificationManager.showMessage).toHaveBeenCalledTimes(2);
    cancelLatestCountdown();
  });
});
