/**
 * Real-mount tests for HistoryPanel — added ALONGSIDE (not replacing)
 * HistoryPanel-restore-snapshot.test.ts, which deliberately tests a
 * hand-copied "mirror" of executeRestore rather than mounting the real
 * component (a named, intentional pattern in this repo). This file mounts
 * the real component, covering pagination, date-grouping, collapsed groups,
 * loading/error/empty states, handleCreateSnapshot, handleCompare, bookmark
 * UI, and the restore-confirmation dialog flow — none of which the mirror
 * test exercises.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import HistoryPanel from "../HistoryPanel";
import type { SnapshotEntry, RestoreResult } from "@/lib/services/history-service";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/services/history-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/history-service")>(
    "@/lib/services/history-service",
  );
  return { ...actual, getHistoryService: vi.fn() };
});
vi.mock("@/lib/services/project-file-service", () => ({ getProjectFileService: vi.fn() }));

import { getHistoryService } from "@/lib/services/history-service";
import { getProjectFileService } from "@/lib/services/project-file-service";

let root: Root;
let container: HTMLDivElement;

function makeSnapshot(overrides: Partial<SnapshotEntry> = {}): SnapshotEntry {
  return {
    id: `snap-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    filename: "main.mdi.[x].history",
    sourcePath: "main.mdi",
    displayName: "main.mdi",
    type: "manual",
    characterCount: 100,
    fileSize: 100,
    checksum: "abc",
    ...overrides,
  };
}

interface MockHistoryService {
  getSnapshots: ReturnType<typeof vi.fn>;
  getSnapshotContent: ReturnType<typeof vi.fn>;
  onSnapshotCreated: ReturnType<typeof vi.fn>;
  getBookmarks: ReturnType<typeof vi.fn>;
  toggleBookmark: ReturnType<typeof vi.fn>;
  createSnapshot: ReturnType<typeof vi.fn>;
  restoreSnapshot: ReturnType<typeof vi.fn>;
}

function makeMockHistoryService(overrides: Partial<MockHistoryService> = {}): MockHistoryService {
  return {
    getSnapshots: vi.fn(async () => [] as SnapshotEntry[]),
    getSnapshotContent: vi.fn(async () => null as string | null),
    onSnapshotCreated: vi.fn(() => () => {}),
    getBookmarks: vi.fn(async () => new Set<string>()),
    toggleBookmark: vi.fn(async () => true),
    createSnapshot: vi.fn(async () => makeSnapshot()),
    restoreSnapshot: vi.fn(async () => ({ success: true, content: "restored" }) as RestoreResult),
    ...overrides,
  };
}

let mockService: MockHistoryService;
let mockIsRootOpen: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockService = makeMockHistoryService();
  vi.mocked(getHistoryService).mockReturnValue(
    mockService as unknown as ReturnType<typeof getHistoryService>,
  );
  mockIsRootOpen = vi.fn(() => false);
  vi.mocked(getProjectFileService).mockReturnValue({
    isRootOpen: mockIsRootOpen,
  } as unknown as ReturnType<typeof getProjectFileService>);

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function defaultProps(overrides: Partial<React.ComponentProps<typeof HistoryPanel>> = {}) {
  return {
    projectId: "p1",
    sourcePath: "main.mdi",
    displayName: "main.mdi",
    onRestore: vi.fn(),
    currentContent: "",
    onCompareInEditor: vi.fn(),
    ...overrides,
  };
}

async function mount(overrides: Partial<React.ComponentProps<typeof HistoryPanel>> = {}) {
  await act(async () => {
    root.render(<HistoryPanel {...defaultProps(overrides)} />);
  });
  await flush();
}

function getButtons(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll("button"));
}

describe("HistoryPanel (real mount)", () => {
  it("shows the loading state synchronously before getSnapshots resolves", async () => {
    let resolveSnapshots!: (v: SnapshotEntry[]) => void;
    mockService.getSnapshots.mockReturnValue(
      new Promise<SnapshotEntry[]>((resolve) => {
        resolveSnapshots = resolve;
      }),
    );

    act(() => {
      root.render(<HistoryPanel {...defaultProps()} />);
    });

    expect(container.textContent).toContain("履歴を読み込み中");

    await act(async () => {
      resolveSnapshots([]);
      await Promise.resolve();
    });
  });

  it("shows the empty state when there are no snapshots", async () => {
    await mount();
    expect(container.textContent).toContain("履歴がありません");
  });

  it("shows an error banner when getSnapshots rejects, dismissible via 閉じる", async () => {
    mockService.getSnapshots.mockRejectedValue(new Error("boom"));
    await mount();

    expect(container.textContent).toContain("履歴の読み込みに失敗しました");
    expect(container.textContent).toContain("boom");

    const closeButton = getButtons().find((b) => b.textContent === "閉じる")!;
    await act(async () => {
      closeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).not.toContain("履歴の読み込みに失敗しました");
  });

  it("groups snapshots by date and shows correct headers/counts", async () => {
    const today = Date.now();
    const twoDaysAgo = today - 2 * 24 * 60 * 60 * 1000;
    mockService.getSnapshots.mockResolvedValue([
      makeSnapshot({ id: "a", timestamp: today }),
      makeSnapshot({ id: "b", timestamp: twoDaysAgo }),
      makeSnapshot({ id: "c", timestamp: twoDaysAgo - 1000 }),
    ]);

    await mount();

    // formatDateGroupLabel is an identity function over the YYYY-MM-DD key
    const headers = Array.from(container.querySelectorAll("button")).filter((b) =>
      /^\d{4}-\d{2}-\d{2}$/.test(b.textContent?.trim().split(/\s+/)[0] ?? ""),
    );
    expect(headers.length).toBe(2);
  });

  it("collapses groups older than 2 days by default, keeps recent groups expanded", async () => {
    const now = Date.now();
    const recent = now;
    const old = now - 3 * 24 * 60 * 60 * 1000;
    mockService.getSnapshots.mockResolvedValue([
      makeSnapshot({ id: "recent", timestamp: recent }),
      makeSnapshot({ id: "old", timestamp: old }),
    ]);

    await mount();

    // Only the recent snapshot's card should be visible initially.
    expect(container.textContent).toContain("手動");
    const cards = container.querySelectorAll('[role="button"]');
    expect(cards.length).toBe(1);

    // Groups render newest-first, so the second header button is the collapsed
    // (old) group — expand it by clicking its header.
    const headerButtons = getButtons().filter((b) =>
      /^\d{4}-\d{2}-\d{2}$/.test(b.textContent?.trim().split(/\s+/)[0] ?? ""),
    );
    expect(headerButtons.length).toBe(2);
    const oldHeader = headerButtons[1]!;
    await act(async () => {
      oldHeader.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelectorAll('[role="button"]').length).toBe(2);
  });

  it("paginates: shows 20 by default with a load-more button, loads the rest on click", async () => {
    const now = Date.now();
    const snapshots = Array.from({ length: 25 }, (_, i) =>
      makeSnapshot({ id: `s${i}`, timestamp: now - i * 1000 }),
    );
    mockService.getSnapshots.mockResolvedValue(snapshots);

    await mount();

    expect(container.querySelectorAll('[role="button"]').length).toBe(20);
    const loadMore = getButtons().find((b) => b.textContent?.includes("もっと読み込む"));
    expect(loadMore).toBeDefined();
    expect(loadMore!.textContent).toContain("5件");

    await act(async () => {
      loadMore!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelectorAll('[role="button"]').length).toBe(25);
    expect(getButtons().find((b) => b.textContent?.includes("もっと読み込む"))).toBeUndefined();
  });

  it("handleCreateSnapshot: shows spinner while pending, reloads snapshots on success", async () => {
    mockService.getSnapshots.mockResolvedValue([]);
    let resolveCreate!: (v: SnapshotEntry) => void;
    mockService.createSnapshot.mockReturnValue(
      new Promise<SnapshotEntry>((resolve) => {
        resolveCreate = resolve;
      }),
    );

    await mount();
    expect(mockService.getSnapshots).toHaveBeenCalledTimes(1);

    const createButton = getButtons().find((b) => b.textContent?.includes("スナップショット"))!;
    act(() => {
      createButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(createButton.disabled).toBe(true);

    await act(async () => {
      resolveCreate(makeSnapshot());
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockService.getSnapshots).toHaveBeenCalledTimes(2);
    expect(createButton.disabled).toBe(false);
  });

  it("handleCreateSnapshot: shows an error banner on failure", async () => {
    mockService.createSnapshot.mockRejectedValue(new Error("disk full"));
    await mount();

    const createButton = getButtons().find((b) => b.textContent?.includes("スナップショット"))!;
    await act(async () => {
      createButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("スナップショットの作成に失敗しました");
    expect(container.textContent).toContain("disk full");
  });

  it("handleCompare: success calls onCompareInEditor with the right shape", async () => {
    const snapshot = makeSnapshot({ id: "cmp-1", type: "manual" });
    mockService.getSnapshots.mockResolvedValue([snapshot]);
    mockService.restoreSnapshot.mockResolvedValue({ success: true, content: "snapshot body" });
    const onCompareInEditor = vi.fn();

    await mount({ currentContent: "current body", onCompareInEditor });

    const card = container.querySelector('[role="button"]')!;
    await act(async () => {
      card.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onCompareInEditor).toHaveBeenCalledWith({
      snapshotContent: "snapshot body",
      currentContent: "current body",
      label: expect.stringContaining("手動"),
    });
  });

  it("handleCompare: failure shows an error banner and does not call onCompareInEditor", async () => {
    const snapshot = makeSnapshot({ id: "cmp-2" });
    mockService.getSnapshots.mockResolvedValue([snapshot]);
    mockService.restoreSnapshot.mockResolvedValue({ success: false, error: "checksum bad" });
    const onCompareInEditor = vi.fn();

    await mount({ onCompareInEditor });
    const card = container.querySelector('[role="button"]')!;
    await act(async () => {
      card.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("スナップショットの読み込みに失敗しました");
    expect(onCompareInEditor).not.toHaveBeenCalled();
  });

  it("handleCompare: missing onCompareInEditor shows the internal-error banner", async () => {
    const snapshot = makeSnapshot({ id: "cmp-3" });
    mockService.getSnapshots.mockResolvedValue([snapshot]);
    mockService.restoreSnapshot.mockResolvedValue({ success: true, content: "x" });

    await mount({ onCompareInEditor: undefined });
    const card = container.querySelector('[role="button"]')!;
    await act(async () => {
      card.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("内部エラー");
  });

  it("bookmark UI: reflects getBookmarks and toggles on click", async () => {
    const snapshot = makeSnapshot({ id: "bm-1" });
    mockService.getSnapshots.mockResolvedValue([snapshot]);
    mockService.getBookmarks.mockResolvedValue(new Set(["bm-1"]));
    mockService.toggleBookmark.mockResolvedValue(false);

    await mount();
    expect(container.querySelector('svg[fill="currentColor"]')).not.toBeNull();

    const bookmarkButton = getButtons().find((b) => b.title.includes("ブックマーク"))!;
    await act(async () => {
      bookmarkButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockService.toggleBookmark).toHaveBeenCalledWith("bm-1");
    expect(container.querySelector('svg[fill="none"]')).not.toBeNull();
  });

  it("restore confirmation dialog: confirm creates a restore-point first (when dirty content + open root), then restores", async () => {
    const snapshot = makeSnapshot({ id: "restore-1" });
    mockService.getSnapshots.mockResolvedValue([snapshot]);
    mockIsRootOpen.mockReturnValue(true);
    const onRestore = vi.fn();

    await mount({ currentContent: "dirty current content", onRestore });

    const menuButton = getButtons().find((b) => b.title === "メニュー")!;
    await act(async () => {
      menuButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const restoreItem = getButtons().find((b) => b.textContent?.includes("復元"))!;
    await act(async () => {
      restoreItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("スナップショットの復元");

    const confirmButton = getButtons().find((b) => b.textContent === "復元する")!;
    await act(async () => {
      confirmButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockService.createSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ type: "restore-point", content: "dirty current content" }),
    );
    const createOrder = mockService.createSnapshot.mock.invocationCallOrder[0];
    const restoreOrder = mockService.restoreSnapshot.mock.invocationCallOrder[0];
    expect(createOrder).toBeLessThan(restoreOrder);
    expect(onRestore).toHaveBeenCalledWith("restored");
  });

  it("restore confirmation dialog: cancel closes without restoring", async () => {
    const snapshot = makeSnapshot({ id: "restore-2" });
    mockService.getSnapshots.mockResolvedValue([snapshot]);

    await mount();
    const menuButton = getButtons().find((b) => b.title === "メニュー")!;
    await act(async () => {
      menuButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const restoreItem = getButtons().find((b) => b.textContent?.includes("復元"))!;
    await act(async () => {
      restoreItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const cancelButton = getButtons().find((b) => b.textContent === "キャンセル")!;
    await act(async () => {
      cancelButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockService.restoreSnapshot).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("スナップショットの復元");
  });
});
