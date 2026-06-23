/**
 * Web クラッシュ復元の「バッファ vs ディスク」選択検出テスト（#1966 H-5/H-6）。
 *
 * ディスク内容を既定で読み込みつつ、前回終了時の永続バッファがディスクと食い違う
 * 場合は recoveredBuffer を立て、UI が「このバッファを使用 / 破棄」を提示できるように
 * する。食い違いが無ければ recoveredBuffer は null。clearRecoveredBuffer は永続バッファを
 * 破棄し状態をクリアする（使用適用後 / 破棄時）。
 *
 * REAL フックを createRoot + act で駆動し、フックの返り値を捕捉する。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { useTabPersistence, type UseTabPersistenceReturn } from "../use-tab-persistence";
import type { TabState, TabId, EditorTabState } from "../tab-types";

const { getItemMock, loadEditorBufferMock, clearEditorBufferMock } = vi.hoisted(() => ({
  getItemMock: vi.fn(async () => "manuscript.mdi" as string | null),
  loadEditorBufferMock: vi.fn(async () => null as unknown),
  clearEditorBufferMock: vi.fn(async () => undefined),
}));

vi.mock("@/lib/services/notification-manager", () => ({
  notificationManager: { warning: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/storage/storage-service", () => ({
  getStorageService: () => ({
    initialize: vi.fn(async () => undefined),
    loadAppState: vi.fn(async () => null),
    getItem: getItemMock,
    loadEditorBuffer: loadEditorBufferMock,
    clearEditorBuffer: clearEditorBufferMock,
  }),
}));

vi.mock("@/lib/storage/app-state-manager", () => ({
  fetchWindowState: vi.fn(async () => null),
  persistWindowState: vi.fn(async () => undefined),
  persistAppState: vi.fn(async () => undefined),
}));

vi.mock("@/lib/project/workspace-persistence", () => ({
  persistWorkspaceJson: vi.fn(async () => undefined),
  toRelativePath: (p: string) => p,
  toAbsolutePath: (p: string) => p,
}));

vi.mock("@/lib/services/project-file-service", () => ({
  getProjectFileService: () => ({ readFile: vi.fn(async () => "") }),
}));

// ---------------------------------------------------------------------------
// Harness — captures the hook return so we can assert recoveredBuffer
// ---------------------------------------------------------------------------

function Harness({ onReturn }: { onReturn: (r: UseTabPersistenceReturn) => void }): null {
  const tabsRef = useRef<TabState[]>([]);
  const activeTabIdRef = useRef<TabId>("");
  const isProjectRef = useRef(false);
  // 安定した setter 参照（毎レンダー新規生成すると復元 effect の deps が変わり無限ループ）。
  const setTabs = useRef(vi.fn()).current;
  const setActiveTabId = useRef(vi.fn()).current;
  const ret = useTabPersistence({
    tabs: [],
    setTabs: setTabs as never,
    activeTabId: "",
    setActiveTabId: setActiveTabId as never,
    tabsRef,
    activeTabIdRef,
    isProjectRef,
    isElectron: false,
    skipAutoRestore: false,
    windowKey: null,
  });
  onReturn(ret);
  return null;
}

let root: Root;
let container: HTMLDivElement;
let lastReturn: UseTabPersistenceReturn | null = null;

function diskHandle(content: string, name = "manuscript.mdi") {
  return { getFile: vi.fn(async () => ({ text: async () => content, name })) };
}

beforeEach(() => {
  vi.useFakeTimers();
  lastReturn = null;
  getItemMock.mockReset();
  getItemMock.mockResolvedValue("manuscript.mdi");
  loadEditorBufferMock.mockReset();
  loadEditorBufferMock.mockResolvedValue(null);
  clearEditorBufferMock.mockReset();
  clearEditorBufferMock.mockResolvedValue(undefined);
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

async function mountAndSettle(): Promise<void> {
  await act(async () => {
    root.render(<Harness onReturn={(r) => (lastReturn = r)} />);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });
}

describe("#1966 H-5/H-6 — バッファ vs ディスクの選択検出", () => {
  it("バッファ内容がディスクと食い違うと recoveredBuffer を立てる（既定はディスク）", async () => {
    loadEditorBufferMock.mockResolvedValue({
      content: "未保存のバッファ内容",
      timestamp: 1,
      fileHandle: diskHandle("ディスク内容"),
    });

    await mountAndSettle();

    expect(lastReturn!.wasAutoRecovered).toBe(true);
    expect(lastReturn!.recoveredBuffer).not.toBeNull();
    expect(lastReturn!.recoveredBuffer!.content).toBe("未保存のバッファ内容");
    expect(lastReturn!.recoveredBuffer!.fileName).toBe("manuscript.mdi");
  });

  it("バッファ内容がディスクと一致すれば recoveredBuffer は立てない", async () => {
    loadEditorBufferMock.mockResolvedValue({
      content: "同じ内容",
      timestamp: 1,
      fileHandle: diskHandle("同じ内容"),
    });

    await mountAndSettle();

    expect(lastReturn!.wasAutoRecovered).toBe(true);
    expect(lastReturn!.recoveredBuffer).toBeNull();
  });

  it("バッファ content が無ければ recoveredBuffer は立てない", async () => {
    loadEditorBufferMock.mockResolvedValue({
      content: undefined,
      timestamp: 1,
      fileHandle: diskHandle("ディスク内容"),
    });

    await mountAndSettle();

    expect(lastReturn!.recoveredBuffer).toBeNull();
  });

  it("clearRecoveredBuffer は永続バッファを破棄し状態をクリアする", async () => {
    loadEditorBufferMock.mockResolvedValue({
      content: "未保存のバッファ内容",
      timestamp: 1,
      fileHandle: diskHandle("ディスク内容"),
    });

    await mountAndSettle();
    expect(lastReturn!.recoveredBuffer).not.toBeNull();

    await act(async () => {
      await lastReturn!.clearRecoveredBuffer();
    });

    expect(clearEditorBufferMock).toHaveBeenCalledWith("manuscript.mdi");
    expect(lastReturn!.recoveredBuffer).toBeNull();
  });
});
