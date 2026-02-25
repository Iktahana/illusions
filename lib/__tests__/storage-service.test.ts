/**
 * Unit tests for the StorageService factory pattern.
 *
 * Tests cover:
 * - Environment detection via isElectronEnvironment()
 * - Factory returns WebStorageProvider in browser environment
 * - Factory returns ElectronStorageProvider in Electron environment
 * - Singleton behavior of getStorageService()
 * - Reset functionality via resetStorageService()
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the storage-types module for isElectronEnvironment
let mockIsElectronValue = false;
vi.mock("@/lib/storage/storage-types", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/storage/storage-types")>();
  return {
    ...actual,
    isElectronEnvironment: () => mockIsElectronValue,
  };
});

// Mock web-storage to avoid Dexie/IndexedDB dependency
vi.mock("@/lib/storage/web-storage", () => {
  class MockWebStorageProvider {
    _provider = "web";
    initialize = vi.fn();
  }
  return { default: MockWebStorageProvider, WebStorageProvider: MockWebStorageProvider };
});

// Mock electron-storage to avoid window.electronAPI dependency
vi.mock("@/lib/storage/electron-storage", () => {
  class MockElectronStorageProvider {
    _provider = "electron";
    initialize = vi.fn();
  }
  return {
    default: MockElectronStorageProvider,
    ElectronStorageProvider: MockElectronStorageProvider,
  };
});

// Import after mocks are set up
import {
  createStorageService,
  getStorageService,
  resetStorageService,
} from "@/lib/storage/storage-service";

describe("StorageService factory", () => {
  beforeEach(() => {
    // Reset the singleton between tests
    resetStorageService();
    mockIsElectronValue = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // createStorageService()
  // -----------------------------------------------------------------------

  describe("createStorageService()", () => {
    it("returns WebStorageProvider when not in Electron environment", () => {
      mockIsElectronValue = false;

      const service = createStorageService();
      expect(
        (service as unknown as { _provider: string })._provider
      ).toBe("web");
    });

    it("returns ElectronStorageProvider when in Electron environment", () => {
      mockIsElectronValue = true;

      const service = createStorageService();
      expect(
        (service as unknown as { _provider: string })._provider
      ).toBe("electron");
    });
  });

  // -----------------------------------------------------------------------
  // getStorageService() — singleton
  // -----------------------------------------------------------------------

  describe("getStorageService()", () => {
    it("returns the same instance on repeated calls", () => {
      mockIsElectronValue = false;

      const a = getStorageService();
      const b = getStorageService();
      expect(a).toBe(b);
    });

    it("creates a new instance after resetStorageService()", () => {
      mockIsElectronValue = false;

      const a = getStorageService();
      resetStorageService();
      const b = getStorageService();

      expect(a).not.toBe(b);
    });
  });

  // -----------------------------------------------------------------------
  // resetStorageService()
  // -----------------------------------------------------------------------

  describe("resetStorageService()", () => {
    it("clears the cached singleton so next call creates fresh instance", () => {
      mockIsElectronValue = false;

      const first = getStorageService();
      resetStorageService();

      // Switch to Electron to prove a new provider type is selected
      mockIsElectronValue = true;
      const second = getStorageService();

      expect(
        (first as unknown as { _provider: string })._provider
      ).toBe("web");
      expect(
        (second as unknown as { _provider: string })._provider
      ).toBe("electron");
    });
  });
});
