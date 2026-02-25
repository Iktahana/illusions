/**
 * Unit tests for WebStorageProvider (IndexedDB/Dexie-based storage).
 *
 * Tests cover all 12 IStorageService methods:
 * - Session: saveSession(), loadSession()
 * - App State: saveAppState(), loadAppState()
 * - Recent Files: addToRecent(), getRecentFiles(), removeFromRecent(), clearRecent()
 * - Editor Buffer: saveEditorBuffer(), loadEditorBuffer(), clearEditorBuffer()
 * - Utility: clearAll()
 *
 * Strategy: We mock Dexie entirely so that WebStorageDatabase.open() is a no-op,
 * and inject mock tables via vi.spyOn on the prototype. This way the real
 * WebStorageProvider class logic runs against in-memory stores.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

import type {
  AppState,
  RecentFile,
  EditorBuffer,
  StorageSession,
} from "@/lib/storage/storage-types";

// -----------------------------------------------------------------------
// In-memory table mock (simulates a Dexie Table)
// -----------------------------------------------------------------------

function createMockTable<T extends Record<string, any>>(
  primaryKey: string
) {
  const records = new Map<string, T>();

  return {
    _records: records,
    put: vi.fn(async (record: T) => {
      records.set(record[primaryKey] as string, { ...record });
    }),
    get: vi.fn(async (key: string) => {
      return records.get(key) ?? undefined;
    }),
    delete: vi.fn(async (key: string) => {
      records.delete(key);
    }),
    clear: vi.fn(async () => {
      records.clear();
    }),
    toArray: vi.fn(async () => {
      return Array.from(records.values());
    }),
    bulkPut: vi.fn(async (items: T[]) => {
      for (const item of items) {
        records.set(item[primaryKey] as string, { ...item });
      }
    }),
    bulkDelete: vi.fn(async (keys: string[]) => {
      for (const key of keys) {
        records.delete(key);
      }
    }),
  };
}

// Build mock tables
const mockAppStateTable = createMockTable<any>("id");
const mockRecentFilesTable = createMockTable<any>("id");
const mockEditorBufferTable = createMockTable<any>("id");
const mockProjectHandlesTable = createMockTable<any>("projectId");

const mockDb = {
  open: vi.fn(async () => {}),
  appState: mockAppStateTable,
  recentFiles: mockRecentFilesTable,
  editorBuffer: mockEditorBufferTable,
  projectHandles: mockProjectHandlesTable,
};

// -----------------------------------------------------------------------
// Dexie mock — prevent any IndexedDB access.
// The WebStorageDatabase extends Dexie, so we need to replace the
// Dexie constructor and the version().stores() chain.
// -----------------------------------------------------------------------
vi.mock("dexie", () => {
  class FakeDexie {
    constructor() {
      // Assign mock tables so class field initializers (appState!, etc.)
      // can reference them through the instance.
      Object.assign(this, {
        open: mockDb.open,
        appState: mockDb.appState,
        recentFiles: mockDb.recentFiles,
        editorBuffer: mockDb.editorBuffer,
        projectHandles: mockDb.projectHandles,
      });
    }
    version() {
      return {
        stores: () => ({
          version: () => ({ stores: () => ({}) }),
        }),
      };
    }
  }
  return { default: FakeDexie };
});

// Now import the real provider — its Dexie base class is our FakeDexie
import { WebStorageProvider } from "@/lib/storage/web-storage";

// -----------------------------------------------------------------------
// Test helpers
// -----------------------------------------------------------------------

function createProvider(): WebStorageProvider {
  return new WebStorageProvider();
}

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

describe("WebStorageProvider", () => {
  beforeEach(() => {
    // Clear all in-memory stores before each test
    mockAppStateTable._records.clear();
    mockRecentFilesTable._records.clear();
    mockEditorBufferTable._records.clear();
    mockProjectHandlesTable._records.clear();

    // Reset call counts
    vi.clearAllMocks();
  });

  // =====================================================================
  // App State
  // =====================================================================

  describe("saveAppState / loadAppState", () => {
    it("saves and loads app state", async () => {
      const provider = createProvider();
      const appState = makeAppState();

      await provider.saveAppState(appState);
      const loaded = await provider.loadAppState();

      expect(loaded).toEqual(appState);
    });

    it("returns null when no app state has been saved", async () => {
      const provider = createProvider();
      const loaded = await provider.loadAppState();

      expect(loaded).toBeNull();
    });

    it("overwrites previous app state on re-save", async () => {
      const provider = createProvider();

      await provider.saveAppState(makeAppState({ fontScale: 1.0 }));
      await provider.saveAppState(makeAppState({ fontScale: 1.5 }));

      const loaded = await provider.loadAppState();
      expect(loaded?.fontScale).toBe(1.5);
    });
  });

  // =====================================================================
  // Recent Files
  // =====================================================================

  describe("addToRecent / getRecentFiles", () => {
    it("adds a file and retrieves it", async () => {
      const provider = createProvider();
      const file = makeRecentFile();

      await provider.addToRecent(file);
      const files = await provider.getRecentFiles();

      expect(files).toHaveLength(1);
      expect(files[0]).toEqual(file);
    });

    it("returns files sorted by lastModified descending", async () => {
      const provider = createProvider();
      const older = makeRecentFile({
        name: "old.mdi",
        path: "/old.mdi",
        lastModified: 1000,
      });
      const newer = makeRecentFile({
        name: "new.mdi",
        path: "/new.mdi",
        lastModified: 2000,
      });

      await provider.addToRecent(older);
      await provider.addToRecent(newer);
      const files = await provider.getRecentFiles();

      expect(files[0].name).toBe("new.mdi");
      expect(files[1].name).toBe("old.mdi");
    });

    it("returns empty array when no recent files exist", async () => {
      const provider = createProvider();
      const files = await provider.getRecentFiles();

      expect(files).toEqual([]);
    });

    it("caps the list at 10 entries", async () => {
      const provider = createProvider();

      // Add 12 files
      for (let i = 0; i < 12; i++) {
        await provider.addToRecent(
          makeRecentFile({
            name: `file${i}.mdi`,
            path: `/file${i}.mdi`,
            lastModified: i * 1000,
          })
        );
      }

      const files = await provider.getRecentFiles();
      expect(files.length).toBeLessThanOrEqual(10);
    });
  });

  describe("removeFromRecent", () => {
    it("removes a specific file by path", async () => {
      const provider = createProvider();
      const file = makeRecentFile({ path: "/to-remove.mdi" });

      await provider.addToRecent(file);
      await provider.removeFromRecent("/to-remove.mdi");

      const files = await provider.getRecentFiles();
      expect(files).toHaveLength(0);
    });

    it("does not throw when removing a non-existent path", async () => {
      const provider = createProvider();
      await expect(
        provider.removeFromRecent("/nonexistent.mdi")
      ).resolves.not.toThrow();
    });
  });

  describe("clearRecent", () => {
    it("removes all recent files", async () => {
      const provider = createProvider();

      await provider.addToRecent(makeRecentFile({ path: "/a.mdi" }));
      await provider.addToRecent(
        makeRecentFile({ path: "/b.mdi", name: "b.mdi" })
      );
      await provider.clearRecent();

      const files = await provider.getRecentFiles();
      expect(files).toHaveLength(0);
    });
  });

  // =====================================================================
  // Editor Buffer
  // =====================================================================

  describe("saveEditorBuffer / loadEditorBuffer", () => {
    it("saves and loads an editor buffer", async () => {
      const provider = createProvider();
      const buffer = makeEditorBuffer();

      await provider.saveEditorBuffer(buffer);
      const loaded = await provider.loadEditorBuffer();

      expect(loaded).toEqual(buffer);
    });

    it("returns null when no buffer has been saved", async () => {
      const provider = createProvider();
      const loaded = await provider.loadEditorBuffer();

      expect(loaded).toBeNull();
    });
  });

  describe("clearEditorBuffer", () => {
    it("removes the saved buffer", async () => {
      const provider = createProvider();

      await provider.saveEditorBuffer(makeEditorBuffer());
      await provider.clearEditorBuffer();
      const loaded = await provider.loadEditorBuffer();

      expect(loaded).toBeNull();
    });
  });

  // =====================================================================
  // Session
  // =====================================================================

  describe("saveSession / loadSession", () => {
    it("saves and loads a full session", async () => {
      const provider = createProvider();
      const session: StorageSession = {
        appState: makeAppState(),
        recentFiles: [makeRecentFile()],
        editorBuffer: makeEditorBuffer(),
      };

      await provider.saveSession(session);
      const loaded = await provider.loadSession();

      expect(loaded).not.toBeNull();
      expect(loaded!.appState).toEqual(session.appState);
      expect(loaded!.recentFiles).toHaveLength(1);
      expect(loaded!.editorBuffer).toEqual(session.editorBuffer);
    });

    it("returns null when nothing has been saved", async () => {
      const provider = createProvider();
      const loaded = await provider.loadSession();

      expect(loaded).toBeNull();
    });

    it("clears editor buffer when session.editorBuffer is null", async () => {
      const provider = createProvider();

      // First save a buffer
      await provider.saveEditorBuffer(makeEditorBuffer());

      // Then save a session without a buffer
      await provider.saveSession({
        appState: makeAppState(),
        recentFiles: [],
        editorBuffer: null,
      });

      const loaded = await provider.loadEditorBuffer();
      expect(loaded).toBeNull();
    });
  });

  // =====================================================================
  // clearAll
  // =====================================================================

  describe("clearAll", () => {
    it("removes all stored data", async () => {
      const provider = createProvider();

      await provider.saveAppState(makeAppState());
      await provider.addToRecent(makeRecentFile());
      await provider.saveEditorBuffer(makeEditorBuffer());

      await provider.clearAll();

      expect(await provider.loadAppState()).toBeNull();
      expect(await provider.getRecentFiles()).toEqual([]);
      expect(await provider.loadEditorBuffer()).toBeNull();
    });
  });
});
