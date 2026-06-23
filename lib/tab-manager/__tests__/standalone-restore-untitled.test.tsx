/**
 * Electron スタンドアロン無題タブ復元のテスト（#1965 の安全サブセット）。
 *
 * 背景: スタンドアロンは VFS ルート未設定で起動するため、保存済み file-backed タブを
 * `getProjectFileService().readFile(絶対パス)` で再読込しようとすると main 側
 * validateVFSPath が必ず失敗する。よってファイル本体復元は Phase 9 の IO 抽象まで据え置き、
 * ここでは **filePath を持たない無題/未保存タブのバッファのみ** を VFS 非依存で復元する。
 *
 * 最重要(業務非破壊): file-backed タブに対して readFile を**呼ばない**こと
 *  = 毎起動の復元失敗エラーを誘発しないこと。
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
    vfsReadyPromise: Promise.resolve(),
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

  it("【業務非破壊】file-backed タブのみのときは復元せず readFile を呼ばない", async () => {
    loadAppStateMock.mockResolvedValue({
      openTabs: {
        tabs: [serialized({ filePath: "/abs/manuscript.mdi", fileName: "manuscript.mdi" })],
        activeIndex: 0,
      },
    });
    const setTabs = vi.fn();
    const setActiveTabId = vi.fn();

    await mountAndSettle({ setTabs, setActiveTabId, windowKey: null });

    // file-backed は据え置き → restore 由来の setTabs は呼ばれない。
    expect(restoredTabsFrom(setTabs)).toBeNull();
    // 毎起動エラー(validateVFSPath 失敗)を誘発しないことの保証。
    expect(readFileSpy).not.toHaveBeenCalled();
  });

  it("file-backed + 無題 混在では無題のみ復元し activeIndex をクランプする", async () => {
    loadAppStateMock.mockResolvedValue({
      openTabs: {
        tabs: [
          serialized({ filePath: "/abs/a.mdi", fileName: "a.mdi" }),
          serialized({ unsavedContent: "下書き", fileType: ".mdi" }),
        ],
        activeIndex: 0, // file-backed を指していても、復元後リストにクランプ。
      },
    });
    const setTabs = vi.fn();
    const setActiveTabId = vi.fn();

    await mountAndSettle({ setTabs, setActiveTabId, windowKey: null });

    const restored = restoredTabsFrom(setTabs);
    expect(restored).toHaveLength(1);
    expect(restored![0].content).toBe("下書き");
    // setActiveTabId updater("") は復元済みリストの範囲内 id を返す（範囲外参照しない）。
    const idUpdater = setActiveTabId.mock.calls[0][0] as (prev: TabId) => TabId;
    expect(idUpdater("")).toBe(restored![0].id);
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
  it("file-backed のみで復元なしでも、その後の空タブ状態を永続化できる", async () => {
    loadAppStateMock.mockResolvedValue({
      openTabs: {
        tabs: [serialized({ filePath: "/abs/a.mdi", fileName: "a.mdi" })],
        activeIndex: 0,
      },
    });
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
