/**
 * Electron スタンドアロンタブ復元のテスト（#1965）。
 *
 * 背景: スタンドアロンは VFS ルート未設定で起動するため、保存済み file-backed タブを
 * `getProjectFileService().readFile(絶対パス)` で再読込しようとすると main 側
 * validateVFSPath が必ず失敗する。よって file-backed タブは VFS ではなく main プロセスの
 * 承認済みパス再読込 IPC `window.electronAPI.readStandaloneFile` で復元する。無題/未保存
 * タブは VFS 非依存でバッファ (unsavedContent) から復元する。
 *
 * 最重要(業務非破壊): file-backed タブに対して VFS の readFile を**呼ばない**こと
 *  = 毎起動の validateVFSPath 失敗エラーを誘発しないこと。復元は readStandaloneFile 経由。
 *
 * REAL フックを createRoot + act で駆動（electron-gate テストと同じパターン）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { useTabPersistence } from "../use-tab-persistence";
import type { TabState, TabId, EditorTabState, SerializedTab } from "../tab-types";

const { fetchWindowStateMock, persistWindowStateMock, persistAppStateMock, loadAppStateMock } =
  vi.hoisted(() => ({
    fetchWindowStateMock: vi.fn(async () => null as unknown),
    persistWindowStateMock: vi.fn(async () => undefined),
    persistAppStateMock: vi.fn(async () => undefined),
    loadAppStateMock: vi.fn(async () => null as unknown),
  }));

const { readFileSpy } = vi.hoisted(() => ({ readFileSpy: vi.fn(async () => "DISK") }));

// #1965: main プロセスの承認済みパス再読込 IPC のモック。
const { readStandaloneFileMock } = vi.hoisted(() => ({
  readStandaloneFileMock: vi.fn(
    async (filePath: string) =>
      ({ success: true, path: filePath, content: "DISK" }) as
        | { success: true; path: string; content: string }
        | { success: false; code?: string; error?: string },
  ),
}));

vi.mock("@/lib/services/notification-manager", () => ({
  notificationManager: { error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/storage/storage-service", () => ({
  getStorageService: () => ({
    initialize: vi.fn(async () => undefined),
    loadAppState: loadAppStateMock,
    getItem: vi.fn(async () => null),
    loadEditorBuffer: vi.fn(async () => null),
    clearEditorBuffer: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/lib/storage/app-state-manager", () => ({
  fetchWindowState: fetchWindowStateMock,
  persistWindowState: persistWindowStateMock,
  persistAppState: persistAppStateMock,
}));

vi.mock("@/lib/project/workspace-persistence", () => ({
  persistWorkspaceJson: vi.fn(async () => undefined),
  toRelativePath: (p: string) => p,
  toAbsolutePath: (p: string) => p,
}));

vi.mock("@/lib/services/project-file-service", () => ({
  getProjectFileService: () => ({ readFile: readFileSpy }),
}));

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

interface HarnessProps {
  tabs: TabState[];
  activeTabId: TabId;
  windowKey?: string | null;
  setTabs: (action: React.SetStateAction<TabState[]>) => void;
  setActiveTabId: (action: React.SetStateAction<TabId>) => void;
}

function Harness({ tabs, activeTabId, windowKey, setTabs, setActiveTabId }: HarnessProps): null {
  const tabsRef = useRef<TabState[]>(tabs);
  tabsRef.current = tabs;
  const activeTabIdRef = useRef<TabId>(activeTabId);
  activeTabIdRef.current = activeTabId;
  const isProjectRef = useRef(false);
  // 安定した promise（毎レンダー新規生成すると復元 effect の deps が変わり再実行される。
  // 本番の vfsGate.promise は安定参照なので、テストでも安定させて挙動を一致させる）。
  const vfsReadyPromiseRef = useRef(Promise.resolve());

  useTabPersistence({
    tabs,
    setTabs: setTabs as never,
    activeTabId,
    setActiveTabId: setActiveTabId as never,
    tabsRef,
    activeTabIdRef,
    isProjectRef,
    isElectron: true,
    skipAutoRestore: false,
    vfsReadyPromise: vfsReadyPromiseRef.current,
    windowKey: windowKey ?? null,
  });
  return null;
}

let root: Root;
let container: HTMLDivElement;

function serialized(partial: Partial<SerializedTab>): SerializedTab {
  return {
    filePath: null,
    fileName: "新規ファイル",
    fileType: ".mdi",
    ...partial,
  };
}

/** restore がゲート越しに反映した EditorTabState[] を取り出す（updater を空 prev で評価）。 */
function restoredTabsFrom(setTabs: ReturnType<typeof vi.fn>): EditorTabState[] | null {
  if (setTabs.mock.calls.length === 0) return null;
  const updater = setTabs.mock.calls[setTabs.mock.calls.length - 1][0] as (
    prev: TabState[],
  ) => TabState[];
  return updater([]) as EditorTabState[];
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchWindowStateMock.mockReset();
  fetchWindowStateMock.mockResolvedValue(null);
  loadAppStateMock.mockReset();
  loadAppStateMock.mockResolvedValue(null);
  persistWindowStateMock.mockReset();
  persistWindowStateMock.mockResolvedValue(undefined);
  persistAppStateMock.mockReset();
  persistAppStateMock.mockResolvedValue(undefined);
  readFileSpy.mockReset();
  readFileSpy.mockResolvedValue("DISK");
  readStandaloneFileMock.mockReset();
  readStandaloneFileMock.mockImplementation(async (filePath: string) => ({
    success: true,
    path: filePath,
    content: "DISK",
  }));
  (window as unknown as { electronAPI?: unknown }).electronAPI = {
    readStandaloneFile: readStandaloneFileMock,
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  vi.useRealTimers();
});

