/**
 * Unit tests for HistoryService (history-service.ts).
 *
 * HistoryService is a facade over HistoryPolicy + HistoryStore.
 * We mock ProjectFileService (the underlying VFS) so no real filesystem access occurs.
 *
 * Tests cover:
 * - createSnapshot: auto/manual/milestone/pre-close/restore-point types
 * - createSnapshot: type comes from options, never hardcoded to "auto" (B1 check)
 * - createSnapshot: returns null when auto-throttle blocks within 5 minutes
 * - getSnapshots: sorted descending, filtered by sourcePath, legacy entry fallbacks
 * - restoreSnapshot: success, not found, checksum mismatch
 * - getSnapshotContent: delegates to restoreSnapshot
 * - deleteSnapshot: removes entry and file
 * - shouldCreateSnapshot: delegates to policy (true/false)
 * - getBookmarks / toggleBookmark: round-trip
 * - onSnapshotCreated: listener called on new snapshot
 * - pruneOldSnapshots: removes old auto entries, keeps permanent ones
 * - Singleton: getHistoryService / resetHistoryService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type { VFSDirectoryHandle, VFSFileHandle } from "@/lib/vfs/types";
import type { HistoryIndex } from "@/lib/services/history-policy";

// -----------------------------------------------------------------------
// In-memory VFS mock
// -----------------------------------------------------------------------

const fileStore = new Map<string, string>();

function createMockFileHandle(name: string, dirPath: string): VFSFileHandle {
  const fullPath = dirPath ? `${dirPath}/${name}` : name;
  return {
    name,
    path: fullPath,
    read: vi.fn(async (): Promise<string> => {
      const content = fileStore.get(fullPath);
      if (content === undefined) throw new Error(`File not found: ${fullPath}`);
      return content;
    }),
    write: vi.fn(async (content: string): Promise<void> => {
      fileStore.set(fullPath, content);
    }),
    getFile: vi.fn(async () => new File([""], name)),
  } as unknown as VFSFileHandle;
}

function createMockDirectoryHandle(name: string, path: string): VFSDirectoryHandle {
  return {
    name,
    path,
    getFileHandle: vi.fn(
      async (fileName: string, options?: { create?: boolean }): Promise<VFSFileHandle> => {
        const fullPath = path ? `${path}/${fileName}` : fileName;
        if (!fileStore.has(fullPath) && !options?.create) {
          throw new Error(`File not found: ${fullPath}`);
        }
        return createMockFileHandle(fileName, path);
      },
    ),
    getDirectoryHandle: vi.fn(
      async (dirName: string, _options?: { create?: boolean }): Promise<VFSDirectoryHandle> => {
        const newPath = path ? `${path}/${dirName}` : dirName;
        return createMockDirectoryHandle(dirName, newPath);
      },
    ),
    removeEntry: vi.fn(async (entryName: string): Promise<void> => {
      const fullPath = path ? `${path}/${entryName}` : entryName;
      fileStore.delete(fullPath);
    }),
    entries: vi.fn(async function* () {
      /* no-op */
    }),
  } as unknown as VFSDirectoryHandle;
}

vi.mock("@/lib/services/project-file-service", () => ({
  getProjectFileService: () => ({
    getDirectoryHandle: vi.fn(async () => createMockDirectoryHandle("", "")),
  }),
}));

// -----------------------------------------------------------------------
// Mock crypto.subtle for deterministic checksums
// -----------------------------------------------------------------------

const originalCrypto = globalThis.crypto;

