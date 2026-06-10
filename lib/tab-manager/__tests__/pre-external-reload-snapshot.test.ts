/**
 * Tests for G2 (pre-external-reload snapshot) flow in use-file-watch-integration.
 *
 * When an external file change is detected on a dirty tab and the user confirms
 * "ディスクの内容を採用", a pre-external-reload snapshot must be created with the
 * current in-memory content BEFORE that content is overwritten by the disk version.
 *
 * G2: 外部編集 reload プロンプトでユーザーが「ディスクの内容を採用」を選んだとき、
 * メモリ上の編集を pre-external-reload スナップショットとして保存してから
 * ディスクの内容で上書きする。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildOnChanged } from "../use-file-watch-integration";
import type { EditorTabState, TabState } from "../tab-types";

// Mock notificationManager so its actions are captured rather than rendered
vi.mock("../../services/notification-manager", () => ({
  notificationManager: {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    showMessage: vi.fn(),
  },
}));

import { notificationManager } from "../../services/notification-manager";

function makeDirtyEditorTab(overrides: Partial<EditorTabState> = {}): EditorTabState {
  return {
    tabKind: "editor",
    id: "tab-1",
    file: { path: "/p/main.mdi", handle: null, name: "main.mdi" },
    content: "in-memory edited content",
    lastSavedContent: "original disk content",
    isDirty: true,
    lastSavedTime: 1_000_000,
    lastSaveWasAuto: false,
    isSaving: false,
    isPreview: false,
    fileType: ".mdi",
    fileSyncStatus: "dirty",
    conflictDiskContent: null,
    ...overrides,
  };
}

describe("G2: pre-external-reload snapshot", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let setTabs: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let openDiffTab: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let onEditorRemountNeeded: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tryCreateSnapshot: any;
  let tab: EditorTabState;
  let tabsRef: { current: TabState[] };

  beforeEach(() => {
    vi.clearAllMocks();
    setTabs = vi.fn();
    openDiffTab = vi.fn();
    onEditorRemountNeeded = vi.fn();
    tryCreateSnapshot = vi.fn().mockResolvedValue(undefined);
    tab = makeDirtyEditorTab();
    tabsRef = { current: [tab] };
  });

  function getActionCallback(label: string): () => void | Promise<void> {
    // Find the "showMessage" call and extract the action with the given label
    const showMessage = vi.mocked(notificationManager.showMessage);
    expect(showMessage).toHaveBeenCalled();
    const lastCall = showMessage.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const options = lastCall![1] as { actions?: Array<{ label: string; onClick: () => void }> };
    const action = options.actions?.find((a) => a.label === label);
    expect(action).toBeDefined();
    return action!.onClick;
  }

  it("creates pre-external-reload snapshot when user accepts disk content on dirty tab", async () => {
    const onChanged = buildOnChanged(
      "tab-1",
      setTabs,
      tabsRef,
      openDiffTab,
      onEditorRemountNeeded,
      tryCreateSnapshot,
    );

    // External change arrives on a dirty tab → enters conflicted state, shows notification
    onChanged("disk content version", 2_000_000);

    // Locate the "ディスクの内容を採用" action and trigger it
    const acceptDisk = getActionCallback("ディスクの内容を採用");
    acceptDisk();

    // Snapshot should be invoked with type="pre-external-reload" and the IN-MEMORY content
    expect(tryCreateSnapshot).toHaveBeenCalledWith(
      "pre-external-reload",
      "/p/main.mdi",
      "main.mdi",
      "in-memory edited content", // ← user's unsaved edit, NOT the disk content
    );
  });

  it("does NOT create snapshot when tab is clean (no edits to preserve)", () => {
    const cleanTab = makeDirtyEditorTab({ isDirty: false, fileSyncStatus: "clean" });
    tabsRef.current = [cleanTab];

    const onChanged = buildOnChanged(
      "tab-1",
      setTabs,
      tabsRef,
      openDiffTab,
      onEditorRemountNeeded,
      tryCreateSnapshot,
    );

    // Clean tab path doesn't show a dialog — it auto-reloads via setTabs
    onChanged("disk content", 2_000_000);

    expect(tryCreateSnapshot).not.toHaveBeenCalled();
  });

  it("does NOT create snapshot when tryCreateSnapshot is undefined (graceful degradation)", () => {
    const onChanged = buildOnChanged(
      "tab-1",
      setTabs,
      tabsRef,
      openDiffTab,
      onEditorRemountNeeded,
      undefined, // no tryCreateSnapshot
    );

    onChanged("disk content", 2_000_000);

    const acceptDisk = getActionCallback("ディスクの内容を採用");
    // Should not throw even without tryCreateSnapshot
    expect(() => acceptDisk()).not.toThrow();
  });

  it("snapshot is created BEFORE setTabs replaces content (ordering check)", () => {
    const callOrder: string[] = [];
    tryCreateSnapshot.mockImplementation(async () => {
      callOrder.push("tryCreateSnapshot");
    });
    setTabs.mockImplementation(() => {
      callOrder.push("setTabs");
    });

    const onChanged = buildOnChanged(
      "tab-1",
      setTabs,
      tabsRef,
      openDiffTab,
      onEditorRemountNeeded,
      tryCreateSnapshot,
    );

    onChanged("disk content", 2_000_000);
    // setTabs was called once to mark conflicted; clear and trigger accept
    callOrder.length = 0;

    const acceptDisk = getActionCallback("ディスクの内容を採用");
    acceptDisk();

    // tryCreateSnapshot is dispatched (fire-and-forget) before the synchronous setTabs.
    // Both should appear in order: snapshot scheduled first, then state replacement.
    expect(callOrder[0]).toBe("tryCreateSnapshot");
    expect(callOrder).toContain("setTabs");
  });

  it("uses the LATEST in-memory content when user edits after conflict is detected", async () => {
    // Regression test for issue #1561:
    // localContent is captured at conflict-detection time; if the user types more
    // between the toast appearing and clicking "ディスクの内容を採用", the snapshot
    // must record the updated content, not the stale closure value.
    const onChanged = buildOnChanged(
      "tab-1",
      setTabs,
      tabsRef,
      openDiffTab,
      onEditorRemountNeeded,
      tryCreateSnapshot,
    );

    // External change detected: tab has draft A at this point
    onChanged("disk content version", 2_000_000);

    // User continues editing → draft B (simulate by updating tabsRef directly)
    const updatedTab: EditorTabState = {
      ...tab,
      content: "draft B — additional paragraphs written after conflict",
      isDirty: true,
      fileSyncStatus: "conflicted",
      conflictDiskContent: "disk content version",
    };
    tabsRef.current = [updatedTab];

    // User now clicks "ディスクの内容を採用"
    const acceptDisk = getActionCallback("ディスクの内容を採用");
    acceptDisk();

    // Snapshot must contain draft B, not the stale draft A
    expect(tryCreateSnapshot).toHaveBeenCalledWith(
      "pre-external-reload",
      "/p/main.mdi",
      "main.mdi",
      "draft B — additional paragraphs written after conflict",
    );
  });

  it("uses display name fallback when file.name is missing", () => {
    const tabWithoutName = makeDirtyEditorTab({
      file: { path: "/p/main.mdi", handle: null, name: "" },
    });
    tabsRef.current = [tabWithoutName];

    const onChanged = buildOnChanged(
      "tab-1",
      setTabs,
      tabsRef,
      openDiffTab,
      onEditorRemountNeeded,
      tryCreateSnapshot,
    );

    onChanged("disk content", 2_000_000);
    const acceptDisk = getActionCallback("ディスクの内容を採用");
    acceptDisk();

    expect(tryCreateSnapshot).toHaveBeenCalledWith(
      "pre-external-reload",
      "/p/main.mdi",
      expect.any(String),
      "in-memory edited content",
    );
  });
});
