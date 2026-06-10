/**
 * Tests for PersistedJsonListStore and byte-compatibility of the migrated
 * services (user dictionary / ignored corrections).
 *
 * Covers:
 * - Exact serialized output (byte-compat): project mode pretty JSON with
 *   version-first envelope, standalone mode compact JSON
 * - Standalone storage key prefixes unchanged
 * - Mutation semantics: null from the mutation callback skips the save
 * - Mutex: concurrent mutations are serialized (no lost updates)
 * - isFileNotFoundError helper
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IgnoredCorrection, UserDictionaryEntry } from "@/lib/project/project-types";

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
// Import SUT after mocks
// ---------------------------------------------------------------------------

import { PersistedJsonListStore, isFileNotFoundError } from "@/lib/services/persisted-json-list";
import { getIgnoredCorrectionsService } from "@/lib/services/ignored-corrections-service";
import { getUserDictionaryService } from "@/lib/services/user-dictionary-service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupVFSWritable(): void {
  mockFileExists.mockResolvedValue(true);
  mockGetFileHandle.mockResolvedValue(mockFileHandle as unknown as typeof mockFileHandle);
  mockGetIllusionsDirHandle.mockResolvedValue({ getFileHandle: mockGetFileHandle });
  mockVFS.getDirectoryHandle.mockResolvedValue(mockRootHandle as unknown as typeof mockRootHandle);
}

function resetMocks(): void {
  vi.clearAllMocks();
  mockStorageItems = {};
  mockFileRead = vi.fn();
  mockFileWrite = vi.fn<(content: string) => Promise<void>>().mockResolvedValue(undefined);
  mockFileExists = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
  mockGetFileHandle = vi.fn();
  mockGetIllusionsDirHandle = vi.fn();
}

// ---------------------------------------------------------------------------
// Byte-compatibility: serialized formats must not change across the refactor
// ---------------------------------------------------------------------------

describe("PersistedJsonListStore — byte-compatible serialization", () => {
  beforeEach(resetMocks);

  it("user dictionary project file matches the legacy envelope byte-for-byte", async () => {
    setupVFSWritable();
    const entry: UserDictionaryEntry = { id: "e1", word: "良い", reading: "よい" };

    await getUserDictionaryService().saveEntries([entry]);

    expect(mockFileWrite).toHaveBeenCalledOnce();
    const written = mockFileWrite.mock.calls[0][0];
    // Legacy format: { version, entries } pretty-printed with 2 spaces, version first.
    expect(written).toBe(JSON.stringify({ version: "1.0.0", entries: [entry] }, null, 2));
  });

  it("user dictionary standalone value matches the legacy compact envelope byte-for-byte", async () => {
    const entry: UserDictionaryEntry = { id: "e1", word: "良い", reading: "よい" };

    await getUserDictionaryService().saveEntriesStandalone("/Users/x/novel.mdi", [entry]);

    expect(mockStorage.setItem).toHaveBeenCalledWith(
      "illusions-user-dictionary:Users/x/novel.mdi",
      JSON.stringify({ version: "1.0.0", entries: [entry] }),
    );
  });

  it("ignored corrections project file matches the legacy envelope byte-for-byte", async () => {
    setupVFSWritable();
    const correction: IgnoredCorrection = { ruleId: "r1", text: "テスト", addedAt: 1234 };

    await getIgnoredCorrectionsService().saveIgnoredCorrections([correction]);

    expect(mockFileWrite).toHaveBeenCalledOnce();
    const written = mockFileWrite.mock.calls[0][0];
    // Legacy format: { version, ignoredCorrections } pretty-printed, version first.
    expect(written).toBe(
      JSON.stringify({ version: "1.0.0", ignoredCorrections: [correction] }, null, 2),
    );
  });

  it("ignored corrections standalone value matches the legacy compact envelope byte-for-byte", async () => {
    const correction: IgnoredCorrection = { ruleId: "r1", text: "テスト", addedAt: 1234 };

    await getIgnoredCorrectionsService().saveIgnoredCorrectionsStandalone("/Users/x/novel.mdi", [
      correction,
    ]);

    expect(mockStorage.setItem).toHaveBeenCalledWith(
      "illusions-ignored-corrections:Users/x/novel.mdi",
      JSON.stringify({ version: "1.0.0", ignoredCorrections: [correction] }),
    );
  });

  it("writes to the legacy filenames under .illusions", async () => {
    setupVFSWritable();

    await getUserDictionaryService().saveEntries([]);
    await getIgnoredCorrectionsService().saveIgnoredCorrections([]);

    expect(mockGetIllusionsDirHandle).toHaveBeenCalledWith(".illusions", { create: true });
    const filenames = mockGetFileHandle.mock.calls.map((c) => c[0]);
    expect(filenames).toContain("user-dictionary.json");
    expect(filenames).toContain("ignored-corrections.json");
  });
});

// ---------------------------------------------------------------------------
// Store behavior
// ---------------------------------------------------------------------------

interface TestItem {
  key: string;
  value: number;
}

interface TestEnvelope {
  version: "1.0.0";
  items: TestItem[];
}

function makeStore(): PersistedJsonListStore<TestItem> {
  return new PersistedJsonListStore<TestItem>({
    filename: "test-items.json",
    standaloneKeyPrefix: "illusions-test-items:",
    toEnvelope: (items): TestEnvelope => ({ version: "1.0.0", items }),
    fromEnvelope: (envelope): TestItem[] => (envelope as TestEnvelope).items ?? [],
  });
}

describe("PersistedJsonListStore — mutation semantics", () => {
  beforeEach(resetMocks);

  it("mutateStandalone skips the save when the mutation returns null", async () => {
    const store = makeStore();
    mockStorageItems["illusions-test-items:f.mdi"] = JSON.stringify({
      version: "1.0.0",
      items: [{ key: "a", value: 1 }],
    });

    const result = await store.mutateStandalone("/f.mdi", () => null);

    expect(result).toEqual([{ key: "a", value: 1 }]);
    expect(mockStorage.setItem).not.toHaveBeenCalled();
  });

  it("mutateStandalone persists the list returned by the mutation", async () => {
    const store = makeStore();

    const result = await store.mutateStandalone("/f.mdi", (items) => {
      items.push({ key: "b", value: 2 });
      return items;
    });

    expect(result).toEqual([{ key: "b", value: 2 }]);
    expect(mockStorageItems["illusions-test-items:f.mdi"]).toBe(
      JSON.stringify({ version: "1.0.0", items: [{ key: "b", value: 2 }] }),
    );
  });

  it("serializes concurrent mutations so no update is lost", async () => {
    const store = makeStore();

    await Promise.all([
      store.mutateStandalone("/f.mdi", (items) => [...items, { key: "one", value: 1 }]),
      store.mutateStandalone("/f.mdi", (items) => [...items, { key: "two", value: 2 }]),
    ]);

    const stored = JSON.parse(mockStorageItems["illusions-test-items:f.mdi"]) as TestEnvelope;
    expect(stored.items.map((i) => i.key).sort()).toEqual(["one", "two"]);
  });

  it("loadStandalone returns empty array for a missing key and parses stored envelopes", async () => {
    const store = makeStore();
    expect(await store.loadStandalone("/missing.mdi")).toEqual([]);

    mockStorageItems["illusions-test-items:f.mdi"] = JSON.stringify({
      version: "1.0.0",
      items: [{ key: "a", value: 1 }],
    });
    expect(await store.loadStandalone("/f.mdi")).toEqual([{ key: "a", value: 1 }]);
  });

  it("loadProject returns empty array when exists() is false (Electron missing file)", async () => {
    setupVFSWritable();
    mockFileExists.mockResolvedValue(false);
    const store = makeStore();

    expect(await store.loadProject()).toEqual([]);
    expect(mockFileRead).not.toHaveBeenCalled();
  });

  it("loadProject returns empty array when getFileHandle rejects with NotFoundError (web)", async () => {
    mockGetFileHandle.mockRejectedValue(
      Object.assign(new Error("file not found"), { name: "NotFoundError" }),
    );
    mockGetIllusionsDirHandle.mockResolvedValue({ getFileHandle: mockGetFileHandle });
    mockVFS.getDirectoryHandle.mockResolvedValue(
      mockRootHandle as unknown as typeof mockRootHandle,
    );
    const store = makeStore();

    expect(await store.loadProject()).toEqual([]);
  });

  it("loadProject re-throws on JSON corruption", async () => {
    setupVFSWritable();
    mockFileRead.mockResolvedValue("{ broken json %%%");
    const store = makeStore();

    await expect(store.loadProject()).rejects.toThrow();
  });
});

describe("isFileNotFoundError", () => {
  it("detects NotFoundError name and ENOENT code, rejects others", () => {
    expect(isFileNotFoundError(Object.assign(new Error("x"), { name: "NotFoundError" }))).toBe(
      true,
    );
    expect(isFileNotFoundError(Object.assign(new Error("x"), { code: "ENOENT" }))).toBe(true);
    expect(isFileNotFoundError(new Error("permission denied"))).toBe(false);
    expect(isFileNotFoundError(null)).toBe(false);
    expect(isFileNotFoundError("ENOENT")).toBe(false);
  });
});
