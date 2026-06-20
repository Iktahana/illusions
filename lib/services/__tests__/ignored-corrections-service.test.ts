/**
 * Tests for IgnoredCorrectionsService.
 *
 * Covers:
 * - Project mode (VFS): load/save/add/remove via mock VFSDirectoryHandle chain
 * - Standalone mode (StorageService): key derivation, load/save/add/remove
 * - Edge cases: ENOENT returns empty array, deduplication by (ruleId, text, context)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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
  removeItem: vi.fn(async (key: string) => {
    delete mockStorageItems[key];
  }),
  getKeysByPrefix: vi.fn(async (prefix: string) =>
    Object.keys(mockStorageItems).filter((k) => k.startsWith(prefix)),
  ),
};

vi.mock("@/lib/storage/storage-service", () => ({
  getStorageService: () => mockStorage,
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks
// ---------------------------------------------------------------------------

import { getIgnoredCorrectionsService } from "@/lib/services/ignored-corrections-service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupVFSWithContent(content: string): void {
  mockFileExists.mockResolvedValue(true);
  mockFileRead.mockResolvedValue(content);
  mockGetFileHandle.mockResolvedValue(mockFileHandle as unknown as typeof mockFileHandle);
  mockGetIllusionsDirHandle.mockResolvedValue({ getFileHandle: mockGetFileHandle });
  mockVFS.getDirectoryHandle.mockResolvedValue(mockRootHandle as unknown as typeof mockRootHandle);
}

function setupVFSWithENOENT(): void {
  // Electron path: getFileHandle resolves a path wrapper and a missing file is
  // signalled by exists() === false, not a thrown ENOENT.
  mockFileExists.mockResolvedValue(false);
  mockGetFileHandle.mockResolvedValue(mockFileHandle as unknown as typeof mockFileHandle);
  mockGetIllusionsDirHandle.mockResolvedValue({ getFileHandle: mockGetFileHandle });
  mockVFS.getDirectoryHandle.mockResolvedValue(mockRootHandle as unknown as typeof mockRootHandle);
}

/**
 * Web (File System Access API) path: getFileHandle itself rejects when the file
 * is absent, before exists() can be consulted. `error` defaults to a DOMException
 * named "NotFoundError" — the real shape thrown by the native FSAA API.
 */