async function mountAndSettle(props: Omit<HarnessProps, "tabs" | "activeTabId">): Promise<void> {
  await act(async () => {
    root.render(<Harness tabs={[]} activeTabId="" {...props} />);
  });
  // VFS race (Promise.resolve) + async state reads を消化。
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("#1965 — スタンドアロン無題タブの復元（安全サブセット）", () => {
  it("内容を持つ無題タブを dirty として復元する（AppState 経路 / windowKey なし）", async () => {
    loadAppStateMock.mockResolvedValue({
      openTabs: {
        tabs: [serialized({ unsavedContent: "未保存の本文", fileType: ".mdi" })],
        activeIndex: 0,
      },
    });
    const setTabs = vi.fn();
    const setActiveTabId = vi.fn();

    await mountAndSettle({ setTabs, setActiveTabId, windowKey: null });

    const restored = restoredTabsFrom(setTabs);
    expect(restored).not.toBeNull();
    expect(restored).toHaveLength(1);
    expect(restored![0].content).toBe("未保存の本文");
    expect(restored![0].isDirty).toBe(true);
    expect(restored![0].file).toBeNull();
    // 無題タブ復元は VFS を一切使わない（業務非破壊の核心）。
    expect(readFileSpy).not.toHaveBeenCalled();
  });

  it("空の無題タブは clean として復元する（windowKey 経路）", async () => {
    fetchWindowStateMock.mockResolvedValue({
      openTabs: { tabs: [serialized({ unsavedContent: "", fileType: ".txt" })], activeIndex: 0 },
    });
    const setTabs = vi.fn();
    const setActiveTabId = vi.fn();

    await mountAndSettle({ setTabs, setActiveTabId, windowKey: "/win/key" });

    const restored = restoredTabsFrom(setTabs);
    expect(restored).toHaveLength(1);
    expect(restored![0].content).toBe("");
    expect(restored![0].isDirty).toBe(false);
    expect(restored![0].fileType).toBe(".txt");
    expect(readFileSpy).not.toHaveBeenCalled();
  });

  it("file-backed タブを readStandaloneFile 経由で復元する（VFS readFile は呼ばない）", async () => {
    loadAppStateMock.mockResolvedValue({
      openTabs: {
        tabs: [serialized({ filePath: "/abs/manuscript.mdi", fileName: "manuscript.mdi" })],
        activeIndex: 0,
      },
    });
    readStandaloneFileMock.mockResolvedValue({
      success: true,
      path: "/abs/manuscript.mdi",
      content: "本文ディスク内容",
    });
    const setTabs = vi.fn();
    const setActiveTabId = vi.fn();

    await mountAndSettle({ setTabs, setActiveTabId, windowKey: null });

    const restored = restoredTabsFrom(setTabs);
    expect(restored).toHaveLength(1);
    expect(restored![0].file?.path).toBe("/abs/manuscript.mdi");
    expect(restored![0].file?.name).toBe("manuscript.mdi");
    expect(restored![0].content).toBe("本文ディスク内容");
    expect(restored![0].isDirty).toBe(false);
    expect(restored![0].fileSyncStatus).toBe("clean");
    // 復元は承認済みパス IPC 経由。VFS の readFile は呼ばない（validateVFSPath 失敗回避）。
    expect(readStandaloneFileMock).toHaveBeenCalledWith("/abs/manuscript.mdi");
    expect(readFileSpy).not.toHaveBeenCalled();
  });

  it("読込失敗(移動/削除/未承認)の file-backed は復元せずエラーを通知する", async () => {
    loadAppStateMock.mockResolvedValue({
      openTabs: {
        tabs: [serialized({ filePath: "/abs/gone.mdi", fileName: "gone.mdi" })],
        activeIndex: 0,
      },
    });
    readStandaloneFileMock.mockResolvedValue({ success: false, code: "ENOENT" });
    const setTabs = vi.fn();
    const setActiveTabId = vi.fn();

    await mountAndSettle({ setTabs, setActiveTabId, windowKey: null });

    // 復元できる対象が無いので restore 由来の setTabs は呼ばれない。
    expect(restoredTabsFrom(setTabs)).toBeNull();
    expect(readStandaloneFileMock).toHaveBeenCalledWith("/abs/gone.mdi");
    expect(readFileSpy).not.toHaveBeenCalled();
  });

  it("file-backed + 無題 混在では両方を元の順序で復元する", async () => {
    loadAppStateMock.mockResolvedValue({
      openTabs: {
        tabs: [
          serialized({ filePath: "/abs/a.mdi", fileName: "a.mdi" }),
          serialized({ unsavedContent: "下書き", fileType: ".mdi" }),
        ],
        activeIndex: 1,
      },
    });
    readStandaloneFileMock.mockResolvedValue({
      success: true,
      path: "/abs/a.mdi",
      content: "Aの本文",
    });
    const setTabs = vi.fn();
    const setActiveTabId = vi.fn();

    await mountAndSettle({ setTabs, setActiveTabId, windowKey: null });

    const restored = restoredTabsFrom(setTabs);
    expect(restored).toHaveLength(2);
    expect(restored![0].file?.path).toBe("/abs/a.mdi");
    expect(restored![0].content).toBe("Aの本文");
    expect(restored![1].file).toBeNull();
    expect(restored![1].content).toBe("下書き");
    // activeIndex=1 は復元済みリスト範囲内の id を指す。
    const idUpdater = setActiveTabId.mock.calls[0][0] as (prev: TabId) => TabId;
    expect(idUpdater("")).toBe(restored![1].id);
    expect(readFileSpy).not.toHaveBeenCalled();
  });

  it("保存状態が無ければ復元しない（setTabs 不呼び出し・readFile 不呼び出し）", async () => {
    // mock は既定で null。
    const setTabs = vi.fn();
    const setActiveTabId = vi.fn();

    await mountAndSettle({ setTabs, setActiveTabId, windowKey: null });

    expect(setTabs).not.toHaveBeenCalled();
    expect(readFileSpy).not.toHaveBeenCalled();
  });

  it("待機中にユーザーがタブを開いた場合は復元で上書きしない（prev 優先）", async () => {
    loadAppStateMock.mockResolvedValue({
      openTabs: { tabs: [serialized({ unsavedContent: "復元候補" })], activeIndex: 0 },
    });
    const setTabs = vi.fn();
    const setActiveTabId = vi.fn();

    await mountAndSettle({ setTabs, setActiveTabId, windowKey: null });

    // restore は setTabs((prev)=>prev.length>0?prev:restored) を呼ぶ。
    // 既存タブがある状況では prev を返す（= 上書きしない）。
    const updater = setTabs.mock.calls[setTabs.mock.calls.length - 1][0] as (
      prev: TabState[],
    ) => TabState[];
    const existing = [{ id: "existing" } as unknown as TabState];
    expect(updater(existing)).toBe(existing);
  });

  it("状態読み込みが throw しても復元 effect はクラッシュせず readFile を呼ばない", async () => {
    // 注: DB 読み込み失敗時の空起動 + 通知は Phase 1 の initializeStorage catch が担当する
    // ため、そちらは別途 setTabs(エラータブ) を呼ぶ。ここでは「復元 effect が例外を
    // 飲み込んで VFS 読込を誘発しない」ことだけを検証する。
    loadAppStateMock.mockRejectedValue(new Error("DB read failed"));
    const setTabs = vi.fn();
    const setActiveTabId = vi.fn();

    await expect(
      mountAndSettle({ setTabs, setActiveTabId, windowKey: null }),
    ).resolves.toBeUndefined();
    // 復元 effect は file 本体を読まない（毎起動エラーを誘発しない）。
    expect(readFileSpy).not.toHaveBeenCalled();
    // 復元由来の無題タブ反映は無い（updater を空 prev で評価しても復元結果が出ない）。
    const restored = restoredTabsFrom(setTabs);
    // initializeStorage のエラータブ(空 createNewTab)か、未呼び出し(null)のいずれか。
    if (restored) {
      expect(restored.every((t) => t.content === "")).toBe(true);
    }
  });
});

describe("#1965 — 永続化ゲートは復元有無に関わらず開く（#1567 退行防止）", () => {
  it("file-backed の復元に失敗しても、その後の空タブ状態を永続化できる", async () => {
    loadAppStateMock.mockResolvedValue({
      openTabs: {
        tabs: [serialized({ filePath: "/abs/a.mdi", fileName: "a.mdi" })],
        activeIndex: 0,
      },
    });
    // 復元失敗（移動/削除）でも永続化ゲートは開く（#1567）。
    readStandaloneFileMock.mockResolvedValue({ success: false, code: "ENOENT" });
    const setTabs = vi.fn();
    const setActiveTabId = vi.fn();

    await mountAndSettle({ setTabs, setActiveTabId, windowKey: null });
    persistAppStateMock.mockClear();

    // ゲートが開いていれば、空タブ状態の永続化が走る（#1567）。
    await act(async () => {
      root.render(
        <Harness
          tabs={[]}
          activeTabId=""
          windowKey={null}
          setTabs={setTabs}
          setActiveTabId={setActiveTabId}
        />,
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(persistAppStateMock).toHaveBeenCalledWith({ openTabs: { tabs: [], activeIndex: 0 } });
  });
});
