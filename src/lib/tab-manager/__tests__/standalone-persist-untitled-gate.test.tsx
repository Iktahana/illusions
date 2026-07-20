/**
 * スタンドアロン永続化で unsavedContent を保存する条件のテスト（#1965 / Codex P2 修正）。
 *
 * unsavedContent は「真の無題タブ（ファイル記述子が一切無い）」だけに保存しなければならない。
 * Web の File System Access で開いたファイルは `file.path === null` だが `file.handle` を
 * 持つため、`!t.file?.path` で判定すると保存済みファイルを無題と誤判定し、全文を AppState に
 * 重複保存してしまう（容量肥大 + QuotaExceeded リスク増）。`!t.file` で判定することを固定する。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { useTabPersistence } from "../use-tab-persistence";
import { createNewTab } from "../types";
import type { TabState, TabId, EditorTabState, SerializedTab } from "../tab-types";

const { persistAppStateMock } = vi.hoisted(() => ({
  persistAppStateMock: vi.fn(async () => undefined),
}));

vi.mock("@/lib/services/notification-manager", () => ({
  notificationManager: { error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/storage/storage-service", () => ({
  getStorageService: () => ({
    initialize: vi.fn(async () => undefined),
    loadAppState: vi.fn(async () => null),
    getItem: vi.fn(async () => null),
    loadEditorBuffer: vi.fn(async () => null),
    clearEditorBuffer: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/lib/storage/app-state-manager", () => ({
  fetchWindowState: vi.fn(async () => null),
  persistWindowState: vi.fn(async () => undefined),
  persistAppState: persistAppStateMock,
}));

vi.mock("@/lib/project/workspace-persistence", () => ({
  persistWorkspaceJson: vi.fn(async () => undefined),
  toRelativePath: (p: string) => p,
  toAbsolutePath: (p: string) => p,
}));

vi.mock("@/lib/services/project-file-service", () => ({
  getProjectFileService: () => ({ readFile: vi.fn(async () => "") }),
}));

function Harness({ tabs }: { tabs: TabState[] }): null {
  const tabsRef = useRef<TabState[]>(tabs);
  tabsRef.current = tabs;
  const activeTabIdRef = useRef<TabId>(tabs[0]?.id ?? "");
  activeTabIdRef.current = tabs[0]?.id ?? "";
  const isProjectRef = useRef(false);
  useTabPersistence({
    tabs,
    setTabs: vi.fn(),
    activeTabId: tabs[0]?.id ?? "",
    setActiveTabId: vi.fn(),
    tabsRef,
    activeTabIdRef,
    isProjectRef,
    isElectron: false, // Web standalone → persistAppState
    skipAutoRestore: true,
    windowKey: null,
  });
  return null;
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  persistAppStateMock.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
});

function untitledDirty(content: string): EditorTabState {
  return { ...createNewTab(content), isDirty: true };
}

function webFileBackedDirty(content: string, name: string): EditorTabState {
  return {
    ...createNewTab(content),
    file: { path: null, handle: {} as unknown as FileSystemFileHandle, name },
    isDirty: true,
  };
}

function electronFileBackedDirty(content: string, path: string, name: string): EditorTabState {
  return { ...createNewTab(content), file: { path, handle: null, name }, isDirty: true };
}

async function persistAndRead(tabs: TabState[]): Promise<SerializedTab[]> {
  await act(async () => {
    root.render(<Harness tabs={tabs} />);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500); // > TAB_PERSIST_DEBOUNCE
  });
  const calls = persistAppStateMock.mock.calls as unknown as Array<
    [{ openTabs: { tabs: SerializedTab[] } }]
  >;
  const lastArg = calls[calls.length - 1]?.[0];
  if (!lastArg) throw new Error("persistAppState が呼ばれませんでした");
  return lastArg.openTabs.tabs;
}

describe("#1965 / Codex P2 — unsavedContent は真の無題タブだけに保存する", () => {
  it("真の無題 dirty タブは unsavedContent を保存する", async () => {
    const serialized = await persistAndRead([untitledDirty("未保存の下書き")]);
    expect(serialized).toHaveLength(1);
    expect(serialized[0].filePath).toBeNull();
    expect(serialized[0].unsavedContent).toBe("未保存の下書き");
  });

  it("【回帰】Web file-backed(handle あり/path null) dirty タブは unsavedContent を保存しない", async () => {
    const serialized = await persistAndRead([webFileBackedDirty("ファイル全文", "a.mdi")]);
    expect(serialized).toHaveLength(1);
    expect(serialized[0].filePath).toBeNull(); // Web は path を持たない
    // 全文を AppState に重複保存しない（容量肥大 / quota 回避）。
    expect(serialized[0].unsavedContent).toBeUndefined();
  });

  it("Electron file-backed(path あり) dirty タブも unsavedContent を保存しない", async () => {
    const serialized = await persistAndRead([
      electronFileBackedDirty("本文", "/abs/b.mdi", "b.mdi"),
    ]);
    expect(serialized).toHaveLength(1);
    expect(serialized[0].filePath).toBe("/abs/b.mdi");
    expect(serialized[0].unsavedContent).toBeUndefined();
  });

  it("混在: 無題のみ unsavedContent、file-backed は持たない", async () => {
    const serialized = await persistAndRead([
      untitledDirty("無題内容"),
      webFileBackedDirty("Web全文", "w.mdi"),
      electronFileBackedDirty("Electron全文", "/abs/e.mdi", "e.mdi"),
    ]);
    expect(serialized).toHaveLength(3);
    expect(serialized[0].unsavedContent).toBe("無題内容");
    expect(serialized[1].unsavedContent).toBeUndefined();
    expect(serialized[2].unsavedContent).toBeUndefined();
  });
});