function mockCryptoSubtle(): void {
  const mockDigest = async (_algo: string, data: BufferSource): Promise<ArrayBuffer> => {
    const bytes = new Uint8Array(data instanceof ArrayBuffer ? data : (data as Uint8Array).buffer);
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
      subtle: { digest: mockDigest },
      randomUUID: () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
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

import type { SnapshotEntry, CreateSnapshotOptions } from "@/lib/services/history-service";

// -----------------------------------------------------------------------
// Test suite
// -----------------------------------------------------------------------

describe("HistoryService", () => {
  let service: HistoryService;

  beforeEach(() => {
    fileStore.clear();
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
    it("creates an auto snapshot when type is omitted (default)", async () => {
      const entry = await service.createSnapshot({
        sourcePath: "main.mdi",
        content: "Hello",
      });

      expect(entry).not.toBeNull();
      expect(entry!.type).toBe("auto");
      expect(entry!.filename).toContain(".__auto__.");
    });

    it("type from options is respected — not hardcoded to 'auto' (B1 fix)", async () => {
      for (const type of ["manual", "milestone", "pre-close", "restore-point"] as const) {
        fileStore.clear();
        const entry = await service.createSnapshot({
          sourcePath: "main.mdi",
          content: "Content",
          type,
        });
        expect(entry).not.toBeNull();
        expect(entry!.type).toBe(type);
        expect(entry!.filename).not.toContain(".__auto__.");
      }
    });

    it("manual snapshot has correct metadata", async () => {
      const entry = await service.createSnapshot({
        sourcePath: "chapter1.mdi",
        content: "Manual save",
        type: "manual",
      });

      expect(entry!.type).toBe("manual");
      expect(entry!.sourcePath).toBe("chapter1.mdi");
      expect(entry!.displayName).toBe("chapter1.mdi");
      expect(entry!.characterCount).toBe("Manual save".length);
      expect(entry!.fileSize).toBeGreaterThan(0);
      expect(entry!.checksum).toBeTruthy();
      expect(entry!.id).toBeTruthy();
    });

    it("milestone snapshot stores the label", async () => {
      const entry = await service.createSnapshot({
        sourcePath: "novel.mdi",
        content: "Milestone content",
        type: "milestone",
        label: "Draft v1.0",
      });

      expect(entry!.type).toBe("milestone");
      expect(entry!.label).toBe("Draft v1.0");
    });

    it("stores snapshot content in VFS", async () => {
      const content = "Stored content for verification";
      await service.createSnapshot({ sourcePath: "test.mdi", content });

      const stored = Array.from(fileStore.values());
      expect(stored.some((v) => v === content)).toBe(true);
    });

    it("updates the history index with the new entry", async () => {
      await service.createSnapshot({ sourcePath: "main.mdi", content: "First" });
      await service.createSnapshot({ sourcePath: "main.mdi", content: "Second", type: "manual" });

      const indexKey = Array.from(fileStore.keys()).find((k) => k.includes("index.json"));
      expect(indexKey).toBeTruthy();
      const index = JSON.parse(fileStore.get(indexKey!)!) as HistoryIndex;
      expect(index.snapshots.length).toBe(2);
    });

    it("newest entry appears first in the index", async () => {
      await service.createSnapshot({ sourcePath: "main.mdi", content: "First" });
      await new Promise((r) => setTimeout(r, 10));
      await service.createSnapshot({ sourcePath: "main.mdi", content: "Second", type: "manual" });

      const indexKey = Array.from(fileStore.keys()).find((k) => k.includes("index.json"))!;
      const index = JSON.parse(fileStore.get(indexKey)!) as HistoryIndex;
      expect(index.snapshots[0].characterCount).toBe("Second".length);
    });

    it("handles empty content", async () => {
      const entry = await service.createSnapshot({ sourcePath: "empty.mdi", content: "" });
      expect(entry!.characterCount).toBe(0);
      expect(entry!.fileSize).toBe(0);
    });

    it("handles Japanese content (UTF-8 byte size > char count)", async () => {
      const jp = "私は{雪女|ゆき.おんな}を見た。";
      const entry = await service.createSnapshot({ sourcePath: "jp.mdi", content: jp });
      expect(entry!.characterCount).toBe(jp.length);
      expect(entry!.fileSize).toBeGreaterThan(entry!.characterCount);
    });

    it("sanitizes Windows drive-letter colon in filename", async () => {
      const entry = await service.createSnapshot({
        sourcePath: "C:\\Users\\test\\novel.mdi",
        content: "drive test",
      });
      expect(entry!.filename).not.toContain(":");
      expect(entry!.filename).toContain(".history");
    });

    it("sanitizes all Windows-invalid chars in filename", async () => {
      const entry = await service.createSnapshot({
        sourcePath: "C:\\path<with>special|chars.mdi",
        content: "special",
      });
      expect(entry!.filename).not.toMatch(/[:\\/<>"|?*]/);
    });

    it("returns null for auto type when throttled (within 5 min)", async () => {
      // First auto snapshot created
      const first = await service.createSnapshot({ sourcePath: "main.mdi", content: "v1" });
      expect(first).not.toBeNull();

      // Immediate second auto snapshot — should be throttled
      const second = await service.createSnapshot({ sourcePath: "main.mdi", content: "v2" });
      expect(second).toBeNull();
    });

    it("non-auto types bypass the throttle even within 5 min", async () => {
      // Create an auto snapshot first
      await service.createSnapshot({ sourcePath: "main.mdi", content: "v1" });

      // manual, milestone, pre-close, restore-point should NOT be throttled
      for (const type of ["manual", "milestone", "pre-close", "restore-point"] as const) {
        const entry = await service.createSnapshot({
          sourcePath: "main.mdi",
          content: "bypass",
          type,
        });
        expect(entry).not.toBeNull();
        expect(entry!.type).toBe(type);
      }
    });

    it("emits onSnapshotCreated listener when a snapshot is created", async () => {
      const listener = vi.fn();
      service.onSnapshotCreated(listener);
      const entry = await service.createSnapshot({ sourcePath: "main.mdi", content: "x" });
      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith(entry);
    });

    it("listener is not called when throttled (returns null)", async () => {
      const listener = vi.fn();
      service.onSnapshotCreated(listener);
      await service.createSnapshot({ sourcePath: "main.mdi", content: "v1" });
      listener.mockClear();
      await service.createSnapshot({ sourcePath: "main.mdi", content: "v2" }); // throttled
      expect(listener).not.toHaveBeenCalled();
    });

    it("returned unsubscribe function removes the listener", async () => {
      const listener = vi.fn();
      const unsub = service.onSnapshotCreated(listener);
      unsub();
      await service.createSnapshot({
        sourcePath: "main.mdi",
        content: "after unsub",
        type: "manual",
      });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // getSnapshots
  // -----------------------------------------------------------------------

  describe("getSnapshots", () => {
    it("returns empty array when no snapshots exist", async () => {
      expect(await service.getSnapshots()).toEqual([]);
    });

    it("returns snapshots sorted by timestamp descending", async () => {
      await service.createSnapshot({ sourcePath: "main.mdi", content: "A", type: "manual" });
      await new Promise((r) => setTimeout(r, 10));
      await service.createSnapshot({ sourcePath: "main.mdi", content: "B", type: "manual" });

      const snaps = await service.getSnapshots();
      expect(snaps.length).toBe(2);
      expect(snaps[0].timestamp).toBeGreaterThanOrEqual(snaps[1].timestamp);
    });

    it("filters snapshots by source path", async () => {
      await service.createSnapshot({ sourcePath: "a.mdi", content: "A", type: "manual" });
      await service.createSnapshot({ sourcePath: "b.mdi", content: "B", type: "manual" });
      await service.createSnapshot({ sourcePath: "a.mdi", content: "A2", type: "manual" });

      const aSnaps = await service.getSnapshots("a.mdi");
      expect(aSnaps.length).toBe(2);
      expect(aSnaps.every((s) => s.sourcePath === "a.mdi")).toBe(true);

      const bSnaps = await service.getSnapshots("b.mdi");
      expect(bSnaps.length).toBe(1);
    });

    it("returns empty array for a non-existent source path", async () => {
      await service.createSnapshot({ sourcePath: "a.mdi", content: "A", type: "manual" });
      expect(await service.getSnapshots("missing.mdi")).toEqual([]);
    });

    it("backfills type from filename for legacy entries", async () => {
      const legacyIndex: HistoryIndex = {
        snapshots: [
          {
            id: "legacy-1",
            timestamp: Date.now(),
            filename: "main.mdi.[202604010101].__auto__.history",
            sourcePath: "main.mdi",
            displayName: "",
            type: undefined as unknown as "auto",
            characterCount: 4,
            fileSize: 4,
            checksum: "abcd",
          },
        ],
        maxSnapshots: 100,
        retentionDays: 90,
      };
      fileStore.set(".illusions/history/index.json", JSON.stringify(legacyIndex));

      const snaps = await service.getSnapshots();
      expect(snaps[0].type).toBe("auto");
    });

    it("reads legacy entries that only stored sourceFile", async () => {
      const legacyIndex: HistoryIndex = {
        snapshots: [
          {
            id: "legacy-sf",
            timestamp: Date.now(),
            filename: "main.mdi.[202604010101].__auto__.history",
            sourcePath: "",
            displayName: "",
            sourceFile: "main.mdi",
            type: "auto",
            characterCount: 4,
            fileSize: 4,
            checksum: "abcd",
          } as SnapshotEntry,
        ],
        maxSnapshots: 100,
        retentionDays: 90,
      };
      fileStore.set(".illusions/history/index.json", JSON.stringify(legacyIndex));

      const snaps = await service.getSnapshots("main.mdi");
      expect(snaps).toHaveLength(1);
      expect(snaps[0].sourcePath).toBe("main.mdi");
    });
  });

  // -----------------------------------------------------------------------
  // restoreSnapshot
  // -----------------------------------------------------------------------

  describe("restoreSnapshot", () => {
    it("restores snapshot content and returns success: true", async () => {
      const content = "Content to restore";
      const entry = await service.createSnapshot({
        sourcePath: "main.mdi",
        content,
        type: "manual",
      });

      const result = await service.restoreSnapshot(entry!.id);

      expect(result.success).toBe(true);
      expect(result.content).toBe(content);
      expect(result.error).toBeUndefined();
    });

    it("returns success: false for a non-existent snapshot ID", async () => {
      const result = await service.restoreSnapshot("non-existent-id");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Snapshot not found");
    });

    it("detects corrupted snapshots via checksum mismatch", async () => {
      const entry = await service.createSnapshot({
        sourcePath: "main.mdi",
        content: "Original",
        type: "manual",
      });

      // Tamper with the stored file
      const key = Array.from(fileStore.keys()).find((k) => k.includes(entry!.filename));
      if (key) fileStore.set(key, "Tampered content!!!");

      const result = await service.restoreSnapshot(entry!.id);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Checksum mismatch");
    });
  });

  // -----------------------------------------------------------------------
  // getSnapshotContent
  // -----------------------------------------------------------------------

  describe("getSnapshotContent", () => {
    it("returns content for a valid snapshot", async () => {
      const entry = await service.createSnapshot({
        sourcePath: "main.mdi",
        content: "Peek content",
        type: "manual",
      });
      expect(await service.getSnapshotContent(entry!.id)).toBe("Peek content");
    });

    it("returns null for a non-existent snapshot", async () => {
      expect(await service.getSnapshotContent("nope")).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // deleteSnapshot
  // -----------------------------------------------------------------------

  describe("deleteSnapshot", () => {
    it("removes the snapshot from the index", async () => {
      const entry = await service.createSnapshot({
        sourcePath: "main.mdi",
        content: "To delete",
        type: "manual",
      });
      await service.deleteSnapshot(entry!.id);
      expect((await service.getSnapshots()).find((s) => s.id === entry!.id)).toBeUndefined();
    });

    it("throws for a non-existent snapshot ID", async () => {
      await expect(service.deleteSnapshot("bad-id")).rejects.toThrow("Snapshot not found");
    });

    it("allows deleting milestone snapshots", async () => {
      const entry = await service.createSnapshot({
        sourcePath: "main.mdi",
        content: "Milestone",
        type: "milestone",
        label: "v1",
      });
      await service.deleteSnapshot(entry!.id);
      expect(await service.getSnapshots()).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // shouldCreateSnapshot
  // -----------------------------------------------------------------------

  describe("shouldCreateSnapshot", () => {
    it("returns true when no previous snapshots exist", async () => {
      expect(await service.shouldCreateSnapshot("main.mdi")).toBe(true);
    });

    it("returns false immediately after creating an auto snapshot (throttle)", async () => {
      await service.createSnapshot({ sourcePath: "main.mdi", content: "v1" });
      expect(await service.shouldCreateSnapshot("main.mdi")).toBe(false);
    });

    it("returns true for a different source file", async () => {
      await service.createSnapshot({ sourcePath: "a.mdi", content: "A" });
      expect(await service.shouldCreateSnapshot("b.mdi")).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Bookmarks
  // -----------------------------------------------------------------------

  describe("getBookmarks / toggleBookmark", () => {
    it("returns empty Set when no bookmarks exist", async () => {
      expect((await service.getBookmarks()).size).toBe(0);
    });

    it("toggleBookmark adds a bookmark", async () => {
      const entry = await service.createSnapshot({
        sourcePath: "main.mdi",
        content: "bm test",
        type: "manual",
      });
      const result = await service.toggleBookmark(entry!.id);
      expect(result).toBe(true);
      const bm = await service.getBookmarks();
      expect(bm.has(entry!.id)).toBe(true);
    });

    it("toggleBookmark removes a bookmark on second call", async () => {
      const entry = await service.createSnapshot({
        sourcePath: "main.mdi",
        content: "bm test",
        type: "manual",
      });
      await service.toggleBookmark(entry!.id); // add
      const result = await service.toggleBookmark(entry!.id); // remove
      expect(result).toBe(false);
      expect((await service.getBookmarks()).has(entry!.id)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // pruneOldSnapshots
  // -----------------------------------------------------------------------

  describe("pruneOldSnapshots", () => {
    it("does not prune milestone snapshots", async () => {
      const milestone = await service.createSnapshot({
        sourcePath: "main.mdi",
        content: "milestone",
        type: "milestone",
        label: "Keep me",
      });
      for (let i = 0; i < 3; i++) {
        await service.createSnapshot({
          sourcePath: "main.mdi",
          content: `auto ${i}`,
          type: "manual",
        });
      }

      await service.pruneOldSnapshots();

      const snaps = await service.getSnapshots();
      expect(snaps.some((s) => s.id === milestone!.id)).toBe(true);
    });

    it("keeps snapshots within the default limit", async () => {
      for (let i = 0; i < 5; i++) {
        await service.createSnapshot({
          sourcePath: "main.mdi",
          content: `snap ${i}`,
          type: "manual",
        });
      }
      await service.pruneOldSnapshots();
      expect((await service.getSnapshots()).length).toBe(5);
    });
  });

  // -----------------------------------------------------------------------
  // Singleton factory
  // -----------------------------------------------------------------------

  describe("getHistoryService / resetHistoryService", () => {
    it("returns the same singleton on repeated calls", () => {
      resetHistoryService();
      expect(getHistoryService()).toBe(getHistoryService());
    });

    it("returns a new instance after resetHistoryService", () => {
      resetHistoryService();
      const a = getHistoryService();
      resetHistoryService();
      const b = getHistoryService();
      expect(a).not.toBe(b);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe("edge cases", () => {
    it("handles snapshots for multiple source paths independently", async () => {
      for (const p of ["a.mdi", "b.mdi", "c.mdi"]) {
        await service.createSnapshot({ sourcePath: p, content: p, type: "manual" });
      }
      const all = await service.getSnapshots();
      expect(all.length).toBe(3);
      const sources = new Set(all.map((s) => s.sourcePath));
      expect(sources.size).toBe(3);
    });

    it("generates unique IDs for each snapshot", async () => {
      const entries: Array<SnapshotEntry | null> = [];
      for (let i = 0; i < 5; i++) {
        entries.push(
          await service.createSnapshot({
            sourcePath: "main.mdi",
            content: `v${i}`,
            type: "manual",
          }),
        );
      }
      const ids = new Set(entries.filter(Boolean).map((e) => e!.id));
      expect(ids.size).toBe(5);
    });

    it("different content produces different checksums", async () => {
      const a = await service.createSnapshot({
        sourcePath: "main.mdi",
        content: "AAA",
        type: "manual",
      });
      const b = await service.createSnapshot({
        sourcePath: "main.mdi",
        content: "BBB",
        type: "manual",
      });
      expect(a!.checksum).not.toBe(b!.checksum);
    });

    it("identical content produces the same checksum", async () => {
      const a = await service.createSnapshot({
        sourcePath: "a.mdi",
        content: "same",
        type: "manual",
      });
      const b = await service.createSnapshot({
        sourcePath: "b.mdi",
        content: "same",
        type: "manual",
      });
      expect(a!.checksum).toBe(b!.checksum);
    });

    it("sets timestamp within the current call window", async () => {
      const before = Date.now();
      const entry = await service.createSnapshot({
        sourcePath: "main.mdi",
        content: "ts",
        type: "manual",
      });
      const after = Date.now();
      expect(entry!.timestamp).toBeGreaterThanOrEqual(before);
      expect(entry!.timestamp).toBeLessThanOrEqual(after);
    });

    it("calculates correct byte size for CJK characters", async () => {
      const entry = await service.createSnapshot({
        sourcePath: "cjk.mdi",
        content: "漢字", // 2 chars × 3 bytes = 6
        type: "manual",
      });
      expect(entry!.characterCount).toBe(2);
      expect(entry!.fileSize).toBe(6);
    });

    it("keeps histories separate for duplicate basenames in different paths", async () => {
      await service.createSnapshot({
        sourcePath: "chapters/intro.mdi",
        displayName: "intro.mdi",
        content: "chapter",
        type: "manual",
      });
      await service.createSnapshot({
        sourcePath: "notes/intro.mdi",
        displayName: "intro.mdi",
        content: "notes",
        type: "manual",
      });

      const ch = await service.getSnapshots("chapters/intro.mdi");
      const no = await service.getSnapshots("notes/intro.mdi");
      expect(ch).toHaveLength(1);
      expect(no).toHaveLength(1);
      expect(ch[0].sourcePath).toBe("chapters/intro.mdi");
      expect(no[0].sourcePath).toBe("notes/intro.mdi");
    });
  });
});
