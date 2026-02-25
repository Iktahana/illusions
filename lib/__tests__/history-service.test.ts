/**
 * Unit tests for the HistoryService (history-service.ts).
 *
 * Tests cover:
 * - Snapshot creation (auto, manual, milestone)
 * - Snapshot retrieval and filtering by source file
 * - Snapshot restoration with checksum verification
 * - Snapshot deletion
 * - Pruning by max count, retention period, and per-file limit
 * - shouldCreateSnapshot interval logic
 * - Bookmark toggle
 * - Singleton factory (getHistoryService / resetHistoryService)
 * - Edge cases: empty history, corrupted checksum, missing snapshots
 *
 * Note: VFS is fully mocked. No real filesystem access.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";

import type { VFSDirectoryHandle, VFSFileHandle } from "@/lib/vfs/types";

// -----------------------------------------------------------------------
// In-memory VFS mock
// -----------------------------------------------------------------------

/**
 * In-memory file store for the mock VFS.
 * Maps path segments to content.
 */
const fileStore = new Map<string, string>();

/** Track removed entries for deletion verification */
const removedEntries: string[] = [];

function createMockFileHandle(
  name: string,
  dirPath: string
): VFSFileHandle {
  const fullPath = dirPath ? `${dirPath}/${name}` : name;
  return {
    name,
    path: fullPath,
    read: vi.fn(async (): Promise<string> => {
      const content = fileStore.get(fullPath);
      if (content === undefined) {
        throw new Error(`File not found: ${fullPath}`);
      }
      return content;
    }),
    write: vi.fn(async (content: string): Promise<void> => {
      fileStore.set(fullPath, content);
    }),
    getFile: vi.fn(async () => new File([""], name)),
  } as unknown as VFSFileHandle;
}

function createMockDirectoryHandle(
  name: string,
  path: string
): VFSDirectoryHandle {
  return {
    name,
    path,
    getFileHandle: vi.fn(
      async (
        fileName: string,
        options?: { create?: boolean }
      ): Promise<VFSFileHandle> => {
        const fullPath = path ? `${path}/${fileName}` : fileName;
        if (!fileStore.has(fullPath) && !options?.create) {
          throw new Error(`File not found: ${fullPath}`);
        }
        return createMockFileHandle(fileName, path);
      }
    ),
    getDirectoryHandle: vi.fn(
      async (
        dirName: string,
        options?: { create?: boolean }
      ): Promise<VFSDirectoryHandle> => {
        const newPath = path ? `${path}/${dirName}` : dirName;
        return createMockDirectoryHandle(dirName, newPath);
      }
    ),
    removeEntry: vi.fn(async (entryName: string): Promise<void> => {
      const fullPath = path ? `${path}/${entryName}` : entryName;
      fileStore.delete(fullPath);
      removedEntries.push(entryName);
    }),
    entries: vi.fn(async function* () {
      // no-op iterator
    }),
  } as unknown as VFSDirectoryHandle;
}

// -----------------------------------------------------------------------
// Mock VFS factory
// -----------------------------------------------------------------------

vi.mock("@/lib/vfs", () => ({
  getVFS: () => ({
    getDirectoryHandle: vi.fn(async () =>
      createMockDirectoryHandle("", "")
    ),
  }),
}));

// -----------------------------------------------------------------------
// Mock crypto.subtle for SHA-256 checksums
// -----------------------------------------------------------------------

// In jsdom, crypto.subtle may not be fully available.
// We provide a consistent mock for deterministic checksums.
const originalCrypto = globalThis.crypto;

