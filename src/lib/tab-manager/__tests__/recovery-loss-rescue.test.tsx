/**
 * Web クラッシュ復元の損失救済テスト（#1966 H-2）。
 *
 * 修正前: 自動復元時に保存済みファイルを fileHandle.getFile() で再オープンできない
 * （移動/削除/権限取消）と、バッファを黙って破棄し未保存内容がサイレントに消えていた。
 *
 * 修正後: 再オープン失敗時はバッファに残る内容を無題タブとして救済し、損失をユーザーへ
 * 通知する。バッファが空なら復元できる内容が無い旨を通知する。成功時は従来どおり。
 *
 * REAL フックを createRoot + act で駆動。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { useTabPersistence } from "../use-tab-persistence";
import type { TabState, TabId, EditorTabState } from "../tab-types";

const { getItemMock, loadEditorBufferMock, clearEditorBufferMock } = vi.hoisted(() => ({
  getItemMock: vi.fn(async () => "manuscript.mdi" as string | null),
  loadEditorBufferMock: vi.fn(async () => null as unknown),
  clearEditorBufferMock: vi.fn(async () => undefined),
}));

const { warningMock, infoMock, errorMock } = vi.hoisted(() => ({
  warningMock: vi.fn((_m: string) => "id"),
  infoMock: vi.fn((_m: string) => "id"),
  errorMock: vi.fn((_m: string) => "id"),
}));

vi.mock("@/lib/services/notification-manager", () => ({
  notificationManager: { warning: warningMock, info: infoMock, error: errorMock },
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
// Harness (Web standalone: isElectron=false)
// ---------------------------------------------------------------------------

function Harness({
  setTabs,
  setActiveTabId,
}: {
  setTabs: (a: React.SetStateAction<TabState[]>) => void;
  setActiveTabId: (a: React.SetStateAction<TabId>) => void;
}): null {
  const tabsRef = useRef<TabState[]>([]);
  const activeTabIdRef = useRef<TabId>("");
  const isProjectRef = useRef(false);
  useTabPersistence({
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
  return null;
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  getItemMock.mockReset();
  getItemMock.mockResolvedValue("manuscript.mdi");
  loadEditorBufferMock.mockReset();
  loadEditorBufferMock.mockResolvedValue(null);
  clearEditorBufferMock.mockReset();
  clearEditorBufferMock.mockResolvedValue(undefined);
  warningMock.mockClear();
  infoMock.mockClear();
  errorMock.mockClear();
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

function tabFrom(setTabs: ReturnType<typeof vi.fn>): EditorTabState | null {
  if (setTabs.mock.calls.length === 0) return null;
  const updater = setTabs.mock.calls[0][0] as (prev: TabState[]) => TabState[];
  const result = updater([]);
  return (result[0] ?? null) as EditorTabState | null;
}

async function mountAndSettle(
  setTabs: ReturnType<typeof vi.fn>,
  setActiveTabId: ReturnType<typeof vi.fn>,
): Promise<void> {
  await act(async () => {
    root.render(<Harness setTabs={setTabs as never} setActiveTabId={setActiveTabId as never} />);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("#1966 H-2 — Web 復元失敗時の損失救済", () => {
  it("getFile() 失敗 + バッファに内容あり → 無題 dirty タブで救済し warning 通知", async () => {
    loadEditorBufferMock.mockResolvedValue({
      content: "未保存の原稿本文",
      timestamp: 1,
      fileHandle: { getFile: vi.fn(async () => Promise.reject(new Error("NotFoundError"))) },
    });
    const setTabs = vi.fn();
    const setActiveTabId = vi.fn();

    await mountAndSettle(setTabs, setActiveTabId);

    const tab = tabFrom(setTabs);
    expect(tab).not.toBeNull();
    expect(tab!.content).toBe("未保存の原稿本文");
    expect(tab!.isDirty).toBe(true);
    expect(tab!.file).toBeNull(); // 無題（保存先未指定）
    expect(warningMock).toHaveBeenCalledTimes(1);
    expect(warningMock.mock.calls[0][0]).toContain("無題タブとして復元");
    expect(infoMock).not.toHaveBeenCalled();
    // バッファはタブへ移したので破棄してよい。
    expect(clearEditorBufferMock).toHaveBeenCalled();
  });

  it("getFile() 失敗 + バッファ空 → 復元できない旨を info 通知（救済タブ無し）", async () => {
    loadEditorBufferMock.mockResolvedValue({
      content: "",
      timestamp: 1,
      fileHandle: { getFile: vi.fn(async () => Promise.reject(new Error("NotFoundError"))) },
    });
    const setTabs = vi.fn();
    const setActiveTabId = vi.fn();

    await mountAndSettle(setTabs, setActiveTabId);

    // 救済内容が無いので、フォールバックの空 new タブが作られる（content 空）。
    const tab = tabFrom(setTabs);
    expect(tab?.content ?? "").toBe("");
    expect(infoMock).toHaveBeenCalledTimes(1);
    expect(infoMock.mock.calls[0][0]).toContain("再オープンできませんでした");
    expect(warningMock).not.toHaveBeenCalled();
  });

  it("consistency — getFile() 成功時はディスク内容で復元し損失通知を出さない", async () => {
    loadEditorBufferMock.mockResolvedValue({
      content: "古いバッファ",
      timestamp: 1,
      fileHandle: {
        getFile: vi.fn(async () => ({
          text: async () => "ディスク最新内容",
          name: "manuscript.mdi",
        })),
      },
    });
    const setTabs = vi.fn();
    const setActiveTabId = vi.fn();

    await mountAndSettle(setTabs, setActiveTabId);

    const tab = tabFrom(setTabs);
    expect(tab!.content).toBe("ディスク最新内容");
    expect(tab!.isDirty).toBe(false);
    expect(tab!.file?.name).toBe("manuscript.mdi");
    expect(warningMock).not.toHaveBeenCalled();
    expect(infoMock).not.toHaveBeenCalled();
  });

  it("consistency — バッファ自体が無ければ通知も救済もしない", async () => {
    loadEditorBufferMock.mockResolvedValue(null);
    const setTabs = vi.fn();
    const setActiveTabId = vi.fn();

    await mountAndSettle(setTabs, setActiveTabId);

    expect(warningMock).not.toHaveBeenCalled();
    expect(infoMock).not.toHaveBeenCalled();
  });
});
