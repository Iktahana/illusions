/**
 * 永続化のサイレント失敗が通知へ変換されることのテスト（#1967 / #1968 K-4-3）。
 *
 * 修正前: タブ状態の永続化失敗（容量不足など）と DB ロック起動時の初期化失敗は
 * `console.error` のみで、ユーザーは保存できていると誤認したままだった。
 *
 * 修正後:
 * - debounce 永続化が失敗したら `notificationManager.error` で一度だけ通知し、
 *   成功で失敗ストリークを解除して再通知できるようにする（連発しない）。
 * - storage 初期化失敗（DB ロック等）は `setRestoreError` バナー + トーストで明示する。
 *
 * REAL フックを createRoot + act で駆動（リポジトリのパターン、testing-library 不使用）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { useTabPersistence } from "../use-tab-persistence";
import { createNewTab } from "../types";
import type { TabState, TabId } from "../tab-types";

const { persistAppStateMock, persistWindowStateMock, fetchWindowStateMock, initializeMock } =
  vi.hoisted(() => ({
    persistAppStateMock: vi.fn(async () => undefined),
    persistWindowStateMock: vi.fn(async () => undefined),
    fetchWindowStateMock: vi.fn(async () => null),
    initializeMock: vi.fn(async () => undefined),
  }));

const { errorMock, warningMock, infoMock } = vi.hoisted(() => ({
  errorMock: vi.fn((_msg: string) => "id"),
  warningMock: vi.fn((_msg: string) => "id"),
  infoMock: vi.fn((_msg: string) => "id"),
}));

vi.mock("@/lib/services/notification-manager", () => ({
  notificationManager: { error: errorMock, warning: warningMock, info: infoMock },
}));

vi.mock("@/lib/storage/storage-service", () => ({
  getStorageService: () => ({
    initialize: initializeMock,
    loadAppState: vi.fn(async () => null),
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
  getProjectFileService: () => ({ readFile: vi.fn(async () => "") }),
}));

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

interface HarnessProps {
  tabs: TabState[];
  activeTabId: TabId;
  isElectron?: boolean;
  skipAutoRestore?: boolean;
  setRestoreError?: (value: string | null) => void;
}

function Harness({
  tabs,
  activeTabId,
  isElectron = false,
  skipAutoRestore = true,
  setRestoreError,
}: HarnessProps): null {
  const tabsRef = useRef<TabState[]>(tabs);
  tabsRef.current = tabs;
  const activeTabIdRef = useRef<TabId>(activeTabId);
  activeTabIdRef.current = activeTabId;
  const isProjectRef = useRef(false);

  useTabPersistence({
    tabs,
    setTabs: vi.fn(),
    activeTabId,
    setActiveTabId: vi.fn(),
    tabsRef,
    activeTabIdRef,
    isProjectRef,
    isElectron,
    skipAutoRestore,
    setRestoreError: setRestoreError as never,
    windowKey: null,
  });
  return null;
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  persistAppStateMock.mockReset();
  persistAppStateMock.mockResolvedValue(undefined);
  persistWindowStateMock.mockReset();
  persistWindowStateMock.mockResolvedValue(undefined);
  fetchWindowStateMock.mockReset();
  fetchWindowStateMock.mockResolvedValue(null);
  initializeMock.mockReset();
  initializeMock.mockResolvedValue(undefined);
  errorMock.mockClear();
  warningMock.mockClear();
  infoMock.mockClear();
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

async function flush(ms = 1500): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

// ---------------------------------------------------------------------------
// #1967 — 永続化失敗のサイレント握り潰し → 通知
// ---------------------------------------------------------------------------

describe("#1967 — タブ状態の永続化失敗を通知へ変換", () => {
  it("QuotaExceededError で永続化が失敗したら容量メッセージで一度だけ通知し、成功で解除して再通知できる", async () => {
    const tabA = createNewTab("a");
    const tabB = createNewTab("b");

    // 初期マウント（成功）でゲートを開く。
    await act(async () => {
      root.render(<Harness tabs={[tabA]} activeTabId={tabA.id} />);
    });
    await flush();
    errorMock.mockClear();

    // 以降の永続化を QuotaExceededError で失敗させる。
    persistAppStateMock.mockRejectedValue(new DOMException("quota", "QuotaExceededError"));

    // 変更1 → 失敗 → 通知1回。
    await act(async () => {
      root.render(<Harness tabs={[tabA, tabB]} activeTabId={tabA.id} />);
    });
    await flush();
    expect(errorMock).toHaveBeenCalledTimes(1);
    expect(errorMock.mock.calls[0][0]).toContain("容量");

    // 変更2 → なお失敗 → 連発しない（ストリーク中は抑制）。
    await act(async () => {
      root.render(<Harness tabs={[tabB, tabA]} activeTabId={tabA.id} />);
    });
    await flush();
    expect(errorMock).toHaveBeenCalledTimes(1);

    // 成功に戻すとストリーク解除。
    persistAppStateMock.mockResolvedValue(undefined);
    await act(async () => {
      root.render(<Harness tabs={[tabA]} activeTabId={tabA.id} />);
    });
    await flush();
    expect(errorMock).toHaveBeenCalledTimes(1);

    // 再び失敗すると改めて通知（2回目）。
    persistAppStateMock.mockRejectedValue(new DOMException("quota", "QuotaExceededError"));
    await act(async () => {
      root.render(<Harness tabs={[tabA, tabB]} activeTabId={tabA.id} />);
    });
    await flush();
    expect(errorMock).toHaveBeenCalledTimes(2);
  });

  it("consistency — 永続化が成功している間はエラー通知を一切出さない", async () => {
    const tabA = createNewTab("a");
    const tabB = createNewTab("b");
    await act(async () => {
      root.render(<Harness tabs={[tabA]} activeTabId={tabA.id} />);
    });
    await flush();
    await act(async () => {
      root.render(<Harness tabs={[tabA, tabB]} activeTabId={tabA.id} />);
    });
    await flush();
    expect(errorMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// #1968 K-4-3 — DB ロック起動時の無通知フォールバック
// ---------------------------------------------------------------------------

describe("#1968 K-4-3 — storage 初期化失敗（DB ロック）を通知", () => {
  it("storage.initialize() が throw したら setRestoreError バナー + error トーストを出す", async () => {
    initializeMock.mockRejectedValue(
      Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" }),
    );
    const setRestoreError = vi.fn();
    const tabA = createNewTab("a");

    await act(async () => {
      root.render(
        <Harness tabs={[tabA]} activeTabId={tabA.id} setRestoreError={setRestoreError} />,
      );
    });
    await flush();

    expect(setRestoreError).toHaveBeenCalledTimes(1);
    expect(setRestoreError.mock.calls[0][0]).toContain("読み込めませんでした");
    expect(errorMock).toHaveBeenCalledTimes(1);
    expect(errorMock.mock.calls[0][0]).toContain("セッションの読み込みに失敗");
  });

  it("consistency — 初期化が成功すれば restore エラー通知は出ない", async () => {
    const setRestoreError = vi.fn();
    const tabA = createNewTab("a");
    await act(async () => {
      root.render(
        <Harness tabs={[tabA]} activeTabId={tabA.id} setRestoreError={setRestoreError} />,
      );
    });
    await flush();
    expect(setRestoreError).not.toHaveBeenCalled();
    expect(errorMock).not.toHaveBeenCalled();
  });
});
