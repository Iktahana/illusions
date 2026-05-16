/**
 * Tests for ElectronFileWatcher — hash-aware suppression and _isActive guard.
 *
 * A separate test file is required because the existing file-watcher-catchup.test.ts
 * mocks isElectronRenderer to false at module scope (WebFileWatcher path), which
 * cannot be overridden within the same module (R11).
 *
 * Covers:
 *   Case A — auto-save hash suppression: native change event does NOT fire onChanged
 *   Case B — catch-up suppression: paused watcher resumes and skips self-save via hash
 *   Case B2 — hash mismatch within TTL: genuine external change still fires onChanged
 *   Case C — _isActive race: stop() during in-flight readAndNotify cancels notification
 *   Case D — regression: real external change always fires onChanged
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { VFSWatchEvent } from "@/lib/vfs/types";

// ---------------------------------------------------------------------------
// Mock isElectronRenderer → true so createFileWatcher returns ElectronFileWatcher
// ---------------------------------------------------------------------------

vi.mock("@/lib/utils/runtime-env", () => ({
  isElectronRenderer: () => true,
}));

// ---------------------------------------------------------------------------
// VFS mock with watchFile support
// ---------------------------------------------------------------------------

type WatchCallback = (event: VFSWatchEvent) => void;

const watchFileCallbacks = new Map<string, WatchCallback>();

const mockReadFile = vi.fn<(path: string) => Promise<string>>();
const mockGetFileMetadata =
  vi.fn<(path: string) => Promise<{ lastModified: number; size: number }>>();
const mockWriteFile = vi.fn<(path: string, content: string) => Promise<void>>();

vi.mock("@/lib/vfs", () => ({
  getVFS: () => ({
    readFile: mockReadFile,
    getFileMetadata: mockGetFileMetadata,
    writeFile: mockWriteFile,
    watchFile: (path: string, cb: WatchCallback) => {
      watchFileCallbacks.set(path, cb);
      return {
        stop: () => {
          watchFileCallbacks.delete(path);
        },
      };
    },
  }),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are set up)
// ---------------------------------------------------------------------------

import {
  createFileWatcher,
  suppressFileWatch,
  hashContent,
  shouldSuppressNotification,
} from "@/lib/services/file-watcher";
import type { FileWatcher, FileChangeCallback } from "@/lib/services/file-watcher";

// ---------------------------------------------------------------------------
// Helper: fire a native watch 'change' event for a path
// ---------------------------------------------------------------------------
function fireChangeEvent(path: string): void {
  const cb = watchFileCallbacks.get(path);
  if (!cb) throw new Error(`No watcher registered for ${path}`);
  cb({ type: "change", path });
}

// ---------------------------------------------------------------------------
// Helper: sleep
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ElectronFileWatcher: hash-aware suppression (#1457 Patch 2)", () => {
  const TEST_PATH = "/test/doc.mdi";
  let watcher: FileWatcher;
  let onChanged: ReturnType<typeof vi.fn<FileChangeCallback>>;

  beforeEach(() => {
    watchFileCallbacks.clear();
    mockReadFile.mockReset();
    mockGetFileMetadata.mockReset();
    mockWriteFile.mockReset();
    onChanged = vi.fn<FileChangeCallback>();
  });

  afterEach(() => {
    watcher?.stop();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Case A: auto-save → hash suppression → native event does NOT call onChanged
  // -------------------------------------------------------------------------
  it("Case A: native change event after hash-suppressed save does not fire onChanged", async () => {
    const content = "hello world";
    const contentHash = hashContent(content);

    // Set up VFS: metadata returns mtime 1000, readFile returns content
    mockGetFileMetadata.mockResolvedValue({ lastModified: 1000, size: content.length });
    mockReadFile.mockResolvedValue(content);

    watcher = createFileWatcher({ path: TEST_PATH, onChanged });
    watcher.start();
    await sleep(30); // let catchUpAndStartWatcher complete

    // Simulate auto-save: suppress with expected hash BEFORE the write
    suppressFileWatch(TEST_PATH, undefined, contentHash);

    // Simulate native filesystem event (what the OS would emit after the write)
    fireChangeEvent(TEST_PATH);
    await sleep(30); // let readAndNotify complete

    expect(onChanged).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Case B: watcher paused → self-save with hash → resume → catch-up skips
  // -------------------------------------------------------------------------
  it("Case B: catch-up after resume skips self-save identified by hash", async () => {
    const initialContent = "initial";
    const savedContent = "saved by app";
    const savedHash = hashContent(savedContent);

    // First start: mtime 1000, initial content
    mockGetFileMetadata.mockResolvedValueOnce({ lastModified: 1000, size: initialContent.length });
    mockReadFile.mockResolvedValueOnce(initialContent);

    watcher = createFileWatcher({ path: TEST_PATH, onChanged });
    watcher.start();
    await sleep(30); // complete initial catchUpAndStartWatcher

    // Stop (simulating blur/background)
    watcher.stop();

    // Simulate app self-save while paused: register hash suppression
    suppressFileWatch(TEST_PATH, undefined, savedHash);

    // File has now been written: mtime advanced to 2000, content is savedContent
    mockGetFileMetadata.mockResolvedValueOnce({ lastModified: 2000, size: savedContent.length });
    mockReadFile.mockResolvedValueOnce(savedContent);

    // Resume
    watcher.start();
    await sleep(30); // let catchUpAndStartWatcher run

    // catch-up should recognise the self-save and NOT call onChanged
    expect(onChanged).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Case B2: hash MISMATCH within TTL — genuine external change must still fire
  // -------------------------------------------------------------------------
  it("Case B2: hash mismatch within TTL fires onChanged (real external change not hidden)", async () => {
    const initialContent = "initial";
    const appSavedContent = "saved by app";
    const externalContent = "edited externally";
    const appSavedHash = hashContent(appSavedContent);

    // First start: mtime 1000
    mockGetFileMetadata.mockResolvedValueOnce({ lastModified: 1000, size: initialContent.length });
    mockReadFile.mockResolvedValueOnce(initialContent);

    watcher = createFileWatcher({ path: TEST_PATH, onChanged });
    watcher.start();
    await sleep(30);

    // Stop
    watcher.stop();

    // App saved content (registered with hash for appSavedContent)
    suppressFileWatch(TEST_PATH, undefined, appSavedHash);

    // But the disk actually has EXTERNAL content (different hash)
    mockGetFileMetadata.mockResolvedValueOnce({ lastModified: 2000, size: externalContent.length });
    mockReadFile.mockResolvedValueOnce(externalContent);

    // Resume
    watcher.start();
    await sleep(30);

    // hash mismatch → must fire onChanged even though entry is within TTL
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledWith(externalContent, 2000);
  });

  // -------------------------------------------------------------------------
  // Case C: _isActive guard — stop() during in-flight readAndNotify cancels notification
  // -------------------------------------------------------------------------
  it("Case C: stop() during in-flight readAndNotify prevents onChanged", async () => {
    // Use a controllable promise for readFile so we can call stop() while it is in-flight
    let resolveRead!: (value: string) => void;
    const readPromise = new Promise<string>((resolve) => {
      resolveRead = resolve;
    });

    const content = "some content";
    mockGetFileMetadata.mockResolvedValue({ lastModified: 1000, size: content.length });
    // First call (initial start): resolve immediately so catchUpAndStartWatcher finishes
    mockReadFile.mockResolvedValueOnce(content);
    // Second call (readAndNotify from native event): use controllable promise
    mockReadFile.mockReturnValueOnce(readPromise);

    watcher = createFileWatcher({ path: TEST_PATH, onChanged });
    watcher.start();
    await sleep(30); // let initial catch-up complete

    // Fire native event → triggers readAndNotify → hits the deferred readFile
    fireChangeEvent(TEST_PATH);
    // readAndNotify is now waiting on readPromise

    // Stop the watcher while read is in-flight
    watcher.stop();

    // Now resolve the read — _isActive is false so onChanged must NOT be called
    resolveRead("new content");
    await sleep(30);

    expect(onChanged).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Case D: real external change (hash mismatch, no suppression) fires onChanged
  // -------------------------------------------------------------------------
  it("Case D: genuine external change (no suppression) fires onChanged", async () => {
    const initialContent = "original";
    const externalContent = "changed externally";

    // Initial start
    mockGetFileMetadata.mockResolvedValueOnce({ lastModified: 1000, size: initialContent.length });
    mockReadFile.mockResolvedValueOnce(initialContent);

    watcher = createFileWatcher({ path: TEST_PATH, onChanged });
    watcher.start();
    await sleep(30);

    // Native event: file changed externally, no suppression registered
    mockGetFileMetadata.mockResolvedValueOnce({ lastModified: 2000, size: externalContent.length });
    mockReadFile.mockResolvedValueOnce(externalContent);

    fireChangeEvent(TEST_PATH);
    await sleep(30);

    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledWith(externalContent, expect.any(Number));
  });
});

// ---------------------------------------------------------------------------
// Unit tests for shouldSuppressNotification
// ---------------------------------------------------------------------------
describe("shouldSuppressNotification", () => {
  it("returns false when no entry exists", () => {
    expect(shouldSuppressNotification("/no/entry.mdi", "abc")).toBe(false);
  });

  it("returns true for hash-matching entry within TTL", () => {
    const content = "test content";
    const hash = hashContent(content);
    suppressFileWatch("/hash-match.mdi", undefined, hash);
    expect(shouldSuppressNotification("/hash-match.mdi", hash)).toBe(true);
  });

  it("returns false for hash-mismatching entry (external change not hidden)", () => {
    const content = "app saved";
    const hash = hashContent(content);
    suppressFileWatch("/hash-mismatch.mdi", undefined, hash);
    expect(shouldSuppressNotification("/hash-mismatch.mdi", hashContent("different"))).toBe(false);
  });

  it("returns true for legacy time-only entry within TTL", () => {
    suppressFileWatch("/legacy.mdi", 5000); // no hash → legacy
    expect(shouldSuppressNotification("/legacy.mdi", "anything")).toBe(true);
  });
});
