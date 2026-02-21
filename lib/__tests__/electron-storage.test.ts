/**
 * Unit tests for ElectronStorageProvider (IPC-based storage).
 *
 * Tests cover all 12 IStorageService methods plus Electron-specific methods:
 * - Session: saveSession(), loadSession()
 * - App State: saveAppState(), loadAppState()
 * - Recent Files: addToRecent(), getRecentFiles(), removeFromRecent(), clearRecent()
 * - Editor Buffer: saveEditorBuffer(), loadEditorBuffer(), clearEditorBuffer()
 * - Utility: clearAll()
 * - Electron-specific: addRecentProject(), getRecentProjects(), removeRecentProject()
 *
 * window.electronAPI.storage is fully mocked — no real IPC is used.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type {
  AppState,
  RecentFile,
  EditorBuffer,
  StorageSession,
} from "@/lib/storage-types";
import { ElectronStorageProvider } from "@/lib/electron-storage";

// -----------------------------------------------------------------------
// Mock helpers
// -----------------------------------------------------------------------

/** Create a fully mocked electronAPI.storage object. */
function createMockStorageAPI() {
  return {
    saveSession: vi.fn<(s: StorageSession) => Promise<void>>().mockResolvedValue(undefined),
    loadSession: vi.fn<() => Promise<StorageSession | null>>().mockResolvedValue(null),
    saveAppState: vi.fn<(a: AppState) => Promise<void>>().mockResolvedValue(undefined),
    loadAppState: vi.fn<() => Promise<AppState | null>>().mockResolvedValue(null),
    addToRecent: vi.fn<(f: RecentFile) => Promise<void>>().mockResolvedValue(undefined),
    getRecentFiles: vi.fn<() => Promise<RecentFile[]>>().mockResolvedValue([]),
    removeFromRecent: vi.fn<(p: string) => Promise<void>>().mockResolvedValue(undefined),
    clearRecent: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    saveEditorBuffer: vi.fn<(b: EditorBuffer) => Promise<void>>().mockResolvedValue(undefined),
    loadEditorBuffer: vi.fn<() => Promise<EditorBuffer | null>>().mockResolvedValue(null),
    clearEditorBuffer: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    clearAll: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    addRecentProject: vi
      .fn<(p: { id: string; rootPath: string; name: string }) => Promise<void>>()
      .mockResolvedValue(undefined),
    getRecentProjects: vi
      .fn<() => Promise<Array<{ id: string; rootPath: string; name: string }>>>()
      .mockResolvedValue([]),
    removeRecentProject: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
  };
}

type MockStorageAPI = ReturnType<typeof createMockStorageAPI>;

// -----------------------------------------------------------------------
// Setup / teardown
// -----------------------------------------------------------------------

let mockStorage: MockStorageAPI;

/** Attach mock electronAPI to global window. */
function installElectronAPI(storage: MockStorageAPI): void {
  // Cast via unknown to avoid strict type mismatch with full ElectronAPI interface
  (window as unknown as Record<string, unknown>).electronAPI = {
    storage,
  };
}

/** Remove mock electronAPI from global window. */
function removeElectronAPI(): void {
  delete (window as Window & { electronAPI?: unknown }).electronAPI;
}

beforeEach(() => {
  mockStorage = createMockStorageAPI();
  installElectronAPI(mockStorage);
});

afterEach(() => {
  removeElectronAPI();
  vi.restoreAllMocks();
});

// -----------------------------------------------------------------------
// Test helpers
// -----------------------------------------------------------------------

function makeRecentFile(overrides: Partial<RecentFile> = {}): RecentFile {
  return {
    name: "test.mdi",
    path: "/documents/test.mdi",
    lastModified: Date.now(),
    snippet: "Test content",
    ...overrides,
  };
}

