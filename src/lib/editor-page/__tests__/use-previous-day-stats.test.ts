/**
 * Regression test for #1891:
 * usePreviousDayStats must look up snapshots by FULL path, not basename.
 *
 * Root cause: app/page.tsx was passing currentFile?.name (basename) instead
 * of currentFile?.path (full path) to usePreviousDayStats.  historyService
 * keys snapshots by full path, so sub-folder files ("chapters/main.mdi")
 * never matched the basename "main.mdi" and the previous-day comparison
 * was always empty.
 *
 * Fix: page.tsx now passes currentFile?.path. This test verifies that
 * getSnapshots is called with a full path containing a directory separator,
 * and that the hook surfaces the correct previous-day stats.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Mock history service
// ---------------------------------------------------------------------------

// A snapshot stamped as "yesterday" relative to the test run time.
function yesterdayTs(): number {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.getTime();
}

const YESTERDAY_CONTENT = "昨日の本文";

type MockGetSnapshots = ReturnType<typeof vi.fn>;
type MockGetSnapshotContent = ReturnType<typeof vi.fn>;

let mockGetSnapshots: MockGetSnapshots;
let mockGetSnapshotContent: MockGetSnapshotContent;

vi.mock("@/lib/services/history-service", () => ({
  getHistoryService: () => ({
    getSnapshots: mockGetSnapshots,
    getSnapshotContent: mockGetSnapshotContent,
  }),
}));

// computeTextStatistics is used to derive charCount from the snapshot content.
// We mock it to return a fixed value so the test stays simple.
vi.mock("@/lib/editor-page/text-statistics", () => ({
  computeTextStatistics: (_content: string) => ({
    visibleTextCharCount: 5,
    manuscriptPages: 1,
  }),
}));

// ---------------------------------------------------------------------------
// Import the hook AFTER mocks are registered
// ---------------------------------------------------------------------------

import { usePreviousDayStats } from "../use-previous-day-stats";
import type { PreviousDayStats } from "../use-previous-day-stats";

// ---------------------------------------------------------------------------
// Minimal host component to capture hook output
// ---------------------------------------------------------------------------

interface HostProps {
  sourceFile: string | undefined;
  enabled: boolean;
  onResult: (stats: PreviousDayStats | null) => void;
}

function HookHost({ sourceFile, enabled, onResult }: HostProps): null {
  const stats = usePreviousDayStats(sourceFile, enabled);
  // Call onResult every render so tests can inspect the latest value.
  onResult(stats);
  return null;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("usePreviousDayStats (#1891 regression)", () => {
  let container: HTMLDivElement;
  let root: Root;
  let lastResult: PreviousDayStats | null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);

    lastResult = null;

    const snapshotId = "snap-001";

    mockGetSnapshots = vi.fn().mockResolvedValue([
      {
        id: snapshotId,
        sourcePath: "chapters/main.mdi",
        timestamp: yesterdayTs(),
        type: "auto",
        characterCount: YESTERDAY_CONTENT.length,
        filename: "chapters__main.mdi.[yesterday].__auto__.history",
        displayName: "main.mdi",
        fileSize: YESTERDAY_CONTENT.length,
        checksum: "abc",
      },
    ]);

    mockGetSnapshotContent = vi.fn().mockResolvedValue(YESTERDAY_CONTENT);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  // -----------------------------------------------------------------------
  // #1891: sub-folder full path must reach getSnapshots
  // -----------------------------------------------------------------------

  it("サブフォルダのフルパスで getSnapshots を呼び出し、前日比が返る (regression #1891)", async () => {
    const fullPath = "chapters/main.mdi";

    await act(async () => {
      root = createRoot(container);
      root.render(
        React.createElement(HookHost, {
          sourceFile: fullPath,
          enabled: true,
          onResult: (s) => {
            lastResult = s;
          },
        }),
      );
    });

    // Wait for async effect to settle
    await act(async () => {
      await Promise.resolve();
    });

    // getSnapshots must have been called with the FULL path, not "main.mdi"
    expect(mockGetSnapshots).toHaveBeenCalledWith(fullPath);
    expect(mockGetSnapshots).not.toHaveBeenCalledWith("main.mdi");

    // The hook should surface a non-null result (snapshot found)
    expect(lastResult).not.toBeNull();
    expect(lastResult!.charCount).toBe(5);
  });

  it("basename だけでは getSnapshots が空を返し、前日比は null になる (basename-keyed bug 再現)", async () => {
    // Return empty for basename; non-empty for full path.
    mockGetSnapshots = vi.fn().mockImplementation(async (path?: string) => {
      // Simulate the bug: snapshots are keyed by full path; basename lookup returns []
      if (path === "main.mdi") return [];
      return [
        {
          id: "snap-002",
          sourcePath: "chapters/main.mdi",
          timestamp: yesterdayTs(),
          type: "auto",
          characterCount: 5,
          filename: "chapters__main.mdi.[yesterday].__auto__.history",
          displayName: "main.mdi",
          fileSize: 5,
          checksum: "abc",
        },
      ];
    });

    // Passing only basename (old bug)
    await act(async () => {
      root = createRoot(container);
      root.render(
        React.createElement(HookHost, {
          sourceFile: "main.mdi",
          enabled: true,
          onResult: (s) => {
            lastResult = s;
          },
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    // With basename, no snapshot is found => null
    expect(lastResult).toBeNull();
  });

  it("enabled=false のときは getSnapshots を呼ばない", async () => {
    await act(async () => {
      root = createRoot(container);
      root.render(
        React.createElement(HookHost, {
          sourceFile: "chapters/main.mdi",
          enabled: false,
          onResult: (s) => {
            lastResult = s;
          },
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockGetSnapshots).not.toHaveBeenCalled();
    expect(lastResult).toBeNull();
  });

  it("sourceFile=undefined のときは getSnapshots を呼ばない", async () => {
    await act(async () => {
      root = createRoot(container);
      root.render(
        React.createElement(HookHost, {
          sourceFile: undefined,
          enabled: true,
          onResult: (s) => {
            lastResult = s;
          },
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockGetSnapshots).not.toHaveBeenCalled();
    expect(lastResult).toBeNull();
  });
});
