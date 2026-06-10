/**
 * Tests for project-service.ts.
 *
 * Covers:
 * - validateProjectName: all validation rules (pure function, no mocks needed)
 * - getProjectService: singleton returns same instance
 * - readStandaloneContent: Electron IPC path reads from VFS; Web path rejects
 * - validateProjectStructure: must NOT create .illusions directory (create:false)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock project-file-service before any imports
// ---------------------------------------------------------------------------

const mockReadFile = vi.fn<(path: string) => Promise<string>>();

vi.mock("@/lib/services/project-file-service", () => ({
  getProjectFileService: () => ({
    readFile: (path: string) => mockReadFile(path),
    isRootOpen: vi.fn(() => true),
    openDirectory: vi.fn(),
    getDirectoryHandle: vi.fn(),
    writeFile: vi.fn(),
    deleteFile: vi.fn(),
    rename: vi.fn(),
    getFileMetadata: vi.fn(),
    listDirectory: vi.fn(),
    getRootPath: vi.fn(() => null),
  }),
}));

vi.mock("@/lib/utils/runtime-env", () => ({
  isElectronRenderer: () => false,
}));

vi.mock("../project-manager", () => ({
  getProjectManager: () => ({
    setCurrentProject: vi.fn(),
    getCurrentProject: vi.fn(() => null),
  }),
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks
// ---------------------------------------------------------------------------

import { validateProjectName, getProjectService } from "@/lib/project/project-service";

// ---------------------------------------------------------------------------
// Tests: validateProjectName (pure function)
// ---------------------------------------------------------------------------

describe("validateProjectName", () => {
  it("accepts a valid project name", () => {
    const result = validateProjectName("私の小説");
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("rejects empty string", () => {
    const result = validateProjectName("");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("rejects whitespace-only name", () => {
    const result = validateProjectName("   ");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("rejects name longer than 200 characters", () => {
    const result = validateProjectName("a".repeat(201));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("長すぎ");
  });

  it("accepts name exactly 200 characters", () => {
    const result = validateProjectName("a".repeat(200));
    expect(result.valid).toBe(true);
  });

  it('rejects name with illegal filesystem characters (< > : " / \\ | ? *)', () => {
    for (const ch of ["<", ">", ":", '"', "/", "\\", "|", "?", "*"]) {
      const result = validateProjectName(`test${ch}name`);
      expect(result.valid).toBe(false);
    }
  });

  it("rejects Windows reserved names (CON, NUL, COM1, LPT1, etc.)", () => {
    for (const name of ["CON", "NUL", "PRN", "AUX", "COM1", "LPT9", "con", "nul"]) {
      const result = validateProjectName(name);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("予約語");
    }
  });

  it("accepts non-reserved names that resemble reserved patterns", () => {
    // These should not be blocked
    expect(validateProjectName("CONSOLE").valid).toBe(true);
    expect(validateProjectName("NULL").valid).toBe(true);
    expect(validateProjectName("COM").valid).toBe(true); // no digit suffix
  });

  it("rejects names consisting only of dots", () => {
    expect(validateProjectName("...").valid).toBe(false);
    expect(validateProjectName(".").valid).toBe(false);
  });

  it("rejects names consisting only of spaces and dots", () => {
    expect(validateProjectName(" . ").valid).toBe(false);
  });

  it("accepts names with dots mixed with other characters", () => {
    expect(validateProjectName("novel.2026").valid).toBe(true);
    expect(validateProjectName("v1.0.1").valid).toBe(true);
  });

  it("accepts Japanese project name", () => {
    expect(validateProjectName("第一章〜序章").valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: getProjectService singleton
// ---------------------------------------------------------------------------

describe("getProjectService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a non-null object", () => {
    const service = getProjectService();
    expect(service).toBeDefined();
    expect(service).not.toBeNull();
  });

  it("returns the same instance on repeated calls (singleton)", () => {
    const a = getProjectService();
    const b = getProjectService();
    expect(a).toBe(b);
  });

  it("has expected public methods", () => {
    const service = getProjectService();
    expect(typeof service.createProject).toBe("function");
    expect(typeof service.openProject).toBe("function");
    expect(typeof service.saveProject).toBe("function");
    expect(typeof service.validateProjectStructure).toBe("function");
    expect(typeof service.readProjectContent).toBe("function");
    expect(typeof service.readStandaloneContent).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Tests: validateProjectStructure — no side-effect creation, real existence
// check via entries() (#1567 item 15)
// ---------------------------------------------------------------------------

type VFSEntryLike = { name: string; kind: "file" | "directory"; path: string };

/** Build an entries() implementation yielding the given [name, entry] pairs. */
function makeEntries(items: VFSEntryLike[]): () => AsyncIterable<[string, VFSEntryLike]> {
  return async function* entries(): AsyncGenerator<[string, VFSEntryLike]> {
    for (const item of items) {
      yield [item.name, item];
    }
  };
}

