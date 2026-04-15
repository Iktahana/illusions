/**
 * save-blob-file unit tests
 *
 * Tests for the shared file-save helper covering:
 * - Blob URL download (core Web path — always fires, no cancel signal)
 * - Electron TXT save via IPC (cancel returns false, error throws)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { saveBlobFile } from "../save-blob-file";

// Mock DOM APIs
const mockCreateObjectURL = vi.fn(() => "blob:mock-url");
const mockRevokeObjectURL = vi.fn();
const mockClick = vi.fn();

beforeEach(() => {
  mockCreateObjectURL.mockClear();
  mockRevokeObjectURL.mockClear();
  mockClick.mockClear();

  vi.stubGlobal("URL", {
    createObjectURL: mockCreateObjectURL,
    revokeObjectURL: mockRevokeObjectURL,
  });

  const mockAnchor = {
    href: "",
    download: "",
    click: mockClick,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.spyOn(document, "createElement").mockReturnValue(mockAnchor as any);
  vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);
  vi.spyOn(document.body, "removeChild").mockImplementation((node) => node);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("saveBlobFile", () => {
  const blob = new Blob(["test content"], { type: "text/plain" });

  describe("Web: Blob URL download", () => {
    it("downloads via Blob URL and returns true", async () => {
      const result = await saveBlobFile(blob, "test.txt", false);

      expect(result).toBe(true);
      expect(mockCreateObjectURL).toHaveBeenCalledWith(blob);
      expect(mockClick).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    });
  });

  describe("Electron: TXT save via IPC", () => {
    const mockSaveFile = vi.fn();

    beforeEach(() => {
      vi.stubGlobal("window", {
        ...window,
        electronAPI: { saveFile: mockSaveFile },
      });
    });

    it("returns false when user cancels the save dialog", async () => {
      mockSaveFile.mockResolvedValue(null);

      const result = await saveBlobFile(blob, "test.txt", true, ".txt");

      expect(result).toBe(false);
      expect(mockSaveFile).toHaveBeenCalledWith(null, "test content", ".txt");
      expect(mockClick).not.toHaveBeenCalled();
    });

    it("returns true on successful save", async () => {
      mockSaveFile.mockResolvedValue("/path/to/test.txt");

      const result = await saveBlobFile(blob, "test.txt", true, ".txt");

      expect(result).toBe(true);
      expect(mockClick).not.toHaveBeenCalled();
    });

    it("throws on IPC error result", async () => {
      mockSaveFile.mockResolvedValue({ success: false, error: "disk full" });

      await expect(saveBlobFile(blob, "test.txt", true, ".txt")).rejects.toThrow("disk full");
    });
  });
});
