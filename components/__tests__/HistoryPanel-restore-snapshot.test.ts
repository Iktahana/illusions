/**
 * Tests for G3 (restore-point snapshot) flow in HistoryPanel.executeRestore.
 *
 * When the user confirms restoring a history snapshot, the panel must first
 * create a "restore-point" snapshot of the CURRENT in-memory content so the
 * user can undo the restore. The restore-point snapshot is created BEFORE
 * historyService.restoreSnapshot() is invoked.
 *
 * G3: 復元実行直前に現在の内容を restore-point スナップショットとして保存。
 * 復元の取り消しを可能にする。
 *
 * Tests the executeRestore logic extracted as a pure async function — this lets us
 * verify the snapshot/restore ordering without mounting React.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SnapshotEntry, RestoreResult } from "@/lib/services/history-service";

// Mock the history-service and vfs modules
vi.mock("@/lib/services/history-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/history-service")>(
    "@/lib/services/history-service",
  );
  return {
    ...actual,
    getHistoryService: vi.fn(),
  };
});

vi.mock("@/lib/services/project-file-service", () => ({
  getProjectFileService: vi.fn(),
}));

import { getHistoryService } from "@/lib/services/history-service";
import { getProjectFileService } from "@/lib/services/project-file-service";

/**
 * Mirror of executeRestore behavior from HistoryPanel.tsx for testing.
 * Tests the pure logic without mounting the React component.
 */
async function executeRestoreLogic(
  snapshot: SnapshotEntry,
  currentContent: string,
  sourcePath: string,
  displayName: string,
): Promise<{ snapshotCreated: boolean; restoreResult: RestoreResult }> {
  const historyService = getHistoryService();
  const vfs = getProjectFileService();
  let snapshotCreated = false;

  // G3 check: only if there's current content and VFS root is open
  if (currentContent && vfs.isRootOpen()) {
    try {
      await historyService.createSnapshot({
        sourcePath,
        displayName,
        content: currentContent,
        type: "restore-point",
      });
      snapshotCreated = true;
    } catch (err) {
      // Non-fatal: log and proceed
      console.warn("復元前スナップショットの作成に失敗しました:", err);
    }
  }

  const restoreResult = await historyService.restoreSnapshot(snapshot.id);
  return { snapshotCreated, restoreResult };
}

function makeSnapshot(): SnapshotEntry {
  return {
    id: "snap-1",
    timestamp: 1_000_000,
    filename: "test.[20260523].history",
    sourcePath: "/p/main.mdi",
    displayName: "main.mdi",
    type: "manual",
    characterCount: 100,
    fileSize: 100,
    checksum: "abc",
  };
}

describe("G3: restore-point snapshot", () => {
  let createSnapshot: ReturnType<typeof vi.fn>;
  let restoreSnapshot: ReturnType<typeof vi.fn>;
  let isRootOpen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    createSnapshot = vi.fn().mockResolvedValue({ id: "new-snap" });
    restoreSnapshot = vi.fn().mockResolvedValue({ success: true, content: "restored content" });
    isRootOpen = vi.fn().mockReturnValue(true);

    vi.mocked(getHistoryService).mockReturnValue({
      createSnapshot,
      restoreSnapshot,
    } as unknown as ReturnType<typeof getHistoryService>);

    vi.mocked(getProjectFileService).mockReturnValue({
      isRootOpen,
    } as unknown as ReturnType<typeof getProjectFileService>);
  });

  it("creates restore-point snapshot BEFORE calling restoreSnapshot", async () => {
    const callOrder: string[] = [];
    createSnapshot.mockImplementation(async () => {
      callOrder.push("createSnapshot");
      return { id: "rp-1" };
    });
    restoreSnapshot.mockImplementation(async () => {
      callOrder.push("restoreSnapshot");
      return { success: true, content: "restored" };
    });

    await executeRestoreLogic(makeSnapshot(), "current content", "/p/main.mdi", "main.mdi");

    expect(callOrder).toEqual(["createSnapshot", "restoreSnapshot"]);
  });

  it("uses type=restore-point and the CURRENT content (not snapshot content)", async () => {
    await executeRestoreLogic(makeSnapshot(), "current in-memory edits", "/p/main.mdi", "main.mdi");

    expect(createSnapshot).toHaveBeenCalledWith({
      sourcePath: "/p/main.mdi",
      displayName: "main.mdi",
      content: "current in-memory edits", // ← current, NOT the snapshot's content
      type: "restore-point",
    });
  });

  it("skips snapshot when VFS root is not open (standalone mode)", async () => {
    isRootOpen.mockReturnValue(false);

    const { snapshotCreated, restoreResult } = await executeRestoreLogic(
      makeSnapshot(),
      "current content",
      "/p/main.mdi",
      "main.mdi",
    );

    expect(snapshotCreated).toBe(false);
    expect(createSnapshot).not.toHaveBeenCalled();
    // Restore still proceeds
    expect(restoreSnapshot).toHaveBeenCalled();
    expect(restoreResult.success).toBe(true);
  });

  it("skips snapshot when currentContent is empty", async () => {
    const { snapshotCreated } = await executeRestoreLogic(
      makeSnapshot(),
      "",
      "/p/main.mdi",
      "main.mdi",
    );

    expect(snapshotCreated).toBe(false);
    expect(createSnapshot).not.toHaveBeenCalled();
    expect(restoreSnapshot).toHaveBeenCalled();
  });

  it("proceeds with restore even when snapshot creation fails (non-fatal)", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    createSnapshot.mockRejectedValue(new Error("disk full"));

    const { restoreResult } = await executeRestoreLogic(
      makeSnapshot(),
      "current content",
      "/p/main.mdi",
      "main.mdi",
    );

    // Snapshot failed but restore still ran
    expect(restoreSnapshot).toHaveBeenCalled();
    expect(restoreResult.success).toBe(true);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("snapshot uses the source path and display name from the target file", async () => {
    await executeRestoreLogic(makeSnapshot(), "content", "/different/path.mdi", "chapter1.mdi");

    expect(createSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePath: "/different/path.mdi",
        displayName: "chapter1.mdi",
        type: "restore-point",
      }),
    );
  });
});
