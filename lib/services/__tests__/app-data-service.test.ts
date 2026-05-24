/**
 * Tests for AppDataService
 *
 * Verifies that each public method delegates 1:1 to the underlying StorageService.
 * Uses vi.mock() to intercept getStorageService() and spy on its methods.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  StorageSession,
  AppState,
  EditorBuffer,
  RecentProject,
} from "@/lib/storage/storage-types";

// -----------------------------------------------------------------------
// Build a fully-typed mock StorageService
// -----------------------------------------------------------------------
const mockStorage = {
  initialize: vi.fn().mockResolvedValue(undefined),
  saveSession: vi.fn().mockResolvedValue(undefined),
  loadSession: vi.fn().mockResolvedValue(null),
  saveAppState: vi.fn().mockResolvedValue(undefined),
  loadAppState: vi.fn().mockResolvedValue(null),
  addToRecent: vi.fn().mockResolvedValue(undefined),
  getRecentFiles: vi.fn().mockResolvedValue([]),
  removeFromRecent: vi.fn().mockResolvedValue(undefined),
  clearRecent: vi.fn().mockResolvedValue(undefined),
  saveEditorBuffer: vi.fn().mockResolvedValue(undefined),
  loadEditorBuffer: vi.fn().mockResolvedValue(null),
  clearEditorBuffer: vi.fn().mockResolvedValue(undefined),
  addRecentProject: vi.fn().mockResolvedValue(undefined),
  getRecentProjects: vi.fn().mockResolvedValue([]),
  removeRecentProject: vi.fn().mockResolvedValue(undefined),
  clearAll: vi.fn().mockResolvedValue(undefined),
  setItem: vi.fn().mockResolvedValue(undefined),
  getItem: vi.fn().mockResolvedValue(null),
  removeItem: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/lib/storage/storage-service", () => ({
  getStorageService: () => mockStorage,
}));

// -----------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------
const sampleSession: StorageSession = {
  appState: { lastOpenedMdiPath: "/test/doc.mdi" },
  recentFiles: [],
  editorBuffer: null,
};

const sampleAppState: AppState = {
  lastOpenedMdiPath: "/test/doc.mdi",
  fontScale: 1,
};

const sampleEditorBuffer: EditorBuffer = {
  content: "# Hello",
  timestamp: Date.now(),
};

const sampleProject: RecentProject = {
  id: "proj-1",
  rootPath: "/Users/user/projects/novel",
  name: "My Novel",
};

// -----------------------------------------------------------------------
// Reset mocks before each test
// -----------------------------------------------------------------------
let getAppDataService: () => import("@/lib/services/app-data-service").AppDataServiceInterface;
let resetAppDataService: () => void;

beforeEach(async () => {
  vi.resetModules();
  Object.values(mockStorage).forEach((fn) => {
    if (typeof fn === "function" && "mockReset" in fn) {
      (fn as ReturnType<typeof vi.fn>).mockReset();
      (fn as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    }
  });
  // Restore specific return values
  mockStorage.loadSession.mockResolvedValue(null);
  mockStorage.loadAppState.mockResolvedValue(null);
  mockStorage.loadEditorBuffer.mockResolvedValue(null);
  mockStorage.getRecentProjects.mockResolvedValue([]);

  const mod = await import("@/lib/services/app-data-service");
  getAppDataService = mod.getAppDataService;
  resetAppDataService = mod.resetAppDataService;
  resetAppDataService();
});

// -----------------------------------------------------------------------
// Singleton tests
// -----------------------------------------------------------------------
describe("getAppDataService()", () => {
  it("returns a non-null object", () => {
    const svc = getAppDataService();
    expect(svc).toBeDefined();
    expect(svc).not.toBeNull();
  });

  it("returns the same instance on repeated calls (singleton)", () => {
    const a = getAppDataService();
    const b = getAppDataService();
    expect(a).toBe(b);
  });
});

describe("resetAppDataService()", () => {
  it("causes next call to return a new instance", () => {
    const a = getAppDataService();
    resetAppDataService();
    const b = getAppDataService();
    expect(a).not.toBe(b);
  });
});

// -----------------------------------------------------------------------
// Recent projects delegation
// -----------------------------------------------------------------------
describe("getRecentProjects()", () => {
  it("delegates to StorageService.getRecentProjects()", async () => {
    mockStorage.getRecentProjects.mockResolvedValue([sampleProject]);
    const result = await getAppDataService().getRecentProjects();
    expect(mockStorage.getRecentProjects).toHaveBeenCalledOnce();
    expect(result).toEqual([sampleProject]);
  });
});

describe("addRecentProject()", () => {
  it("delegates to StorageService.addRecentProject() with correct argument", async () => {
    await getAppDataService().addRecentProject(sampleProject);
    expect(mockStorage.addRecentProject).toHaveBeenCalledWith(sampleProject);
  });
});

describe("removeRecentProject()", () => {
  it("delegates to StorageService.removeRecentProject() with correct id", async () => {
    await getAppDataService().removeRecentProject("proj-1");
    expect(mockStorage.removeRecentProject).toHaveBeenCalledWith("proj-1");
  });
});

describe("clearRecent()", () => {
  it("delegates to StorageService.clearRecent()", async () => {
    await getAppDataService().clearRecent();
    expect(mockStorage.clearRecent).toHaveBeenCalledOnce();
  });
});

// -----------------------------------------------------------------------
// App state delegation
// -----------------------------------------------------------------------
describe("getAppState()", () => {
  it("delegates to StorageService.loadAppState()", async () => {
    mockStorage.loadAppState.mockResolvedValue(sampleAppState);
    const result = await getAppDataService().getAppState();
    expect(mockStorage.loadAppState).toHaveBeenCalledOnce();
    expect(result).toEqual(sampleAppState);
  });

  it("returns null when no state is stored", async () => {
    mockStorage.loadAppState.mockResolvedValue(null);
    const result = await getAppDataService().getAppState();
    expect(result).toBeNull();
  });
});

describe("setAppState()", () => {
  it("delegates to StorageService.saveAppState() with correct argument", async () => {
    await getAppDataService().setAppState(sampleAppState);
    expect(mockStorage.saveAppState).toHaveBeenCalledWith(sampleAppState);
  });
});

// -----------------------------------------------------------------------
// Editor buffer delegation
// -----------------------------------------------------------------------
describe("getEditorBuffer()", () => {
  it("delegates to StorageService.loadEditorBuffer() without fileKey", async () => {
    mockStorage.loadEditorBuffer.mockResolvedValue(sampleEditorBuffer);
    const result = await getAppDataService().getEditorBuffer();
    expect(mockStorage.loadEditorBuffer).toHaveBeenCalledWith(undefined);
    expect(result).toEqual(sampleEditorBuffer);
  });

  it("passes fileKey to StorageService.loadEditorBuffer()", async () => {
    mockStorage.loadEditorBuffer.mockResolvedValue(sampleEditorBuffer);
    await getAppDataService().getEditorBuffer("tab-abc");
    expect(mockStorage.loadEditorBuffer).toHaveBeenCalledWith("tab-abc");
  });

  it("returns null when no buffer is stored", async () => {
    mockStorage.loadEditorBuffer.mockResolvedValue(null);
    const result = await getAppDataService().getEditorBuffer();
    expect(result).toBeNull();
  });
});

describe("setEditorBuffer()", () => {
  it("delegates to StorageService.saveEditorBuffer() with correct arguments", async () => {
    await getAppDataService().setEditorBuffer(sampleEditorBuffer);
    expect(mockStorage.saveEditorBuffer).toHaveBeenCalledWith(sampleEditorBuffer, undefined);
  });

  it("passes fileKey to StorageService.saveEditorBuffer()", async () => {
    await getAppDataService().setEditorBuffer(sampleEditorBuffer, "tab-abc");
    expect(mockStorage.saveEditorBuffer).toHaveBeenCalledWith(sampleEditorBuffer, "tab-abc");
  });
});

describe("clearEditorBuffer()", () => {
  it("delegates to StorageService.clearEditorBuffer() without fileKey", async () => {
    await getAppDataService().clearEditorBuffer();
    expect(mockStorage.clearEditorBuffer).toHaveBeenCalledWith(undefined);
  });

  it("passes fileKey to StorageService.clearEditorBuffer()", async () => {
    await getAppDataService().clearEditorBuffer("tab-abc");
    expect(mockStorage.clearEditorBuffer).toHaveBeenCalledWith("tab-abc");
  });
});

// -----------------------------------------------------------------------
// Session delegation
// -----------------------------------------------------------------------
describe("saveSession()", () => {
  it("delegates to StorageService.saveSession() with correct argument", async () => {
    await getAppDataService().saveSession(sampleSession);
    expect(mockStorage.saveSession).toHaveBeenCalledWith(sampleSession);
  });
});

describe("loadSession()", () => {
  it("delegates to StorageService.loadSession()", async () => {
    mockStorage.loadSession.mockResolvedValue(sampleSession);
    const result = await getAppDataService().loadSession();
    expect(mockStorage.loadSession).toHaveBeenCalledOnce();
    expect(result).toEqual(sampleSession);
  });

  it("returns null when no session is stored", async () => {
    mockStorage.loadSession.mockResolvedValue(null);
    const result = await getAppDataService().loadSession();
    expect(result).toBeNull();
  });
});
