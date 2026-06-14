import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { getDownloadState, checkForUpdate } = vi.hoisted(() => ({
  getDownloadState: vi.fn(),
  checkForUpdate: vi.fn(),
}));
const { loadAppState } = vi.hoisted(() => ({
  loadAppState: vi.fn(),
}));
const { notifInfo, notifError } = vi.hoisted(() => ({
  notifInfo: vi.fn(),
  notifError: vi.fn(),
}));
vi.mock("@/lib/dict/dict-service", () => ({
  getDictService: () => ({ getDownloadState, checkForUpdate }),
}));
vi.mock("@/lib/storage/storage-service", () => ({
  getStorageService: () => ({ loadAppState }),
}));
vi.mock("@/lib/services/notification-manager", () => ({
  notificationManager: { info: notifInfo, error: notifError, showMessage: vi.fn() },
}));

import { dictUpdateCheck } from "@/lib/services/startup-checks/dict-update-check";

const lastDownloadMock = { current: vi.fn(async (): Promise<unknown> => ({ success: true })) };

function setElectronDict(present: boolean, download?: () => Promise<unknown>) {
  if (present) {
    const downloadFn = vi.fn(download ?? (async () => ({ success: true })));
    lastDownloadMock.current = downloadFn;
    (window as unknown as { electronAPI?: unknown }).electronAPI = {
      dict: {
        download: downloadFn,
        getStatus: vi.fn(async () => ({})),
        checkUpdate: vi.fn(async () => ({})),
      },
    };
  } else {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  }
}

