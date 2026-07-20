/**
 * Unit tests for file-type-guard.ts (issue #1880).
 *
 * Verifies that:
 * - Binary formats (PDF, DOCX, PNG, JPEG, ZIP, …) are correctly rejected
 *   before they reach file.text() / writeFile, preventing UTF-8 corruption.
 * - Supported text formats (.mdi, .md, .txt) and bare filenames are allowed.
 */

import { describe, it, expect } from "vitest";
import { isTextDroppable, extractFileExtension, TEXT_EXTENSIONS } from "../file-type-guard";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal File-like object for testing.
 * The browser File constructor is not always available in Node/vitest, so we
 * use a plain object cast to File.
 */
function makeFile(name: string, type: string): File {
  return { name, type } as File;
}

// ---------------------------------------------------------------------------
// extractFileExtension
// ---------------------------------------------------------------------------

describe("extractFileExtension", () => {
  it("returns '' for filenames without a dot", () => {
    expect(extractFileExtension("README")).toBe("");
    expect(extractFileExtension("Makefile")).toBe("");
  });

  it("returns lowercased dotted extension", () => {
    expect(extractFileExtension("novel.mdi")).toBe(".mdi");
    expect(extractFileExtension("report.PDF")).toBe(".pdf");
    expect(extractFileExtension("image.PNG")).toBe(".png");
  });

  it("handles multiple dots — returns last segment", () => {
    expect(extractFileExtension("archive.tar.gz")).toBe(".gz");
    expect(extractFileExtension("file.backup.txt")).toBe(".txt");
  });
});

// ---------------------------------------------------------------------------
// TEXT_EXTENSIONS constant
// ---------------------------------------------------------------------------

describe("TEXT_EXTENSIONS", () => {
  it("includes .mdi, .md, .txt", () => {
    expect(TEXT_EXTENSIONS).toContain(".mdi");
    expect(TEXT_EXTENSIONS).toContain(".md");
    expect(TEXT_EXTENSIONS).toContain(".txt");
  });
});

// ---------------------------------------------------------------------------
// isTextDroppable — text files allowed
// ---------------------------------------------------------------------------

