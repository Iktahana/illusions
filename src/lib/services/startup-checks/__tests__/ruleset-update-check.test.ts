import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { loadAppState } = vi.hoisted(() => ({ loadAppState: vi.fn() }));
const { showMessage, dismiss, success, warning, error, info } = vi.hoisted(() => ({
  showMessage: vi.fn(() => "toast-id"),
  dismiss: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@/lib/storage/storage-service", () => ({
  getStorageService: () => ({ loadAppState }),
}));
vi.mock("@/lib/services/notification-manager", () => ({
  notificationManager: { showMessage, dismiss, success, warning, error, info },
}));

import {
  rulesetUpdateCheck,
  runRulesetSync,
} from "@/lib/services/startup-checks/ruleset-update-check";

const checkUpdate = vi.fn();
const sync = vi.fn();

function setElectronRulesets(present: boolean): void {
  if (present) {
    (window as unknown as { electronAPI?: unknown }).electronAPI = {
      rulesets: { checkUpdate, sync },
    };
  } else {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  }
}

describe("rulesetUpdateCheck", () => {
  beforeEach(() => {
    checkUpdate.mockReset();
    sync.mockReset();
    sync.mockResolvedValue([]);
    loadAppState.mockReset();
    loadAppState.mockResolvedValue(null); // 既定 ON（未設定）
    showMessage.mockClear();
    dismiss.mockClear();
    success.mockClear();
    warning.mockClear();
    error.mockClear();
  });
  afterEach(() => setElectronRulesets(false));

  it("returns null on Web (no electronAPI.rulesets) without checking", async () => {
    setElectronRulesets(false);
    expect(await rulesetUpdateCheck.evaluate()).toBeNull();
    expect(checkUpdate).not.toHaveBeenCalled();
  });

  it("returns null when no ruleset has an update", async () => {
    setElectronRulesets(true);
    checkUpdate.mockResolvedValue([
      { id: "a", updateAvailable: false },
      { id: "b", updateAvailable: false },
    ]);
    expect(await rulesetUpdateCheck.evaluate()).toBeNull();
    expect(sync).not.toHaveBeenCalled();
  });

  it("silently suppresses when checkUpdate throws (network failure)", async () => {
    setElectronRulesets(true);
    checkUpdate.mockRejectedValue(new Error("network timeout"));
    expect(await rulesetUpdateCheck.evaluate()).toBeNull();
    expect(sync).not.toHaveBeenCalled();
  });

  it("auto-updates (no notice) when updates exist and auto-update is ON by default", async () => {
    setElectronRulesets(true);
    checkUpdate.mockResolvedValue([
      { id: "a", updateAvailable: true },
      { id: "b", updateAvailable: false },
    ]);
    const notice = await rulesetUpdateCheck.evaluate();
    expect(notice).toBeNull();
    // runRulesetSync が即 sync() を呼ぶ
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("shows a manual notice (no sync) when auto-update is explicitly OFF", async () => {
    setElectronRulesets(true);
    loadAppState.mockResolvedValue({ rulesetAutoUpdate: false });
    checkUpdate.mockResolvedValue([
      { id: "a", updateAvailable: true },
      { id: "b", updateAvailable: true },
    ]);
    const notice = await rulesetUpdateCheck.evaluate();
    expect(notice).toMatchObject({ id: "ruleset-update-available", type: "info" });
    expect(notice?.message).toContain("2");
    expect(notice?.actions?.[0]?.label).toBe("更新");
    expect(sync).not.toHaveBeenCalled();
  });

  it("manual notice action triggers a sync", async () => {
    setElectronRulesets(true);
    loadAppState.mockResolvedValue({ rulesetAutoUpdate: false });
    checkUpdate.mockResolvedValue([{ id: "a", updateAvailable: true }]);
    const notice = await rulesetUpdateCheck.evaluate();
    notice?.actions?.[0]?.onClick?.();
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("auto-updates when rulesetAutoUpdate is explicitly true", async () => {
    setElectronRulesets(true);
    loadAppState.mockResolvedValue({ rulesetAutoUpdate: true });
    checkUpdate.mockResolvedValue([{ id: "a", updateAvailable: true }]);
    expect(await rulesetUpdateCheck.evaluate()).toBeNull();
    expect(sync).toHaveBeenCalledTimes(1);
  });
});

describe("runRulesetSync", () => {
  beforeEach(() => {
    sync.mockReset();
    showMessage.mockClear();
    dismiss.mockClear();
    success.mockClear();
    warning.mockClear();
    error.mockClear();
  });
  afterEach(() => setElectronRulesets(false));

  it("is a no-op on Web", () => {
    setElectronRulesets(false);
    runRulesetSync();
    expect(showMessage).not.toHaveBeenCalled();
  });

  it("reports installed count on success", async () => {
    setElectronRulesets(true);
    sync.mockResolvedValue([
      { id: "a", status: "installed" },
      { id: "b", status: "up-to-date" },
    ]);
    runRulesetSync();
    // microtask を流す
    await Promise.resolve();
    await Promise.resolve();
    expect(dismiss).toHaveBeenCalledWith("toast-id");
    expect(success).toHaveBeenCalledWith("校正ルールセットを更新しました（1 件）。");
  });

  it("surfaces an error toast when sync rejects", async () => {
    setElectronRulesets(true);
    sync.mockRejectedValue(new Error("boom"));
    runRulesetSync();
    await Promise.resolve();
    await Promise.resolve();
    expect(error).toHaveBeenCalled();
  });
});