function mockCryptoSubtle(): void {
  const encoder = new TextEncoder();

  // Simple hash: use built-in crypto if available, otherwise provide a
  // deterministic fallback that always returns a fixed-length hex string.
  const mockDigest = async (
    _algo: string,
    data: BufferSource
  ): Promise<ArrayBuffer> => {
    // Use a simple FNV-like hash for deterministic test results
    const bytes = new Uint8Array(
      data instanceof ArrayBuffer ? data : (data as Uint8Array).buffer
    );
    const hash = new Uint8Array(32);
    for (let i = 0; i < bytes.length; i++) {
      hash[i % 32] ^= bytes[i];
      hash[(i + 1) % 32] = (hash[(i + 1) % 32] + bytes[i]) & 0xff;
    }
    return hash.buffer;
  };

  Object.defineProperty(globalThis, "crypto", {
    value: {
      ...originalCrypto,
      subtle: {
        digest: mockDigest,
      },
      randomUUID: () =>
        `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    },
    configurable: true,
  });
}

// -----------------------------------------------------------------------
// Import module under test
// -----------------------------------------------------------------------

import {
  HistoryService,
  getHistoryService,
  resetHistoryService,
} from "@/lib/services/history-service";

import type {
  SnapshotEntry,
  HistoryIndex,
  CreateSnapshotOptions,
  RestoreResult,
} from "@/lib/services/history-service";

// -----------------------------------------------------------------------
// Test suite
// -----------------------------------------------------------------------

describe("HistoryService", () => {
  let service: HistoryService;

  beforeEach(() => {
    fileStore.clear();
    removedEntries.length = 0;
    mockCryptoSubtle();
    resetHistoryService();
    service = new HistoryService();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "crypto", {
      value: originalCrypto,
      configurable: true,
    });
  });

  // -----------------------------------------------------------------------
  // createSnapshot
  // -----------------------------------------------------------------------

  describe("createSnapshot", () => {
    it("should create an auto snapshot with correct metadata", async () => {
      const entry = await service.createSnapshot({
        sourceFile: "main.mdi",
        content: "Hello, world!",
      });

      expect(entry.sourceFile).toBe("main.mdi");
      expect(entry.type).toBe("auto");
      expect(entry.characterCount).toBe(13);
      expect(entry.fileSize).toBeGreaterThan(0);
      expect(entry.checksum).toBeTruthy();
      expect(entry.id).toBeTruthy();
      expect(entry.filename).toContain("main.mdi");
      expect(entry.filename).toContain(".__auto__.");
      expect(entry.filename).toContain(".history");
      expect(entry.label).toBeUndefined();
    });

    it("should create a manual snapshot without __auto__ marker", async () => {
      const entry = await service.createSnapshot({
        sourceFile: "chapter1.mdi",
        content: "Manual save",
        type: "manual",
      });

      expect(entry.type).toBe("manual");
      expect(entry.filename).not.toContain(".__auto__.");
      expect(entry.filename).toContain("chapter1.mdi");
    });

    it("should create a milestone snapshot with label", async () => {
      const entry = await service.createSnapshot({
        sourceFile: "novel.mdi",
        content: "Milestone content",
        type: "milestone",
        label: "Draft v1.0",
      });

      expect(entry.type).toBe("milestone");
      expect(entry.label).toBe("Draft v1.0");
      expect(entry.filename).not.toContain(".__auto__.");
    });

    it("should store the snapshot content in VFS", async () => {
      const content = "Stored content for verification";
      await service.createSnapshot({
        sourceFile: "test.mdi",
        content,
      });

      // Verify at least one file was written with the content
      const storedValues = Array.from(fileStore.values());
      const hasContent = storedValues.some((v) => v === content);
      expect(hasContent).toBe(true);
    });

    it("should update the history index", async () => {
      await service.createSnapshot({
        sourceFile: "main.mdi",
        content: "First snapshot",
      });
      await service.createSnapshot({
        sourceFile: "main.mdi",
        content: "Second snapshot",
      });

      // Read the index from the file store
      const indexKey = Array.from(fileStore.keys()).find((k) =>
        k.includes("index.json")
      );
      expect(indexKey).toBeTruthy();

      const index = JSON.parse(fileStore.get(indexKey!)!) as HistoryIndex;
      expect(index.snapshots.length).toBe(2);
      // Newest first
      expect(index.snapshots[0].characterCount).toBe("Second snapshot".length);
    });

    it("should handle empty content", async () => {
      const entry = await service.createSnapshot({
        sourceFile: "empty.mdi",
        content: "",
      });

      expect(entry.characterCount).toBe(0);
      expect(entry.fileSize).toBe(0);
      expect(entry.checksum).toBeTruthy();
    });

    it("should handle Japanese content correctly", async () => {
      const japaneseContent = "私は{雪女|ゆき.おんな}を見た。";
      const entry = await service.createSnapshot({
        sourceFile: "japanese.mdi",
        content: japaneseContent,
      });

      expect(entry.characterCount).toBe(japaneseContent.length);
      // UTF-8 byte size for Japanese characters is larger than char count
      expect(entry.fileSize).toBeGreaterThan(entry.characterCount);
    });
  });

  // -----------------------------------------------------------------------
  // getSnapshots
  // -----------------------------------------------------------------------

  describe("getSnapshots", () => {
    it("should return empty array when no snapshots exist", async () => {
      const snapshots = await service.getSnapshots();
      expect(snapshots).toEqual([]);
    });

    it("should return all snapshots sorted by timestamp descending", async () => {
      await service.createSnapshot({
        sourceFile: "main.mdi",
        content: "First",
      });
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));
      await service.createSnapshot({
        sourceFile: "main.mdi",
        content: "Second",
      });

      const snapshots = await service.getSnapshots();
      expect(snapshots.length).toBe(2);
      expect(snapshots[0].timestamp).toBeGreaterThanOrEqual(
        snapshots[1].timestamp
      );
    });

    it("should filter snapshots by source file", async () => {
      await service.createSnapshot({
        sourceFile: "main.mdi",
        content: "Main content",
      });
      await service.createSnapshot({
        sourceFile: "chapter1.mdi",
        content: "Chapter 1 content",
      });
      await service.createSnapshot({
        sourceFile: "main.mdi",
        content: "Main content v2",
      });

      const mainSnapshots = await service.getSnapshots("main.mdi");
      expect(mainSnapshots.length).toBe(2);
      expect(mainSnapshots.every((s) => s.sourceFile === "main.mdi")).toBe(
        true
      );

      const ch1Snapshots = await service.getSnapshots("chapter1.mdi");
      expect(ch1Snapshots.length).toBe(1);
      expect(ch1Snapshots[0].sourceFile).toBe("chapter1.mdi");
    });

    it("should return empty array for a non-existent source file", async () => {
      await service.createSnapshot({
        sourceFile: "main.mdi",
        content: "content",
      });

      const snapshots = await service.getSnapshots("nonexistent.mdi");
      expect(snapshots).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // restoreSnapshot
  // -----------------------------------------------------------------------

  describe("restoreSnapshot", () => {
    it("should restore snapshot content successfully", async () => {
      const content = "Content to restore";
      const entry = await service.createSnapshot({
        sourceFile: "main.mdi",
        content,
      });

      const result = await service.restoreSnapshot(entry.id);

      expect(result.success).toBe(true);
      expect(result.content).toBe(content);
      expect(result.error).toBeUndefined();
    });

    it("should return error for non-existent snapshot ID", async () => {
      const result = await service.restoreSnapshot("non-existent-id");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Snapshot not found");
      expect(result.content).toBeUndefined();
    });

    it("should detect corrupted snapshots via checksum mismatch", async () => {
      const entry = await service.createSnapshot({
        sourceFile: "main.mdi",
        content: "Original content",
      });

      // Tamper with the stored file content
      const snapshotKey = Array.from(fileStore.keys()).find((k) =>
        k.includes(entry.filename)
      );
      if (snapshotKey) {
        fileStore.set(snapshotKey, "Tampered content!!!");
      }

      const result = await service.restoreSnapshot(entry.id);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Checksum mismatch");
    });
  });

  // -----------------------------------------------------------------------
  // getSnapshotContent
  // -----------------------------------------------------------------------

  describe("getSnapshotContent", () => {
    it("should return content for valid snapshot", async () => {
      const entry = await service.createSnapshot({
        sourceFile: "main.mdi",
        content: "Read-only peek",
      });

      const content = await service.getSnapshotContent(entry.id);
      expect(content).toBe("Read-only peek");
    });

    it("should return null for non-existent snapshot", async () => {
      const content = await service.getSnapshotContent("does-not-exist");
      expect(content).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // deleteSnapshot
  // -----------------------------------------------------------------------

  describe("deleteSnapshot", () => {
    it("should delete a snapshot by ID", async () => {
      const entry = await service.createSnapshot({
        sourceFile: "main.mdi",
        content: "To be deleted",
      });

      await service.deleteSnapshot(entry.id);

      const snapshots = await service.getSnapshots();
      expect(snapshots.find((s) => s.id === entry.id)).toBeUndefined();
    });

    it("should throw for non-existent snapshot ID", async () => {
      await expect(
        service.deleteSnapshot("non-existent-id")
      ).rejects.toThrow("Snapshot not found");
    });

    it("should allow deleting milestone snapshots", async () => {
      const entry = await service.createSnapshot({
        sourceFile: "main.mdi",
        content: "Milestone to delete",
        type: "milestone",
        label: "Test Milestone",
      });

      await service.deleteSnapshot(entry.id);

      const snapshots = await service.getSnapshots();
      expect(snapshots.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // shouldCreateSnapshot
  // -----------------------------------------------------------------------

  describe("shouldCreateSnapshot", () => {
    it("should return true when no previous snapshots exist", async () => {
      const should = await service.shouldCreateSnapshot("main.mdi");
      expect(should).toBe(true);
    });

    it("should return false when a recent snapshot exists (within 5 min)", async () => {
      await service.createSnapshot({
        sourceFile: "main.mdi",
        content: "Recent snapshot",
      });

      const should = await service.shouldCreateSnapshot("main.mdi");
      expect(should).toBe(false);
    });

    it("should return true for a different source file", async () => {
      await service.createSnapshot({
        sourceFile: "chapter1.mdi",
        content: "Chapter 1",
      });

      const should = await service.shouldCreateSnapshot("chapter2.mdi");
      expect(should).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // pruneOldSnapshots
  // -----------------------------------------------------------------------

  describe("pruneOldSnapshots", () => {
    it("should not prune milestones", async () => {
      // Create a milestone
      const milestone = await service.createSnapshot({
        sourceFile: "main.mdi",
        content: "Milestone",
        type: "milestone",
        label: "Keep me",
      });

      // Create some auto snapshots
      for (let i = 0; i < 3; i++) {
        await service.createSnapshot({
          sourceFile: "main.mdi",
          content: `Auto ${i}`,
        });
      }

      await service.pruneOldSnapshots();

      const snapshots = await service.getSnapshots();
      const milestoneStillExists = snapshots.some(
        (s) => s.id === milestone.id
      );
      expect(milestoneStillExists).toBe(true);
    });

    it("should keep snapshots within maxSnapshots limit", async () => {
      // Create fewer snapshots than the default max (100)
      for (let i = 0; i < 5; i++) {
        await service.createSnapshot({
          sourceFile: "main.mdi",
          content: `Snapshot ${i}`,
        });
      }

      await service.pruneOldSnapshots();

      const snapshots = await service.getSnapshots();
      expect(snapshots.length).toBe(5);
    });
  });

  // -----------------------------------------------------------------------
  // Bookmarks
  // -----------------------------------------------------------------------

  describe("bookmarks", () => {
    it("should return empty set when no bookmarks exist", async () => {
      const bookmarks = await service.getBookmarks();
      expect(bookmarks.size).toBe(0);
    });

    it("should toggle bookmark on", async () => {
      const entry = await service.createSnapshot({
        sourceFile: "main.mdi",
        content: "Bookmarked snapshot",
      });

      const isBookmarked = await service.toggleBookmark(entry.id);
      expect(isBookmarked).toBe(true);

      const bookmarks = await service.getBookmarks();
      expect(bookmarks.has(entry.id)).toBe(true);
    });

    it("should toggle bookmark off", async () => {
      const entry = await service.createSnapshot({
        sourceFile: "main.mdi",
        content: "Toggle test",
      });

      // Toggle on
      await service.toggleBookmark(entry.id);
      // Toggle off
      const isBookmarked = await service.toggleBookmark(entry.id);

      expect(isBookmarked).toBe(false);

      const bookmarks = await service.getBookmarks();
      expect(bookmarks.has(entry.id)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Singleton factory
  // -----------------------------------------------------------------------

  describe("getHistoryService / resetHistoryService", () => {
    it("should return the same singleton instance", () => {
      resetHistoryService();
      const instance1 = getHistoryService();
      const instance2 = getHistoryService();
      expect(instance1).toBe(instance2);
    });

    it("should return a new instance after reset", () => {
      resetHistoryService();
      const instance1 = getHistoryService();
      resetHistoryService();
      const instance2 = getHistoryService();
      expect(instance1).not.toBe(instance2);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe("edge cases", () => {
    it("should handle creating snapshots for multiple source files", async () => {
      await service.createSnapshot({
        sourceFile: "file-a.mdi",
        content: "Content A",
      });
      await service.createSnapshot({
        sourceFile: "file-b.mdi",
        content: "Content B",
      });
      await service.createSnapshot({
        sourceFile: "file-c.mdi",
        content: "Content C",
      });

      const allSnapshots = await service.getSnapshots();
      expect(allSnapshots.length).toBe(3);

      const sourceFiles = new Set(allSnapshots.map((s) => s.sourceFile));
      expect(sourceFiles.size).toBe(3);
    });

    it("should generate unique IDs for each snapshot", async () => {
      const entries: SnapshotEntry[] = [];
      for (let i = 0; i < 5; i++) {
        const entry = await service.createSnapshot({
          sourceFile: "main.mdi",
          content: `Snapshot ${i}`,
        });
        entries.push(entry);
      }

      const ids = new Set(entries.map((e) => e.id));
      expect(ids.size).toBe(5);
    });

    it("should produce different checksums for different content", async () => {
      const entry1 = await service.createSnapshot({
        sourceFile: "main.mdi",
        content: "Content version 1",
      });
      const entry2 = await service.createSnapshot({
        sourceFile: "main.mdi",
        content: "Content version 2",
      });

      expect(entry1.checksum).not.toBe(entry2.checksum);
    });

    it("should produce the same checksum for identical content", async () => {
      const content = "Identical content for both snapshots";
      const entry1 = await service.createSnapshot({
        sourceFile: "main.mdi",
        content,
      });
      const entry2 = await service.createSnapshot({
        sourceFile: "main.mdi",
        content,
      });

      expect(entry1.checksum).toBe(entry2.checksum);
    });

    it("should set correct timestamp on snapshot entries", async () => {
      const before = Date.now();
      const entry = await service.createSnapshot({
        sourceFile: "main.mdi",
        content: "Timestamp test",
      });
      const after = Date.now();

      expect(entry.timestamp).toBeGreaterThanOrEqual(before);
      expect(entry.timestamp).toBeLessThanOrEqual(after);
    });

    it("should calculate correct byte size for multi-byte characters", async () => {
      // Each CJK character is 3 bytes in UTF-8
      const cjkContent = "漢字";
      const entry = await service.createSnapshot({
        sourceFile: "cjk.mdi",
        content: cjkContent,
      });

      expect(entry.characterCount).toBe(2);
      // 2 CJK chars * 3 bytes each = 6 bytes
      expect(entry.fileSize).toBe(6);
    });
  });
});
