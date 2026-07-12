/**
 * Direct tests for the real tryCreateSnapshot callback body inside
 * useFileIO (lib/tab-manager/use-file-io.ts:209-231). Every existing
 * consumer test (use-file-io-save.test.ts, save-executor.test.ts,
 * pre-external-reload-snapshot.test.ts, snapshot-type-routing.test.ts)
 * injects tryCreateSnapshot as a vi.fn() mock instead of exercising the
 * real callback — this file mounts the real hook and calls the real
 * function, following this repo's HookHost + renderHook() pattern (see
 * lib/editor-page/__tests__/use-ai-settings-options.test.tsx).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

vi.mock("@/lib/services/history-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/history-service")>(
    "@/lib/services/history-service",
  );
  return { ...actual, getHistoryService: vi.fn() };
});
vi.mock("@/lib/services/project-file-service", () => ({ getProjectFileService: vi.fn() }));

import { useFileIO } from "../use-file-io";
import type { UseFileIOParams } from "../use-file-io";
import { getHistoryService } from "@/lib/services/history-service";
import { getProjectFileService } from "@/lib/services/project-file-service";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HookValue = ReturnType<typeof useFileIO>;

let latestValue: HookValue | null = null;
let root: Root;
let container: HTMLDivElement;
let isProjectRef: { current: boolean };
let mockIsRootOpen: ReturnType<typeof vi.fn>;
let mockShouldCreateSnapshot: ReturnType<typeof vi.fn>;
let mockCreateSnapshot: ReturnType<typeof vi.fn>;

function buildMinimalParams(): UseFileIOParams {
  return {
    tabs: [],
    setTabs: vi.fn(),
    activeTabId: "",
    setActiveTabId: vi.fn(),
    tabsRef: { current: [] },
    activeTabIdRef: { current: "" },
    isProjectRef,
    isElectron: false,
    updateTab: vi.fn(),
    findTabByPath: vi.fn(),
    forceCloseTab: vi.fn(),
    closeTab: vi.fn(),
  };
}

function HookHost({ onValue }: { onValue: (value: HookValue) => void }): null {
  const value = useFileIO(buildMinimalParams());
  useEffect(() => {
    onValue(value);
  }, [onValue, value]);
  return null;
}

beforeEach(() => {
  latestValue = null;
  isProjectRef = { current: true };

  mockIsRootOpen = vi.fn(() => true);
  vi.mocked(getProjectFileService).mockReturnValue({
    isRootOpen: mockIsRootOpen,
  } as unknown as ReturnType<typeof getProjectFileService>);

  mockShouldCreateSnapshot = vi.fn(async () => true);
  mockCreateSnapshot = vi.fn(async () => ({ id: "snap-1" }));
  vi.mocked(getHistoryService).mockReturnValue({
    shouldCreateSnapshot: mockShouldCreateSnapshot,
    createSnapshot: mockCreateSnapshot,
  } as unknown as ReturnType<typeof getHistoryService>);

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

async function renderHook(): Promise<void> {
  await act(async () => {
    root.render(<HookHost onValue={(value) => (latestValue = value)} />);
  });
}

describe("useFileIO — tryCreateSnapshot (real callback body)", () => {
  it("standalone mode (isProjectRef=false): no-ops without calling getHistoryService at all", async () => {
    isProjectRef.current = false;
    await renderHook();

    await act(async () => {
      await latestValue!.tryCreateSnapshot("manual", "main.mdi", "main.mdi", "content");
    });

    expect(getHistoryService).not.toHaveBeenCalled();
  });

  it("VFS root closed: no-ops without calling createSnapshot", async () => {
    mockIsRootOpen.mockReturnValue(false);
    await renderHook();

    await act(async () => {
      await latestValue!.tryCreateSnapshot("manual", "main.mdi", "main.mdi", "content");
    });

    expect(mockCreateSnapshot).not.toHaveBeenCalled();
  });

  it("type 'auto' + shouldCreateSnapshot=false: throttle short-circuits, createSnapshot not called", async () => {
    mockShouldCreateSnapshot.mockResolvedValue(false);
    await renderHook();

    await act(async () => {
      await latestValue!.tryCreateSnapshot("auto", "main.mdi", "main.mdi", "content");
    });

    expect(mockShouldCreateSnapshot).toHaveBeenCalledWith("main.mdi");
    expect(mockCreateSnapshot).not.toHaveBeenCalled();
  });

  it("type 'auto' + shouldCreateSnapshot=true: createSnapshot is called with the right args", async () => {
    mockShouldCreateSnapshot.mockResolvedValue(true);
    await renderHook();

    await act(async () => {
      await latestValue!.tryCreateSnapshot("auto", "main.mdi", "Main Chapter", "auto content");
    });

    expect(mockCreateSnapshot).toHaveBeenCalledWith({
      sourcePath: "main.mdi",
      displayName: "Main Chapter",
      content: "auto content",
      type: "auto",
    });
  });

  it.each(["manual", "pre-close", "restore-point"] as const)(
    "type '%s' skips the throttle check entirely",
    async (type) => {
      await renderHook();

      await act(async () => {
        await latestValue!.tryCreateSnapshot(type, "main.mdi", "main.mdi", "content");
      });

      expect(mockShouldCreateSnapshot).not.toHaveBeenCalled();
      expect(mockCreateSnapshot).toHaveBeenCalledWith(expect.objectContaining({ type }));
    },
  );

  it("swallows errors from historyService.createSnapshot and warns instead of throwing", async () => {
    mockCreateSnapshot.mockRejectedValue(new Error("disk full"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await renderHook();

    await act(async () => {
      await expect(
        latestValue!.tryCreateSnapshot("manual", "main.mdi", "main.mdi", "content"),
      ).resolves.toBeUndefined();
    });

    expect(warnSpy).toHaveBeenCalledWith(
      "スナップショットの作成に失敗しました:",
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });
});