function setupVFSWithGetFileHandleReject(error?: unknown): void {
  const rejection = error ?? Object.assign(new Error("file not found"), { name: "NotFoundError" });
  mockGetFileHandle.mockRejectedValue(rejection);
  mockGetIllusionsDirHandle.mockResolvedValue({ getFileHandle: mockGetFileHandle });
  mockVFS.getDirectoryHandle.mockResolvedValue(mockRootHandle as unknown as typeof mockRootHandle);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("IgnoredCorrectionsService — project mode (VFS)", () => {
  let svc: ReturnType<typeof getIgnoredCorrectionsService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageItems = {};
    mockFileRead = vi.fn();
    mockFileWrite = vi.fn<(content: string) => Promise<void>>().mockResolvedValue(undefined);
    mockFileExists = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    mockGetFileHandle = vi.fn();
    mockGetIllusionsDirHandle = vi.fn();
    svc = getIgnoredCorrectionsService();
  });

  it("loadIgnoredCorrections returns empty array when file does not exist (ENOENT)", async () => {
    setupVFSWithENOENT();
    const result = await svc.loadIgnoredCorrections();
    expect(result).toEqual([]);
  });

  it("loadIgnoredCorrections returns empty array when getFileHandle throws NotFoundError (web)", async () => {
    // Regression: on the web (FSAA) backend, getFileHandle rejects with a
    // NotFoundError for a missing file before exists() can run. Must not throw.
    setupVFSWithGetFileHandleReject();
    const result = await svc.loadIgnoredCorrections();
    expect(result).toEqual([]);
  });

  it("loadIgnoredCorrections returns empty array when getFileHandle throws ENOENT", async () => {
    setupVFSWithGetFileHandleReject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    const result = await svc.loadIgnoredCorrections();
    expect(result).toEqual([]);
  });

  it("loadIgnoredCorrections re-throws non-not-found errors from getFileHandle (e.g. permission)", async () => {
    setupVFSWithGetFileHandleReject(
      Object.assign(new Error("permission denied"), { name: "NotAllowedError" }),
    );
    await expect(svc.loadIgnoredCorrections()).rejects.toThrow("permission denied");
  });

  it("loadIgnoredCorrections parses and returns corrections from VFS", async () => {
    const correction = { ruleId: "r1", text: "foo", addedAt: 1000 };
    setupVFSWithContent(JSON.stringify({ version: "1.0.0", ignoredCorrections: [correction] }));
    const result = await svc.loadIgnoredCorrections();
    expect(result).toHaveLength(1);
    expect(result[0].ruleId).toBe("r1");
  });

  it("loadIgnoredCorrections returns empty array when ignoredCorrections field is absent", async () => {
    setupVFSWithContent(JSON.stringify({ version: "1.0.0" }));
    const result = await svc.loadIgnoredCorrections();
    expect(result).toEqual([]);
  });

  it("loadIgnoredCorrections re-throws on JSON corruption", async () => {
    setupVFSWithContent("NOT JSON {{{{");
    await expect(svc.loadIgnoredCorrections()).rejects.toThrow();
  });

  it("saveIgnoredCorrections writes formatted JSON to VFS file handle", async () => {
    mockGetFileHandle.mockResolvedValue(mockFileHandle as unknown as typeof mockFileHandle);
    mockGetIllusionsDirHandle.mockResolvedValue({ getFileHandle: mockGetFileHandle });
    mockVFS.getDirectoryHandle.mockResolvedValue(
      mockRootHandle as unknown as typeof mockRootHandle,
    );
    mockFileWrite.mockResolvedValue(undefined);

    const corrections = [{ ruleId: "typo", text: "テスト", addedAt: 2000 }];
    await svc.saveIgnoredCorrections(corrections);

    expect(mockFileWrite).toHaveBeenCalledOnce();
    const written = JSON.parse(mockFileWrite.mock.calls[0][0]);
    expect(written.version).toBe("1.0.0");
    expect(written.ignoredCorrections[0].ruleId).toBe("typo");
  });

  it("addIgnoredCorrection deduplicates by (ruleId, text, context)", async () => {
    const existing = { ruleId: "dup-rule", text: "dup-text", addedAt: 1000 };
    setupVFSWithContent(JSON.stringify({ version: "1.0.0", ignoredCorrections: [existing] }));
    mockGetFileHandle.mockResolvedValue(mockFileHandle as unknown as typeof mockFileHandle);

    const result = await svc.addIgnoredCorrection("dup-rule", "dup-text");
    // No save — duplicate
    expect(result).toHaveLength(1);
    expect(mockFileWrite).not.toHaveBeenCalled();
  });

  it("addIgnoredCorrection treats different context as a different entry", async () => {
    const existing = { ruleId: "r1", text: "word", context: "ctx-A", addedAt: 1000 };
    setupVFSWithContent(JSON.stringify({ version: "1.0.0", ignoredCorrections: [existing] }));
    mockGetFileHandle.mockResolvedValue(mockFileHandle as unknown as typeof mockFileHandle);
    mockFileWrite.mockResolvedValue(undefined);

    // Different context → new entry
    const result = await svc.addIgnoredCorrection("r1", "word", "ctx-B");
    expect(result).toHaveLength(2);
    expect(mockFileWrite).toHaveBeenCalled();
  });

  it("addIgnoredCorrection persists the new entry with addedAt timestamp", async () => {
    setupVFSWithContent(JSON.stringify({ version: "1.0.0", ignoredCorrections: [] }));
    mockGetFileHandle.mockResolvedValue(mockFileHandle as unknown as typeof mockFileHandle);
    mockFileWrite.mockResolvedValue(undefined);

    const before = Date.now();
    const result = await svc.addIgnoredCorrection("new-rule", "new-text");
    const after = Date.now();

    expect(result).toHaveLength(1);
    expect(result[0].addedAt).toBeGreaterThanOrEqual(before);
    expect(result[0].addedAt).toBeLessThanOrEqual(after);
  });

  it("removeIgnoredCorrection removes entry matching (ruleId, text, context)", async () => {
    const c1 = { ruleId: "r-keep", text: "keep", addedAt: 1000 };
    const c2 = { ruleId: "r-remove", text: "gone", addedAt: 2000 };
    setupVFSWithContent(JSON.stringify({ version: "1.0.0", ignoredCorrections: [c1, c2] }));
    mockGetFileHandle.mockResolvedValue(mockFileHandle as unknown as typeof mockFileHandle);
    mockFileWrite.mockResolvedValue(undefined);

    const result = await svc.removeIgnoredCorrection("r-remove", "gone");
    expect(result).toHaveLength(1);
    expect(result[0].ruleId).toBe("r-keep");
    const written = JSON.parse(mockFileWrite.mock.calls[0][0]);
    expect(written.ignoredCorrections).toHaveLength(1);
  });

  it("clearIgnoredCorrections writes an empty list to the project file", async () => {
    mockGetFileHandle.mockResolvedValue(mockFileHandle as unknown as typeof mockFileHandle);
    mockGetIllusionsDirHandle.mockResolvedValue({ getFileHandle: mockGetFileHandle });
    mockVFS.getDirectoryHandle.mockResolvedValue(
      mockRootHandle as unknown as typeof mockRootHandle,
    );
    mockFileWrite.mockResolvedValue(undefined);

    await svc.clearIgnoredCorrections();

    expect(mockFileWrite).toHaveBeenCalledOnce();
    const written = JSON.parse(mockFileWrite.mock.calls[0][0]);
    expect(written.ignoredCorrections).toEqual([]);
  });
});

