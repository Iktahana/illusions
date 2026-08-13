/**
 * Unit tests for the StorageService factory pattern.
 *
 * Tests cover:
 * - Factory always returns ElectronStorageProvider
 * - Singleton behavior of getStorageService()
 * - Reset functionality via resetStorageService()
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock electron-storage to avoid window.electronAPI dependency
vi.mock("@/platform/electron-renderer/storage", () => {
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // createStorageService()
  // -----------------------------------------------------------------------

  describe("createStorageService()", () => {
    it("returns ElectronStorageProvider", () => {
      const service = createStorageService();
      expect((service as unknown as { _provider: string })._provider).toBe("electron");
    });
  });

  // -----------------------------------------------------------------------
  // getStorageService() — singleton
  // -----------------------------------------------------------------------

  describe("getStorageService()", () => {
    it("returns the same instance on repeated calls", () => {
      const a = getStorageService();
      const b = getStorageService();
      expect(a).toBe(b);
    });

    it("creates a new instance after resetStorageService()", () => {
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
      const first = getStorageService();
      resetStorageService();

      const second = getStorageService();

      expect((first as unknown as { _provider: string })._provider).toBe("electron");
      expect((second as unknown as { _provider: string })._provider).toBe("electron");
      expect(first).not.toBe(second);
    });
  });
});