describe("dictUpdateCheck", () => {
  beforeEach(() => {
    getDownloadState.mockReset();
    checkForUpdate.mockReset();
    loadAppState.mockReset();
    // Default: preference unset → update checking enabled.
    loadAppState.mockResolvedValue(null);
    notifInfo.mockReset();
    notifError.mockReset();
  });
  afterEach(() => setElectronDict(false));

  it("returns null on Web (no electronAPI.dict) without querying state", async () => {
    setElectronDict(false);
    const notice = await dictUpdateCheck.evaluate();
    expect(notice).toBeNull();
    expect(getDownloadState).not.toHaveBeenCalled();
  });

  it("warns when the dictionary is not installed (Electron)", async () => {
    setElectronDict(true);
    getDownloadState.mockResolvedValue({ providerId: "genji", status: "not-installed" });
    const notice = await dictUpdateCheck.evaluate();
    expect(getDownloadState).toHaveBeenCalledWith("genji");
    expect(notice).toMatchObject({ id: "dict-not-installed", type: "warning" });
    expect(notice?.actions?.[0]?.label).toBe("今すぐダウンロード");
    // Should not call checkForUpdate when not-installed
    expect(checkForUpdate).not.toHaveBeenCalled();
  });

  it("informs when an update is available (via checkForUpdate)", async () => {
    setElectronDict(true);
    getDownloadState.mockResolvedValue({ providerId: "genji", status: "installed" });
    checkForUpdate.mockResolvedValue({
      latestVersion: "1.1.0",
      installedVersion: "1.0.0",
      updateAvailable: true,
    });
    const notice = await dictUpdateCheck.evaluate();
    expect(checkForUpdate).toHaveBeenCalledWith("genji");
    expect(notice).toMatchObject({ id: "dict-update-available", type: "info" });
    expect(notice?.message).toContain("1.0.0");
    expect(notice?.message).toContain("1.1.0");
  });

  it("returns null when installed and up to date", async () => {
    setElectronDict(true);
    getDownloadState.mockResolvedValue({ providerId: "genji", status: "installed" });
    checkForUpdate.mockResolvedValue({
      latestVersion: "1.0.0",
      installedVersion: "1.0.0",
      updateAvailable: false,
    });
    expect(await dictUpdateCheck.evaluate()).toBeNull();
  });

  it("silently suppresses notification when checkForUpdate throws (network failure)", async () => {
    setElectronDict(true);
    getDownloadState.mockResolvedValue({ providerId: "genji", status: "installed" });
    checkForUpdate.mockRejectedValue(new Error("network timeout"));
    const notice = await dictUpdateCheck.evaluate();
    expect(notice).toBeNull();
  });

  it("silently suppresses notification when checkForUpdate returns null (Web guard)", async () => {
    setElectronDict(true);
    getDownloadState.mockResolvedValue({ providerId: "genji", status: "installed" });
    checkForUpdate.mockResolvedValue(null);
    const notice = await dictUpdateCheck.evaluate();
    expect(notice).toBeNull();
  });

  it("returns null while downloading/installing", async () => {
    setElectronDict(true);
    getDownloadState.mockResolvedValue({
      providerId: "genji",
      status: "downloading",
      progress: 42,
    });
    expect(await dictUpdateCheck.evaluate()).toBeNull();
    // Should not hit the network while a download is in progress
    expect(checkForUpdate).not.toHaveBeenCalled();
  });

  it("skips checkForUpdate and returns no update notice when auto-check is disabled", async () => {
    setElectronDict(true);
    getDownloadState.mockResolvedValue({ providerId: "genji", status: "installed" });
    loadAppState.mockResolvedValue({ dictAutoCheckUpdates: false });
    const notice = await dictUpdateCheck.evaluate();
    expect(notice).toBeNull();
    // The network update check must NOT fire when the preference is OFF.
    expect(checkForUpdate).not.toHaveBeenCalled();
  });

  it("still warns when not installed even if auto-check is disabled", async () => {
    setElectronDict(true);
    getDownloadState.mockResolvedValue({ providerId: "genji", status: "not-installed" });
    loadAppState.mockResolvedValue({ dictAutoCheckUpdates: false });
    const notice = await dictUpdateCheck.evaluate();
    expect(notice).toMatchObject({ id: "dict-not-installed", type: "warning" });
    // The "not installed" warning is independent of the auto-check preference,
    // and must not trigger a network update check.
    expect(checkForUpdate).not.toHaveBeenCalled();
  });

  it("checks for updates when auto-check is explicitly enabled", async () => {
    setElectronDict(true);
    getDownloadState.mockResolvedValue({ providerId: "genji", status: "installed" });
    loadAppState.mockResolvedValue({ dictAutoCheckUpdates: true });
    checkForUpdate.mockResolvedValue({ updateAvailable: false });
    await dictUpdateCheck.evaluate();
    expect(checkForUpdate).toHaveBeenCalledWith("genji");
  });

  it("surfaces an error (not a success toast) when download resolves { success: false }", async () => {
    setElectronDict(true, async () => ({
      success: false,
      error: "ダウンロードはすでに進行中です",
    }));
    getDownloadState.mockResolvedValue({ providerId: "genji", status: "not-installed" });
    const notice = await dictUpdateCheck.evaluate();
    expect(notice).toMatchObject({ id: "dict-not-installed" });

    // Trigger the download action and let the resolved-failure path run.
    const onClick = notice?.actions?.[0]?.onClick;
    expect(onClick).toBeTypeOf("function");
    onClick?.();
    // The optimistic "started" info toast fires synchronously.
    expect(notifInfo).toHaveBeenCalledWith("辞書のダウンロードを開始しました。");
    // Let the resolved promise's .then handler run.
    await lastDownloadMock.current.mock.results[0]?.value;
    await Promise.resolve();
    expect(notifError).toHaveBeenCalledWith(
      expect.stringContaining("ダウンロードはすでに進行中です"),
    );
  });

  it("surfaces an error when download rejects", async () => {
    setElectronDict(true, async () => {
      throw new Error("checksum mismatch");
    });
    getDownloadState.mockResolvedValue({ providerId: "genji", status: "not-installed" });
    const notice = await dictUpdateCheck.evaluate();
    const onClick = notice?.actions?.[0]?.onClick;
    onClick?.();
    expect(notifInfo).toHaveBeenCalledWith("辞書のダウンロードを開始しました。");
    // Let the rejected promise's .catch handler run.
    await lastDownloadMock.current.mock.results[0]?.value.catch(() => {});
    await Promise.resolve();
    expect(notifError).toHaveBeenCalledWith(expect.stringContaining("checksum mismatch"));
  });
});
