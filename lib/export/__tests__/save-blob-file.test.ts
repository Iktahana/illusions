/**
 * save-blob-file unit tests
 *
 * Tests for the shared file-save helper covering:
 * - Blob URL download fallback (core Web DOCX path)
 * - User cancel handling (AbortError from showSaveFilePicker)
 * - Gesture expiry degradation (NotAllowedError/SecurityError → Blob URL fallback)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { saveBlobFile } from "../save-blob-file";

// Mock DOM APIs
const mockCreateObjectURL = vi.fn(() => "blob:mock-url");
const mockRevokeObjectURL = vi.fn();
const mockClick = vi.fn();

beforeEach(() => {
  // Clear call history on standalone vi.fn() mocks (vi.restoreAllMocks only clears spies)
  mockCreateObjectURL.mockClear();
  mockRevokeObjectURL.mockClear();
  mockClick.mockClear();

  vi.stubGlobal("URL", {
    createObjectURL: mockCreateObjectURL,
    revokeObjectURL: mockRevokeObjectURL,
  });

  // Mock document.createElement to return a controllable <a> element
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
  // Clean up showSaveFilePicker from window if set by a test
  delete (window as unknown as Record<string, unknown>).showSaveFilePicker;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("saveBlobFile", () => {
  const blob = new Blob(["test content"], { type: "text/plain" });
  const accept = { "text/plain": [".txt"] };

  describe("Blob URL download fallback", () => {
    it("downloads via Blob URL when File System Access API is absent", async () => {
      // No showSaveFilePicker on window
      const result = await saveBlobFile(blob, "test.txt", accept, false);

      expect(result).toBe(true);
      expect(mockCreateObjectURL).toHaveBeenCalledWith(blob);
      expect(mockClick).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    });
  });

  describe("File System Access API", () => {
    it("returns false on user cancel (AbortError)", async () => {
      const error = new DOMException("User cancelled", "AbortError");
      // Assign directly to window so `"showSaveFilePicker" in window` works in jsdom
      (window as unknown as Record<string, unknown>).showSaveFilePicker = vi
        .fn()
        .mockRejectedValue(error);

      const result = await saveBlobFile(blob, "test.txt", accept, false);

      expect(result).toBe(false);
      // Should NOT fall through to download
      expect(mockClick).not.toHaveBeenCalled();
    });

    it("falls through to Blob URL on NotAllowedError (gesture expired)", async () => {
      const error = new DOMException("Gesture required", "NotAllowedError");
      (window as unknown as Record<string, unknown>).showSaveFilePicker = vi
        .fn()
        .mockRejectedValue(error);

      const result = await saveBlobFile(blob, "test.txt", accept, false);

      expect(result).toBe(true);
      expect(mockCreateObjectURL).toHaveBeenCalledWith(blob);
      expect(mockClick).toHaveBeenCalled();
    });

    it("falls through to Blob URL on SecurityError (permission denied)", async () => {
      const error = new DOMException("Permission denied", "SecurityError");
      (window as unknown as Record<string, unknown>).showSaveFilePicker = vi
        .fn()
        .mockRejectedValue(error);

      const result = await saveBlobFile(blob, "test.txt", accept, false);

      expect(result).toBe(true);
      expect(mockClick).toHaveBeenCalled();
    });

    it("re-throws unexpected errors", async () => {
      const error = new TypeError("Unexpected error");
      (window as unknown as Record<string, unknown>).showSaveFilePicker = vi
        .fn()
        .mockRejectedValue(error);

      await expect(saveBlobFile(blob, "test.txt", accept, false)).rejects.toThrow(
        "Unexpected error",
      );
    });
  });
});
