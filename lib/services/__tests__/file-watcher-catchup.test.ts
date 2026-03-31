/**
 * Tests for file watcher catch-up on resume (Fix #1010).
 *
 * Verifies that when a watcher is stopped and restarted, it detects
 * changes that occurred while it was paused (catch-up check).
 *
 * Uses real timers with short poll intervals to avoid fake-timer issues
 * with nested async promise chains.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock VFS and runtime-env before importing the module under test
// ---------------------------------------------------------------------------

let mockLastModified = 1000;
let mockFileContent = "initial content";

const mockGetFileMetadata = vi.fn(async () => ({
  lastModified: mockLastModified,
  size: mockFileContent.length,
}));
const mockReadFile = vi.fn(async () => mockFileContent);

vi.mock("@/lib/vfs", () => ({
  getVFS: () => ({
    getFileMetadata: mockGetFileMetadata,
    readFile: mockReadFile,
  }),
}));

vi.mock("@/lib/utils/runtime-env", () => ({
  isElectronRenderer: () => false,
}));

import { createFileWatcher, suppressFileWatch } from "@/lib/services/file-watcher";
import type { FileWatcher } from "@/lib/services/file-watcher";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Tests: WebFileWatcher catch-up
// ---------------------------------------------------------------------------

describe("WebFileWatcher: catch-up on resume (#1010)", () => {
  let watcher: FileWatcher;
  let onChanged: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockLastModified = 1000;
    mockFileContent = "initial content";
    mockGetFileMetadata.mockClear();
    mockReadFile.mockClear();
    onChanged = vi.fn();
  });

  afterEach(() => {
    watcher?.stop();
    vi.restoreAllMocks();
  });

  it("detects file change that occurred while watcher was paused", async () => {
    watcher = createFileWatcher({
      path: "/test.mdi",
      onChanged,
      pollIntervalMs: 5000, // Long interval — we only test the catch-up, not polling
    });

    // Start watcher — initializes lastModified to 1000
    watcher.start();
    await sleep(50); // Let async init complete

    // Stop watcher (simulates tab going to background)
    watcher.stop();
    expect(watcher.isActive).toBe(false);

    // Simulate external file change while paused
    mockLastModified = 2000;
    mockFileContent = "changed while paused";

    // Resume watcher — should detect the change via catch-up
    watcher.start();
    await sleep(50); // Let catch-up complete

    expect(onChanged).toHaveBeenCalledWith("changed while paused", 2000);
  }, 10000);

  it("does NOT fire catch-up callback when file has not changed", async () => {
    watcher = createFileWatcher({
      path: "/test.mdi",
      onChanged,
      pollIntervalMs: 5000,
    });

    // Start and stop
    watcher.start();
    await sleep(50);
    watcher.stop();

    // File unchanged — mockLastModified stays 1000

    // Resume
    watcher.start();
    await sleep(50);

    expect(onChanged).not.toHaveBeenCalled();
  }, 10000);

  it("skips catch-up callback when path is suppressed", async () => {
    watcher = createFileWatcher({
      path: "/test-suppressed.mdi",
      onChanged,
      pollIntervalMs: 5000,
    });

    // Start and stop
    watcher.start();
    await sleep(50);
    watcher.stop();

    // Simulate change + suppress (app's own save)
    mockLastModified = 2000;
    mockFileContent = "self-saved content";
    suppressFileWatch("/test-suppressed.mdi");

    // Resume
    watcher.start();
    await sleep(50);

    expect(onChanged).not.toHaveBeenCalled();
  }, 10000);

  it("does NOT fire catch-up on the very first start (no previous baseline)", async () => {
    mockLastModified = 5000;
    mockFileContent = "existing file";

    watcher = createFileWatcher({
      path: "/test.mdi",
      onChanged,
      pollIntervalMs: 5000,
    });

    // First start — lastModified was 0, so previousModified=0, catch-up guard skips
    watcher.start();
    await sleep(50);

    expect(onChanged).not.toHaveBeenCalled();
  }, 10000);

  it("does not fire callback if stopped before catch-up completes", async () => {
    watcher = createFileWatcher({
      path: "/test.mdi",
      onChanged,
      pollIntervalMs: 5000,
    });

    // Start, establish baseline
    watcher.start();
    await sleep(50);
    watcher.stop();

    // Change file
    mockLastModified = 2000;
    mockFileContent = "changed";

    // Start and immediately stop
    watcher.start();
    watcher.stop();

    await sleep(100);

    // Callback should not fire because _isActive was set to false
    expect(onChanged).not.toHaveBeenCalled();
  }, 10000);
});
