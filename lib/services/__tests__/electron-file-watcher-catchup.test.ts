/**
 * ElectronFileWatcher: catch-up on resume (#1448 Codex review).
 *
 * The activity-pause integration tests run with isElectronRenderer() === false
 * (jsdom), so they exercise WebFileWatcher only. This suite pins the
 * PRODUCTION Electron resume path — catchUpAndStartWatcher's mtime advance,
 * no-change, and same-second content-hash branches — so a regression in the
 * Electron-specific catch-up logic cannot ship green.
 *
 * No native watch is available in jsdom (window.electronAPI is absent), so
 * the watcher falls back to polling AFTER the catch-up — the catch-up itself
 * is the code under test and runs before the fallback starts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

// Electron renderer — createFileWatcher returns ElectronFileWatcher
vi.mock("@/lib/utils/runtime-env", () => ({
  isElectronRenderer: () => true,
}));

import { createFileWatcher } from "@/lib/services/file-watcher";
import type { FileChangeCallback, FileWatcher } from "@/lib/services/file-watcher";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("ElectronFileWatcher: catch-up on resume (#1448)", () => {
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

  it("fires onChanged when mtime advanced while paused (focus round-trip with a real change)", async () => {
    watcher = createFileWatcher({ path: "/test.mdi", onChanged, pollIntervalMs: 60000 });
    watcher.start();
    await sleep(50);
    watcher.stop();

    mockLastModified = 2000;
    mockFileContent = "changed while paused";

    watcher.start();
    await sleep(50);

    expect(onChanged).toHaveBeenCalledWith("changed while paused", 2000);
  }, 10000);

  it("does NOT fire onChanged when nothing changed while paused (#1445 symptom guard)", async () => {
    watcher = createFileWatcher({ path: "/test.mdi", onChanged, pollIntervalMs: 60000 });
    watcher.start();
    await sleep(50);
    watcher.stop();

    watcher.start();
    await sleep(50);

    expect(onChanged).not.toHaveBeenCalled();
  }, 10000);

  it("fires onChanged for a same-second change (mtime equal, content hash differs)", async () => {
    watcher = createFileWatcher({ path: "/test.mdi", onChanged, pollIntervalMs: 60000 });
    watcher.start();
    await sleep(50);
    // pausedAt is recorded at stop(); mtime stays 1000 (same filesystem second)
    watcher.stop();

    mockFileContent = "same-second edit";

    watcher.start();
    await sleep(50);

    expect(onChanged).toHaveBeenCalledWith("same-second edit", 1000);
  }, 10000);
});
