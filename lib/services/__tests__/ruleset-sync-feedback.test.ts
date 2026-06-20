/**
 * Tests for the shared ruleset-sync toast helpers (#1838).
 *
 * Regression: the settings「すべて更新」/ 再ダウンロードボタン（useRulesetStatus.sync）
 * showed no progress/completion toast — only the startup auto-update path did.
 * These helpers centralize the feedback so both paths stay in sync.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { showMessage, dismiss, success, warning, error } = vi.hoisted(() => ({
  showMessage: vi.fn(() => "toast-id"),
  dismiss: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/services/notification-manager", () => ({
  notificationManager: { showMessage, dismiss, success, warning, error },
}));

import {
  RULESET_SYNC_PROGRESS_MESSAGE,
  showRulesetSyncProgress,
  notifyRulesetSyncSummary,
  notifyRulesetSyncError,
} from "@/lib/services/ruleset-sync-feedback";

describe("ruleset-sync-feedback", () => {
  beforeEach(() => {
    showMessage.mockClear();
    dismiss.mockClear();
    success.mockClear();
    warning.mockClear();
    error.mockClear();
  });

  it("shows a persistent progress toast and returns its id", () => {
    const id = showRulesetSyncProgress();
    expect(id).toBe("toast-id");
    expect(showMessage).toHaveBeenCalledWith(RULESET_SYNC_PROGRESS_MESSAGE, {
      type: "info",
      duration: 0,
    });
  });

  it("reports the installed count on success", () => {
    notifyRulesetSyncSummary([
      { status: "installed" },
      { status: "up-to-date" },
      { status: "installed" },
    ]);
    expect(success).toHaveBeenCalledWith("校正ルールセットを更新しました（2 件）。");
    expect(warning).not.toHaveBeenCalled();
  });

  it("stays silent when nothing was installed", () => {
    notifyRulesetSyncSummary([{ status: "up-to-date" }, { status: "skipped" }]);
    expect(success).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
  });

  it("warns when some packs fail", () => {
    notifyRulesetSyncSummary([{ status: "installed" }, { status: "error" }]);
    expect(warning).toHaveBeenCalledWith(
      "校正ルールセットを更新しました（1 件）。1 件は失敗しました。",
    );
    expect(success).not.toHaveBeenCalled();
  });

  it("tolerates a missing/non-array summary", () => {
    notifyRulesetSyncSummary(undefined);
    expect(success).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
  });

  it("surfaces an error toast", () => {
    notifyRulesetSyncError(new Error("boom"));
    expect(error).toHaveBeenCalledWith("校正ルールセットの更新に失敗しました：boom");
  });
});
