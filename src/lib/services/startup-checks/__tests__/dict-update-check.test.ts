import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { getDownloadState, checkForUpdate } = vi.hoisted(() => ({
  getDownloadState: vi.fn(),
  checkForUpdate: vi.fn(),
}));
const { loadAppState } = vi.hoisted(() => ({
  loadAppState: vi.fn(),
}));
const { isAutoDownloadAllowed, runDictDownloadWithProgress, startCountdownDownload } = vi.hoisted(
  () => ({
    isAutoDownloadAllowed: vi.fn(),
    runDictDownloadWithProgress: vi.fn(),
    startCountdownDownload: vi.fn(),
  }),
);
vi.mock("@/lib/dict/dict-service", () => ({
  getDictService: () => ({ getDownloadState, checkForUpdate }),
}));
vi.mock("@/lib/storage/storage-service", () => ({
  getStorageService: () => ({ loadAppState }),
}));
vi.mock("@/lib/services/startup-checks/dict-auto-download", () => ({
  isAutoDownloadAllowed,
  runDictDownloadWithProgress,
  startCountdownDownload,
}));

import { dictUpdateCheck } from "@/lib/services/startup-checks/dict-update-check";

function setElectronDict(present: boolean) {
  if (present) {
    (window as unknown as { electronAPI?: unknown }).electronAPI = {
      dict: { download: vi.fn(), getStatus: vi.fn(async () => ({})) },
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
    loadAppState.mockResolvedValue(null); // preference unset → update checking enabled
    isAutoDownloadAllowed.mockReset();
    isAutoDownloadAllowed.mockResolvedValue(false); // default: manual-notice path
    runDictDownloadWithProgress.mockReset();
    startCountdownDownload.mockReset();
  });
  afterEach(() => setElectronDict(false));

  it("returns null on Web (no electronAPI.dict) without querying state", async () => {
    setElectronDict(false);
    const notice = await dictUpdateCheck.evaluate();
    expect(notice).toBeNull();
    expect(getDownloadState).not.toHaveBeenCalled();
  });

  it("warns when the dictionary is not installed (auto-download not allowed)", async () => {
    setElectronDict(true);
    getDownloadState.mockResolvedValue({ providerId: "genji", status: "not-installed" });
    const notice = await dictUpdateCheck.evaluate();
    expect(getDownloadState).toHaveBeenCalledWith("genji");
    expect(notice).toMatchObject({ id: "dict-not-installed", type: "warning" });
    expect(notice?.actions?.[0]?.label).toBe("今すぐダウンロード");
    expect(checkForUpdate).not.toHaveBeenCalled();
    expect(startCountdownDownload).not.toHaveBeenCalled();
  });

  it("starts a 3s countdown (no notice) when not installed and auto-download is allowed", async () => {
    setElectronDict(true);
    getDownloadState.mockResolvedValue({ providerId: "genji", status: "not-installed" });
    isAutoDownloadAllowed.mockResolvedValue(true);
    const notice = await dictUpdateCheck.evaluate();
    expect(notice).toBeNull();
    expect(startCountdownDownload).toHaveBeenCalledTimes(1);
    expect(startCountdownDownload.mock.calls[0][0]).toMatchObject({
      key: "dict-not-installed",
      seconds: 3,
    });
  });

  it("informs when an update is available (auto-download not allowed)", async () => {
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
    expect(startCountdownDownload).not.toHaveBeenCalled();
  });

  it("starts a 30s countdown (no notice) when an update is available and allowed", async () => {
    setElectronDict(true);
    getDownloadState.mockResolvedValue({ providerId: "genji", status: "installed" });
    checkForUpdate.mockResolvedValue({
      latestVersion: "1.1.0",
      installedVersion: "1.0.0",
      updateAvailable: true,
    });
    isAutoDownloadAllowed.mockResolvedValue(true);
    const notice = await dictUpdateCheck.evaluate();
    expect(notice).toBeNull();
    expect(startCountdownDownload).toHaveBeenCalledTimes(1);
    expect(startCountdownDownload.mock.calls[0][0]).toMatchObject({
      key: "dict-update",
      seconds: 30,
    });
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
    expect(checkForUpdate).not.toHaveBeenCalled();
  });

  it("skips checkForUpdate and returns no update notice when auto-check is disabled", async () => {
    setElectronDict(true);
    getDownloadState.mockResolvedValue({ providerId: "genji", status: "installed" });
    loadAppState.mockResolvedValue({ dictAutoCheckUpdates: false });
    const notice = await dictUpdateCheck.evaluate();
    expect(notice).toBeNull();
    expect(checkForUpdate).not.toHaveBeenCalled();
  });

  it("still warns when not installed even if auto-check is disabled", async () => {
    setElectronDict(true);
    getDownloadState.mockResolvedValue({ providerId: "genji", status: "not-installed" });
    loadAppState.mockResolvedValue({ dictAutoCheckUpdates: false });
    const notice = await dictUpdateCheck.evaluate();
    expect(notice).toMatchObject({ id: "dict-not-installed", type: "warning" });
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

  it("manual download action delegates to runDictDownloadWithProgress", async () => {
    setElectronDict(true);
    getDownloadState.mockResolvedValue({ providerId: "genji", status: "not-installed" });
    const notice = await dictUpdateCheck.evaluate();
    const onClick = notice?.actions?.[0]?.onClick;
    expect(onClick).toBeTypeOf("function");
    onClick?.();
    expect(runDictDownloadWithProgress).toHaveBeenCalledTimes(1);
  });
});
