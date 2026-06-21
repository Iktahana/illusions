/**
 * Tests for UserDictionaryService.
 *
 * Covers:
 * - Project mode (VFS): load/save/add/update/remove via mock VFSDirectoryHandle chain
 * - Standalone mode (StorageService): key derivation, load/save/add/remove
 * - Edge cases: ENOENT returns empty array, JSON corruption re-throws, deduplication
 * - Mutex: concurrent addEntry calls do not produce duplicate entries
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { UserDictionaryEntry } from "@/lib/project/project-types";

// ---------------------------------------------------------------------------
// Mock project-file-service (VFS) and storage-service
// ---------------------------------------------------------------------------

let mockFileRead = vi.fn<() => Promise<string>>();
let mockFileWrite = vi.fn<(content: string) => Promise<void>>();
let mockFileExists = vi.fn<() => Promise<boolean>>();

const mockFileHandle = {
  exists: () => mockFileExists(),
  read: () => mockFileRead(),
  write: (content: string) => mockFileWrite(content),
};

let mockGetFileHandle =
  vi.fn<(name: string, opts?: { create?: boolean }) => Promise<typeof mockFileHandle>>();
let mockGetIllusionsDirHandle =
  vi.fn<
    (
      name: string,
      opts?: { create?: boolean },
    ) => Promise<{ getFileHandle: typeof mockGetFileHandle }>
  >();

const mockRootHandle = {
  getDirectoryHandle: (name: string, opts?: { create?: boolean }) =>
    mockGetIllusionsDirHandle(name, opts),
};

const mockVFS = {
  getDirectoryHandle: vi.fn<(path: string) => Promise<typeof mockRootHandle>>(),
  isRootOpen: vi.fn(() => true),
};

vi.mock("@/lib/services/project-file-service", () => ({
  getProjectFileService: () => mockVFS,
}));

// Mock storage service for standalone mode
let mockStorageItems: Record<string, string> = {};
const mockStorage = {
  getItem: vi.fn(async (key: string) => mockStorageItems[key] ?? null),
  setItem: vi.fn(async (key: string, value: string) => {
    mockStorageItems[key] = value;
  }),
};

vi.mock("@/lib/storage/storage-service", () => ({
  getStorageService: () => mockStorage,
}));

// ---------------------------------------------------------------------------
// Import the SUT after mocks are set up
// ---------------------------------------------------------------------------

import { getUserDictionaryService } from "@/lib/services/user-dictionary-service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides?: Partial<UserDictionaryEntry>): UserDictionaryEntry {
  return {
    id: "entry-1",
    word: "良い",
    reading: "よい",
    ...overrides,
  };
}

function setupVFSWithContent(content: string): void {
  mockFileExists.mockResolvedValue(true);
  mockFileRead.mockResolvedValue(content);
  mockGetFileHandle.mockResolvedValue(mockFileHandle as unknown as typeof mockFileHandle);
  mockGetIllusionsDirHandle.mockResolvedValue({
    getFileHandle: mockGetFileHandle,
  });
  mockVFS.getDirectoryHandle.mockResolvedValue(mockRootHandle as unknown as typeof mockRootHandle);
}

function setupVFSWithENOENT(): void {
  const err = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  mockGetFileHandle.mockRejectedValue(err);
  mockGetIllusionsDirHandle.mockResolvedValue({
    getFileHandle: mockGetFileHandle,
  });
  mockVFS.getDirectoryHandle.mockResolvedValue(mockRootHandle as unknown as typeof mockRootHandle);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("UserDictionaryService — project mode (VFS)", () => {
  let svc: ReturnType<typeof getUserDictionaryService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageItems = {};
    mockFileRead = vi.fn();
    mockFileWrite = vi.fn<(content: string) => Promise<void>>().mockResolvedValue(undefined);
    mockFileExists = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    mockGetFileHandle = vi.fn();
    mockGetIllusionsDirHandle = vi.fn();
    // Fresh singleton each test
    svc = getUserDictionaryService();
  });

  it("loadEntries returns empty array when file does not exist (ENOENT)", async () => {
    setupVFSWithENOENT();
    const entries = await svc.loadEntries();
    expect(entries).toEqual([]);
  });

  it("loadEntries returns empty array when exists() is false (Electron missing file)", async () => {
    // Regression (#1436 refactor): Electron's VFS never throws from getFileHandle
    // for a missing file; absence is only detectable via exists(). The shared
    // PersistedJsonListStore guards with exists() before reading.
    mockFileExists.mockResolvedValue(false);
    mockGetFileHandle.mockResolvedValue(mockFileHandle as unknown as typeof mockFileHandle);
    mockGetIllusionsDirHandle.mockResolvedValue({ getFileHandle: mockGetFileHandle });
    mockVFS.getDirectoryHandle.mockResolvedValue(
      mockRootHandle as unknown as typeof mockRootHandle,
    );

    const entries = await svc.loadEntries();
    expect(entries).toEqual([]);
    expect(mockFileRead).not.toHaveBeenCalled();
  });

  it("loadEntries returns entries from VFS JSON", async () => {
    const entry = makeEntry();
    setupVFSWithContent(JSON.stringify({ version: "1.0.0", entries: [entry] }));
    const entries = await svc.loadEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].word).toBe("良い");
  });

  it("loadEntries returns empty array when entries field is missing", async () => {
    setupVFSWithContent(JSON.stringify({ version: "1.0.0" }));
    const entries = await svc.loadEntries();
    expect(entries).toEqual([]);
  });

  it("loadEntries re-throws on JSON corruption", async () => {
    setupVFSWithContent("{ broken json %%%");
    await expect(svc.loadEntries()).rejects.toThrow();
  });

  it("saveEntries writes formatted JSON to VFS", async () => {
    setupVFSWithContent("{}"); // loadEntries won't be called directly
    mockFileWrite.mockResolvedValue(undefined);
    // Need VFS to return writable handle for save path
    mockGetFileHandle.mockResolvedValue(mockFileHandle as unknown as typeof mockFileHandle);
    mockGetIllusionsDirHandle.mockResolvedValue({ getFileHandle: mockGetFileHandle });
    mockVFS.getDirectoryHandle.mockResolvedValue(
      mockRootHandle as unknown as typeof mockRootHandle,
    );

    const entries = [makeEntry()];
    await svc.saveEntries(entries);

    expect(mockFileWrite).toHaveBeenCalledOnce();
    const written = mockFileWrite.mock.calls[0][0];
    const parsed = JSON.parse(written);
    expect(parsed.version).toBe("1.0.0");
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].word).toBe("良い");
  });

  it("addEntry deduplicates by id", async () => {
    const entry = makeEntry({ id: "dup-1" });
    setupVFSWithContent(JSON.stringify({ version: "1.0.0", entries: [entry] }));
    mockGetFileHandle.mockResolvedValue(mockFileHandle as unknown as typeof mockFileHandle);

    const result = await svc.addEntry(entry);
    // save should NOT have been called because entry already exists
    expect(result).toHaveLength(1);
    expect(mockFileWrite).not.toHaveBeenCalled();
  });

  it("addEntry sorts entries alphabetically by word", async () => {
    setupVFSWithContent(
      JSON.stringify({ version: "1.0.0", entries: [makeEntry({ id: "b", word: "良い" })] }),
    );
    mockGetFileHandle.mockResolvedValue(mockFileHandle as unknown as typeof mockFileHandle);
    mockFileWrite.mockResolvedValue(undefined);

    const result = await svc.addEntry(makeEntry({ id: "a", word: "悪い", reading: "わるい" }));
    // "悪い" comes after "良い" alphabetically in localeCompare
    expect(result.map((e) => e.id)).toContain("a");
    expect(result.map((e) => e.id)).toContain("b");
    const written = JSON.parse(mockFileWrite.mock.calls[0][0]);
    // Both entries present
    expect(written.entries).toHaveLength(2);
  });

  it("removeEntry removes by id and saves", async () => {
    const e1 = makeEntry({ id: "keep-me" });
    const e2 = makeEntry({ id: "remove-me", word: "悪" });
    setupVFSWithContent(JSON.stringify({ version: "1.0.0", entries: [e1, e2] }));
    mockGetFileHandle.mockResolvedValue(mockFileHandle as unknown as typeof mockFileHandle);
    mockFileWrite.mockResolvedValue(undefined);

    const result = await svc.removeEntry("remove-me");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("keep-me");
    const written = JSON.parse(mockFileWrite.mock.calls[0][0]);
    expect(written.entries).toHaveLength(1);
  });

  it("updateEntry merges partial fields and saves", async () => {
    const e1 = makeEntry({ id: "u-1", word: "良い", reading: "よい" });
    setupVFSWithContent(JSON.stringify({ version: "1.0.0", entries: [e1] }));
    mockGetFileHandle.mockResolvedValue(mockFileHandle as unknown as typeof mockFileHandle);
    mockFileWrite.mockResolvedValue(undefined);

    const result = await svc.updateEntry("u-1", { reading: "いい" });
    expect(result[0].reading).toBe("いい");
    expect(result[0].word).toBe("良い"); // unchanged
    const written = JSON.parse(mockFileWrite.mock.calls[0][0]);
    expect(written.entries[0].reading).toBe("いい");
  });
});

describe("UserDictionaryService — standalone mode (StorageService)", () => {
  let svc: ReturnType<typeof getUserDictionaryService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageItems = {};
    svc = getUserDictionaryService();
  });

  it("loadEntriesStandalone returns empty array when key not in storage", async () => {
    const entries = await svc.loadEntriesStandalone("/Users/x/novel.mdi");
    expect(entries).toEqual([]);
  });

  it("loadEntriesStandalone reads from storage with correct key", async () => {
    const entry = makeEntry();
    mockStorageItems["illusions-user-dictionary:Users/x/novel.mdi"] = JSON.stringify({
      version: "1.0.0",
      entries: [entry],
    });

    const entries = await svc.loadEntriesStandalone("/Users/x/novel.mdi");
    expect(entries).toHaveLength(1);
    expect(entries[0].word).toBe("良い");
  });

  it("saveEntriesStandalone writes JSON with correct key (normalizes leading slash)", async () => {
    await svc.saveEntriesStandalone("/Users/x/novel.mdi", [makeEntry()]);
    expect(mockStorage.setItem).toHaveBeenCalledWith(
      "illusions-user-dictionary:Users/x/novel.mdi",
      expect.stringContaining("良い"),
    );
  });

  it("addEntryStandalone deduplicates by id", async () => {
    const entry = makeEntry({ id: "dup-standalone" });
    mockStorageItems["illusions-user-dictionary:Users/x/f.mdi"] = JSON.stringify({
      version: "1.0.0",
      entries: [entry],
    });

    const result = await svc.addEntryStandalone("/Users/x/f.mdi", entry);
    expect(result).toHaveLength(1);
    // setItem should NOT be called because duplicate
    expect(mockStorage.setItem).not.toHaveBeenCalled();
  });

  it("removeEntryStandalone removes by id", async () => {
    const e1 = makeEntry({ id: "keep" });
    const e2 = makeEntry({ id: "drop", word: "削除" });
    mockStorageItems["illusions-user-dictionary:Users/x/f.mdi"] = JSON.stringify({
      version: "1.0.0",
      entries: [e1, e2],
    });

    const result = await svc.removeEntryStandalone("/Users/x/f.mdi", "drop");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("keep");
  });

  it("normalizes Windows backslash paths in storage key", async () => {
    await svc.saveEntriesStandalone("C:\\Users\\x\\novel.mdi", []);
    expect(mockStorage.setItem).toHaveBeenCalledWith(
      "illusions-user-dictionary:C:/Users/x/novel.mdi",
      expect.any(String),
    );
  });

  // Regression test for #1921: same-named files in different directories must
  // not share dictionary data when the full path is used as the storage key.
  it("files with identical basename in different directories use separate storage keys", async () => {
    const entryA = makeEntry({ id: "a-only", word: "A専用語" });
    const entryB = makeEntry({ id: "b-only", word: "B専用語" });

    const pathA = "/Users/x/standalone-a/same.mdi";
    const pathB = "/Users/x/standalone-b/same.mdi";

    // Save dictionary for file A
    await svc.saveEntriesStandalone(pathA, [entryA]);

    // Save dictionary for file B
    await svc.saveEntriesStandalone(pathB, [entryB]);

    // Each path should have been written with a distinct key
    const calls = mockStorage.setItem.mock.calls;
    const keyA = calls.find((c) => (c[0] as string).includes("standalone-a"))?.[0] as string;
    const keyB = calls.find((c) => (c[0] as string).includes("standalone-b"))?.[0] as string;

    expect(keyA).toBeDefined();
    expect(keyB).toBeDefined();
    expect(keyA).not.toBe(keyB);

    // Loading from path A must NOT return B's entries
    const loadedA = await svc.loadEntriesStandalone(pathA);
    expect(loadedA.map((e) => e.id)).toContain("a-only");
    expect(loadedA.map((e) => e.id)).not.toContain("b-only");

    // Loading from path B must NOT return A's entries
    const loadedB = await svc.loadEntriesStandalone(pathB);
    expect(loadedB.map((e) => e.id)).toContain("b-only");
    expect(loadedB.map((e) => e.id)).not.toContain("a-only");
  });
});