describe("isTextDroppable — text files", () => {
  it("allows .mdi files", () => {
    expect(isTextDroppable(makeFile("chapter1.mdi", "text/plain"))).toBe(true);
    expect(isTextDroppable(makeFile("chapter1.mdi", ""))).toBe(true);
  });

  it("allows .md files", () => {
    expect(isTextDroppable(makeFile("README.md", "text/markdown"))).toBe(true);
    expect(isTextDroppable(makeFile("README.md", ""))).toBe(true);
  });

  it("allows .txt files", () => {
    expect(isTextDroppable(makeFile("notes.txt", "text/plain"))).toBe(true);
    expect(isTextDroppable(makeFile("notes.txt", ""))).toBe(true);
  });

  it("allows bare filenames with no extension", () => {
    expect(isTextDroppable(makeFile("README", ""))).toBe(true);
    expect(isTextDroppable(makeFile("Makefile", "text/plain"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isTextDroppable — binary files rejected (extension check)
// ---------------------------------------------------------------------------

describe("isTextDroppable — binary formats rejected by extension", () => {
  it("rejects .pdf files", () => {
    expect(isTextDroppable(makeFile("document.pdf", "application/pdf"))).toBe(false);
    // Even when browser reports empty MIME type
    expect(isTextDroppable(makeFile("document.pdf", ""))).toBe(false);
  });

  it("rejects .docx files", () => {
    expect(
      isTextDroppable(
        makeFile(
          "report.docx",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
      ),
    ).toBe(false);
    expect(isTextDroppable(makeFile("report.docx", ""))).toBe(false);
  });

  it("rejects .doc files", () => {
    expect(isTextDroppable(makeFile("old.doc", "application/vnd.ms-word"))).toBe(false);
    expect(isTextDroppable(makeFile("old.doc", ""))).toBe(false);
  });

  it("rejects .xlsx files", () => {
    expect(
      isTextDroppable(
        makeFile("data.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
      ),
    ).toBe(false);
    expect(isTextDroppable(makeFile("data.xlsx", ""))).toBe(false);
  });

  it("rejects .png files", () => {
    expect(isTextDroppable(makeFile("cover.png", "image/png"))).toBe(false);
    expect(isTextDroppable(makeFile("cover.png", ""))).toBe(false);
  });

  it("rejects .jpg / .jpeg files", () => {
    expect(isTextDroppable(makeFile("photo.jpg", "image/jpeg"))).toBe(false);
    expect(isTextDroppable(makeFile("photo.jpeg", "image/jpeg"))).toBe(false);
    expect(isTextDroppable(makeFile("photo.jpg", ""))).toBe(false);
  });

  it("rejects .gif files", () => {
    expect(isTextDroppable(makeFile("anim.gif", "image/gif"))).toBe(false);
    expect(isTextDroppable(makeFile("anim.gif", ""))).toBe(false);
  });

  it("rejects .webp files", () => {
    expect(isTextDroppable(makeFile("image.webp", "image/webp"))).toBe(false);
    expect(isTextDroppable(makeFile("image.webp", ""))).toBe(false);
  });

  it("rejects .svg files", () => {
    // SVG has unknown extension from the allowlist perspective
    expect(isTextDroppable(makeFile("logo.svg", "image/svg+xml"))).toBe(false);
    // When browser returns empty MIME for .svg, extension is not in allowlist
    expect(isTextDroppable(makeFile("logo.svg", ""))).toBe(false);
  });

  it("rejects .mp3 / .mp4 files", () => {
    expect(isTextDroppable(makeFile("music.mp3", "audio/mpeg"))).toBe(false);
    expect(isTextDroppable(makeFile("video.mp4", "video/mp4"))).toBe(false);
  });

  it("rejects .zip files", () => {
    expect(isTextDroppable(makeFile("archive.zip", "application/zip"))).toBe(false);
    expect(isTextDroppable(makeFile("archive.zip", ""))).toBe(false);
  });

  it("rejects .exe files", () => {
    expect(isTextDroppable(makeFile("setup.exe", "application/octet-stream"))).toBe(false);
    expect(isTextDroppable(makeFile("setup.exe", ""))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isTextDroppable — binary MIME wins even for unknown extension
// ---------------------------------------------------------------------------

describe("isTextDroppable — binary MIME rejects unknown extensions", () => {
  it("rejects a file with no extension but binary MIME", () => {
    // Bare filename + image MIME → reject
    expect(isTextDroppable(makeFile("data", "image/png"))).toBe(false);
    expect(isTextDroppable(makeFile("blob", "application/octet-stream"))).toBe(false);
  });

  it("rejects a text-looking extension if MIME is clearly binary", () => {
    // .txt extension but MIME says PDF — MIME wins
    expect(isTextDroppable(makeFile("trick.txt", "application/pdf"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Minimum-viable reproduction from the issue
// ---------------------------------------------------------------------------

describe("issue #1880 minimal reproduction", () => {
  it("rejects the binary formats listed in the bug report", () => {
    const binaryFiles: Array<[string, string]> = [
      ["normal.pdf", "application/pdf"],
      ["document.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      ["image.png", "image/png"],
    ];
    for (const [name, type] of binaryFiles) {
      expect(isTextDroppable(makeFile(name, type))).toBe(false);
    }
  });

  it("allows supported text extensions through", () => {
    const textFiles: Array<[string, string]> = [
      ["novel.mdi", "text/plain"],
      ["notes.md", "text/markdown"],
      ["draft.txt", "text/plain"],
    ];
    for (const [name, type] of textFiles) {
      expect(isTextDroppable(makeFile(name, type))).toBe(true);
    }
  });
});
