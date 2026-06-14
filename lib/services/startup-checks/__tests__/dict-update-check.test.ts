import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { getDownloadState, checkForUpdate } = vi.hoisted(() => ({
  getDownloadState: vi.fn(),
  checkForUpdate: vi.fn(),
}));
vi.mock("@/lib/dict/dict-service", () => ({
  getDictService: () => ({ getDownloadState, checkForUpdate }),
}));
vi.mock("@/lib/services/notification-manager", () => ({
  notificationManager: { info: vi.fn(), showMessage: vi.fn() },
}));

import { dictUpdateCheck } from "@/lib/services/startup-checks/dict-update-check";

function setElectronDict(present: boolean) {
  if (present) {
    (window as unknown as { electronAPI?: unknown }).electronAPI = {
      dict: {
        download: vi.fn(async () => {}),
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
});
