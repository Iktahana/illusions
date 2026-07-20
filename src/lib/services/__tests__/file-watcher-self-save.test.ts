/**
 * Tests for content-hash self-save suppression in the file watcher.
 *
 * Regression context: in Electron the renderer has no native fs.watch, so the
 * watcher always polls (default 5s). The previous time-only suppression window
 * (3s) was shorter than the poll interval, so the poll that observed the app's
 * own save fired AFTER the window expired and surfaced a spurious
 * "「xxx」が更新されました" toast on every manual save and auto-save.
 *
 * The fix:
 *  - the suppression window now exceeds the poll interval, and
 *  - suppression matches on the saved content hash, so a genuine external edit
 *    (different content) within the window is still detected.
 *
 * Uses real timers with a short poll interval to exercise the polling path.
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

vi.mock("@/lib/services/project-file-service", () => ({
  getProjectFileService: () => ({
    getFileMetadata: mockGetFileMetadata,
    readFile: mockReadFile,
  }),
}));

vi.mock("@/lib/utils/runtime-env", () => ({
  isElectronRenderer: () => false,
}));

import { createFileWatcher, suppressFileWatch } from "@/lib/services/file-watcher";
import type { FileChangeCallback, FileWatcher } from "@/lib/services/file-watcher";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const POLL_MS = 30;

describe("WebFileWatcher: content-hash self-save suppression", () => {
  let watcher: FileWatcher;
  let onChanged: ReturnType<typeof vi.fn<FileChangeCallback>>;

  beforeEach(() => {
    mockLastModified = 1000;
    mockFileContent = "initial content";
    mockGetFileMetadata.mockClear();
    mockReadFile.mockClear();
    onChanged = vi.fn<FileChangeCallback>();
  });

  afterEach(() => {
    watcher?.stop();
    vi.restoreAllMocks();
  });

  it("suppresses the app's own save when the polled content matches the saved hash", async () => {
    watcher = createFileWatcher({ path: "/self.mdi", onChanged, pollIntervalMs: POLL_MS });
    watcher.start();
    await sleep(POLL_MS); // initialize baseline (mtime 1000)

    // App saves: register suppression with the exact written content, then the
    // file's mtime advances to reflect the write.
    const savedContent = "the content the app just wrote";
    suppressFileWatch("/self.mdi", savedContent);
    mockLastModified = 2000;
    mockFileContent = savedContent;

    // Let several poll cycles run — well past the old 3s window would not matter
    // here because matching is by content hash, not elapsed time.
    await sleep(POLL_MS * 4);

    expect(onChanged).not.toHaveBeenCalled();
  });

  it("does NOT suppress a genuine external edit with different content within the window", async () => {
    watcher = createFileWatcher({ path: "/ext.mdi", onChanged, pollIntervalMs: POLL_MS });
    watcher.start();
    await sleep(POLL_MS);

    // App saves content A...
    suppressFileWatch("/ext.mdi", "app wrote A");
    // ...but an external process writes different content B and bumps mtime.
    mockLastModified = 2000;
    mockFileContent = "external wrote B";

    await sleep(POLL_MS * 4);

    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledWith("external wrote B", 2000);
  });

  it("re-detects a later external change after a suppressed self-save", async () => {
    watcher = createFileWatcher({ path: "/seq.mdi", onChanged, pollIntervalMs: POLL_MS });
    watcher.start();
    await sleep(POLL_MS);

    // Self-save — suppressed.
    suppressFileWatch("/seq.mdi", "saved by app");
    mockLastModified = 2000;
    mockFileContent = "saved by app";
    await sleep(POLL_MS * 3);
    expect(onChanged).not.toHaveBeenCalled();

    // Later genuine external change — must be detected.
    mockLastModified = 3000;
    mockFileContent = "external change";
    await sleep(POLL_MS * 3);

    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledWith("external change", 3000);
  });
});