describe("IgnoredCorrectionsService — standalone mode (StorageService)", () => {
  let svc: ReturnType<typeof getIgnoredCorrectionsService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageItems = {};
    svc = getIgnoredCorrectionsService();
  });

  it("loadIgnoredCorrectionsStandalone returns empty array when key not in storage", async () => {
    const result = await svc.loadIgnoredCorrectionsStandalone("/Users/x/novel.mdi");
    expect(result).toEqual([]);
  });

  it("loadIgnoredCorrectionsStandalone reads from storage with correct key", async () => {
    mockStorageItems["illusions-ignored-corrections:Users/x/novel.mdi"] = JSON.stringify({
      version: "1.0.0",
      ignoredCorrections: [{ ruleId: "r1", text: "foo", addedAt: 999 }],
    });

    const result = await svc.loadIgnoredCorrectionsStandalone("/Users/x/novel.mdi");
    expect(result).toHaveLength(1);
    expect(result[0].ruleId).toBe("r1");
  });

  it("saveIgnoredCorrectionsStandalone writes JSON with correct key (normalizes leading slash)", async () => {
    await svc.saveIgnoredCorrectionsStandalone("/Users/x/novel.mdi", []);
    expect(mockStorage.setItem).toHaveBeenCalledWith(
      "illusions-ignored-corrections:Users/x/novel.mdi",
      expect.any(String),
    );
  });

  it("normalizes Windows backslash paths in storage key", async () => {
    await svc.saveIgnoredCorrectionsStandalone("C:\\Users\\x\\novel.mdi", []);
    expect(mockStorage.setItem).toHaveBeenCalledWith(
      "illusions-ignored-corrections:C:/Users/x/novel.mdi",
      expect.any(String),
    );
  });

  it("addIgnoredCorrectionStandalone deduplicates by (ruleId, text, context)", async () => {
    mockStorageItems["illusions-ignored-corrections:Users/x/f.mdi"] = JSON.stringify({
      version: "1.0.0",
      ignoredCorrections: [{ ruleId: "r1", text: "dup", addedAt: 1000 }],
    });

    const result = await svc.addIgnoredCorrectionStandalone("/Users/x/f.mdi", "r1", "dup");
    expect(result).toHaveLength(1);
    expect(mockStorage.setItem).not.toHaveBeenCalled();
  });

  it("clearAllIgnoredCorrectionsStandalone removes every prefixed key (all files)", async () => {
    mockStorageItems["illusions-ignored-corrections:Users/x/a.mdi"] = "{}";
    mockStorageItems["illusions-ignored-corrections:Users/x/b.mdi"] = "{}";
    mockStorageItems["illusions-ignored-corrections:Users/y/c.mdi"] = "{}";
    // Unrelated key must survive
    mockStorageItems["illusions-user-dictionary:Users/x/a.mdi"] = "{}";

    await svc.clearAllIgnoredCorrectionsStandalone();

    expect(mockStorage.getKeysByPrefix).toHaveBeenCalledWith("illusions-ignored-corrections:");
    expect(Object.keys(mockStorageItems)).toEqual(["illusions-user-dictionary:Users/x/a.mdi"]);
  });
});