function makeEditorBuffer(
  overrides: Partial<EditorBuffer> = {}
): EditorBuffer {
  return {
    content: "Draft content",
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeAppState(overrides: Partial<AppState> = {}): AppState {
  return {
    lastOpenedMdiPath: "/documents/test.mdi",
    ...overrides,
  };
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe("ElectronStorageProvider", () => {
  // =====================================================================
  // Error handling — missing electronAPI
  // =====================================================================

  describe("when electronAPI is not available", () => {
    it("throws an error for any storage method call", async () => {
      removeElectronAPI();
      const provider = new ElectronStorageProvider();

      await expect(provider.loadAppState()).rejects.toThrow(
        /storage API/
      );
    });
  });

  // =====================================================================
  // initialize()
  // =====================================================================

  describe("initialize()", () => {
    it("completes without error when electronAPI is available", async () => {
      const provider = new ElectronStorageProvider();
      await expect(provider.initialize()).resolves.not.toThrow();
    });

    it("is idempotent (calling multiple times is safe)", async () => {
      const provider = new ElectronStorageProvider();
      await provider.initialize();
      await provider.initialize();
      // No assertion needed — just ensure no errors are thrown
    });
  });

  // =====================================================================
  // App State
  // =====================================================================

  describe("saveAppState / loadAppState", () => {
    it("delegates saveAppState to IPC bridge", async () => {
      const provider = new ElectronStorageProvider();
      const appState = makeAppState();

      await provider.saveAppState(appState);

      expect(mockStorage.saveAppState).toHaveBeenCalledOnce();
      expect(mockStorage.saveAppState).toHaveBeenCalledWith(appState);
    });

    it("delegates loadAppState to IPC bridge", async () => {
      const provider = new ElectronStorageProvider();
      const expected = makeAppState({ fontScale: 1.2 });
      mockStorage.loadAppState.mockResolvedValue(expected);

      const result = await provider.loadAppState();

      expect(mockStorage.loadAppState).toHaveBeenCalledOnce();
      expect(result).toEqual(expected);
    });

    it("returns null when IPC returns null", async () => {
      const provider = new ElectronStorageProvider();
      mockStorage.loadAppState.mockResolvedValue(null);

      const result = await provider.loadAppState();
      expect(result).toBeNull();
    });
  });

  // =====================================================================
  // Recent Files
  // =====================================================================

  describe("addToRecent", () => {
    it("delegates to IPC bridge with the given file", async () => {
      const provider = new ElectronStorageProvider();
      const file = makeRecentFile();

      await provider.addToRecent(file);

      expect(mockStorage.addToRecent).toHaveBeenCalledOnce();
      expect(mockStorage.addToRecent).toHaveBeenCalledWith(file);
    });
  });

  describe("getRecentFiles", () => {
    it("returns files from IPC bridge", async () => {
      const provider = new ElectronStorageProvider();
      const files = [
        makeRecentFile({ name: "a.mdi", path: "/a.mdi" }),
        makeRecentFile({ name: "b.mdi", path: "/b.mdi" }),
      ];
      mockStorage.getRecentFiles.mockResolvedValue(files);

      const result = await provider.getRecentFiles();

      expect(result).toEqual(files);
      expect(mockStorage.getRecentFiles).toHaveBeenCalledOnce();
    });
  });

  describe("removeFromRecent", () => {
    it("delegates to IPC bridge with the path", async () => {
      const provider = new ElectronStorageProvider();

      await provider.removeFromRecent("/to-remove.mdi");

      expect(mockStorage.removeFromRecent).toHaveBeenCalledOnce();
      expect(mockStorage.removeFromRecent).toHaveBeenCalledWith(
        "/to-remove.mdi"
      );
    });
  });

  describe("clearRecent", () => {
    it("delegates to IPC bridge", async () => {
      const provider = new ElectronStorageProvider();

      await provider.clearRecent();

      expect(mockStorage.clearRecent).toHaveBeenCalledOnce();
    });
  });

  // =====================================================================
  // Editor Buffer
  // =====================================================================

  describe("saveEditorBuffer / loadEditorBuffer", () => {
    it("delegates saveEditorBuffer to IPC bridge", async () => {
      const provider = new ElectronStorageProvider();
      const buffer = makeEditorBuffer();

      await provider.saveEditorBuffer(buffer);

      expect(mockStorage.saveEditorBuffer).toHaveBeenCalledOnce();
      expect(mockStorage.saveEditorBuffer).toHaveBeenCalledWith(buffer);
    });

    it("delegates loadEditorBuffer to IPC bridge", async () => {
      const provider = new ElectronStorageProvider();
      const expected = makeEditorBuffer({ content: "Recovered draft" });
      mockStorage.loadEditorBuffer.mockResolvedValue(expected);

      const result = await provider.loadEditorBuffer();

      expect(result).toEqual(expected);
    });

    it("returns null when IPC returns null", async () => {
      const provider = new ElectronStorageProvider();
      mockStorage.loadEditorBuffer.mockResolvedValue(null);

      const result = await provider.loadEditorBuffer();
      expect(result).toBeNull();
    });
  });

  describe("clearEditorBuffer", () => {
    it("delegates to IPC bridge", async () => {
      const provider = new ElectronStorageProvider();

      await provider.clearEditorBuffer();

      expect(mockStorage.clearEditorBuffer).toHaveBeenCalledOnce();
    });
  });

  // =====================================================================
  // Session
  // =====================================================================

  describe("saveSession / loadSession", () => {
    it("delegates saveSession to IPC bridge", async () => {
      const provider = new ElectronStorageProvider();
      const session: StorageSession = {
        appState: makeAppState(),
        recentFiles: [makeRecentFile()],
        editorBuffer: makeEditorBuffer(),
      };

      await provider.saveSession(session);

      expect(mockStorage.saveSession).toHaveBeenCalledOnce();
      expect(mockStorage.saveSession).toHaveBeenCalledWith(session);
    });

    it("delegates loadSession to IPC bridge", async () => {
      const provider = new ElectronStorageProvider();
      const expected: StorageSession = {
        appState: makeAppState(),
        recentFiles: [],
        editorBuffer: null,
      };
      mockStorage.loadSession.mockResolvedValue(expected);

      const result = await provider.loadSession();

      expect(result).toEqual(expected);
    });

    it("returns null when IPC returns null", async () => {
      const provider = new ElectronStorageProvider();
      const result = await provider.loadSession();

      expect(result).toBeNull();
    });
  });

  // =====================================================================
  // clearAll
  // =====================================================================

  describe("clearAll", () => {
    it("delegates to IPC bridge", async () => {
      const provider = new ElectronStorageProvider();

      await provider.clearAll();

      expect(mockStorage.clearAll).toHaveBeenCalledOnce();
    });
  });

  // =====================================================================
  // Electron-specific methods (project management)
  // =====================================================================

  describe("addRecentProject", () => {
    it("delegates to IPC bridge with project info", async () => {
      const provider = new ElectronStorageProvider();
      const project = {
        id: "proj-1",
        rootPath: "/projects/novel",
        name: "My Novel",
      };

      await provider.addRecentProject(project);

      expect(mockStorage.addRecentProject).toHaveBeenCalledOnce();
      expect(mockStorage.addRecentProject).toHaveBeenCalledWith(project);
    });
  });

  describe("getRecentProjects", () => {
    it("returns projects from IPC bridge", async () => {
      const provider = new ElectronStorageProvider();
      const projects = [
        { id: "proj-1", rootPath: "/projects/novel", name: "My Novel" },
      ];
      mockStorage.getRecentProjects.mockResolvedValue(projects);

      const result = await provider.getRecentProjects();

      expect(result).toEqual(projects);
    });
  });

  describe("removeRecentProject", () => {
    it("delegates to IPC bridge with project ID", async () => {
      const provider = new ElectronStorageProvider();

      await provider.removeRecentProject("proj-1");

      expect(mockStorage.removeRecentProject).toHaveBeenCalledOnce();
      expect(mockStorage.removeRecentProject).toHaveBeenCalledWith(
        "proj-1"
      );
    });
  });
});
