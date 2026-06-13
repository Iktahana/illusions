import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { getDownloadState } = vi.hoisted(() => ({ getDownloadState: vi.fn() }));
vi.mock("@/lib/dict/dict-service", () => ({
  getDictService: () => ({ getDownloadState }),
}));
vi.mock("@/lib/services/notification-manager", () => ({
  notificationManager: { info: vi.fn(), showMessage: vi.fn() },
}));

import { dictUpdateCheck } from "@/lib/services/startup-checks/dict-update-check";

function setElectronDict(present: boolean) {
  if (present) {
    (window as unknown as { electronAPI?: unknown }).electronAPI = {
      dict: { download: vi.fn(async () => {}), getStatus: vi.fn(async () => ({})) },
    };
  } else {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  }
}

describe("dictUpdateCheck", () => {
  beforeEach(() => getDownloadState.mockReset());
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
  });

  it("informs when an update is available", async () => {
    setElectronDict(true);
    getDownloadState.mockResolvedValue({
      providerId: "genji",
      status: "installed",
      installedVersion: "1.0.0",
      latestVersion: "1.1.0",
      updateAvailable: true,
    });
    const notice = await dictUpdateCheck.evaluate();
    expect(notice).toMatchObject({ id: "dict-update-available", type: "info" });
    expect(notice?.message).toContain("1.0.0");
    expect(notice?.message).toContain("1.1.0");
  });

  it("returns null when installed and up to date", async () => {
    setElectronDict(true);
    getDownloadState.mockResolvedValue({
      providerId: "genji",
      status: "installed",
      updateAvailable: false,
    });
    expect(await dictUpdateCheck.evaluate()).toBeNull();
  });

  it("returns null while downloading/installing", async () => {
    setElectronDict(true);
    getDownloadState.mockResolvedValue({ providerId: "genji", status: "downloading", progress: 42 });
    expect(await dictUpdateCheck.evaluate()).toBeNull();
  });
});