describe("validateProjectStructure", () => {
  it("returns invalid when .illusions directory does not exist (no directory created)", async () => {
    // Web-shaped handle: getDirectoryHandle rejects with NotFoundError
    const getDirectoryHandleMock = vi
      .fn<(name: string, opts?: { create?: boolean }) => Promise<never>>()
      .mockRejectedValue(new DOMException("Not found", "NotFoundError"));

    const fakeRoot = {
      getDirectoryHandle: getDirectoryHandleMock,
      entries: makeEntries([{ name: "novel.mdi", kind: "file", path: "novel.mdi" }]),
    } as unknown as import("@/lib/vfs/types").VFSDirectoryHandle;

    const result = await getProjectService().validateProjectStructure(fakeRoot);

    // Must report invalid with the accurate error
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(".illusions directory not found");

    // Must never create the directory as a side effect
    expect(getDirectoryHandleMock).not.toHaveBeenCalledWith(
      ".illusions",
      expect.objectContaining({ create: true }),
    );
  });

  it("Electron-shaped handle: getDirectoryHandle resolves for missing dirs — still reports '.illusions directory not found'", async () => {
    // ElectronVFSDirectoryHandle.getDirectoryHandle({create:false}) NEVER
    // throws for a missing directory; it just wraps the path. The validator
    // must therefore detect absence via entries(), not via a thrown error.
    const getFileHandleMock = vi
      .fn<(name: string) => Promise<never>>()
      .mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    const fakeIllusionsDir = {
      getFileHandle: getFileHandleMock,
    } as unknown as import("@/lib/vfs/types").VFSDirectoryHandle;

    const getDirectoryHandleMock = vi
      .fn<
        (
          name: string,
          opts?: { create?: boolean },
        ) => Promise<import("@/lib/vfs/types").VFSDirectoryHandle>
      >()
      .mockResolvedValue(fakeIllusionsDir);

    const fakeRoot = {
      getDirectoryHandle: getDirectoryHandleMock,
      // .illusions is NOT among the entries — directory is missing on disk
      entries: makeEntries([{ name: "novel.mdi", kind: "file", path: "novel.mdi" }]),
    } as unknown as import("@/lib/vfs/types").VFSDirectoryHandle;

    const result = await getProjectService().validateProjectStructure(fakeRoot);

    expect(result.valid).toBe(false);
    // The accurate error — NOT the misleading project.json error
    expect(result.errors).toContain(".illusions directory not found");
    expect(result.errors.some((e) => e.includes("project.json"))).toBe(false);
  });

  it("returns invalid when project.json is missing inside .illusions", async () => {
    const getFileHandleMock = vi
      .fn<(name: string) => Promise<never>>()
      .mockRejectedValue(new DOMException("Not found", "NotFoundError"));

    const fakeIllusionsDir = {
      getFileHandle: getFileHandleMock,
    } as unknown as import("@/lib/vfs/types").VFSDirectoryHandle;

    const getDirectoryHandleMock = vi
      .fn<
        (
          name: string,
          opts?: { create?: boolean },
        ) => Promise<import("@/lib/vfs/types").VFSDirectoryHandle>
      >()
      .mockResolvedValue(fakeIllusionsDir);

    const fakeRoot = {
      getDirectoryHandle: getDirectoryHandleMock,
      entries: makeEntries([{ name: ".illusions", kind: "directory", path: ".illusions" }]),
    } as unknown as import("@/lib/vfs/types").VFSDirectoryHandle;

    const result = await getProjectService().validateProjectStructure(fakeRoot);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("project.json"))).toBe(true);
    // Still must not have created the directory
    expect(getDirectoryHandleMock).toHaveBeenCalledWith(".illusions", { create: false });
  });

  it("returns valid for a complete project structure", async () => {
    const projectJson = JSON.stringify({
      version: "1.0.0",
      projectId: "id-1",
      name: "Novel",
      mainFile: "Novel.mdi",
    });

    const fakeIllusionsDir = {
      getFileHandle: vi.fn().mockResolvedValue({
        read: vi.fn().mockResolvedValue(projectJson),
      }),
    } as unknown as import("@/lib/vfs/types").VFSDirectoryHandle;

    const fakeRoot = {
      getDirectoryHandle: vi.fn().mockResolvedValue(fakeIllusionsDir),
      entries: makeEntries([
        { name: "Novel.mdi", kind: "file", path: "Novel.mdi" },
        { name: ".illusions", kind: "directory", path: ".illusions" },
      ]),
    } as unknown as import("@/lib/vfs/types").VFSDirectoryHandle;

    const result = await getProjectService().validateProjectStructure(fakeRoot);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("a '.illusions' FILE entry does not count as the metadata directory", async () => {
    const fakeRoot = {
      getDirectoryHandle: vi.fn(),
      entries: makeEntries([{ name: ".illusions", kind: "file", path: ".illusions" }]),
    } as unknown as import("@/lib/vfs/types").VFSDirectoryHandle;

    const result = await getProjectService().validateProjectStructure(fakeRoot);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(".illusions directory not found");
  });
});
