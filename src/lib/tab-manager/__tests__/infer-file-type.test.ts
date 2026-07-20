/**
 * Regression tests for inferFileType (issues #1887 / #1871).
 *
 * #1887: upper-case and mixed-case extensions (.MD, .TXT, .Md, .Txt) must
 * NOT fall through to ".mdi", which would enable MDI parsing and transform
 * the file content.
 *
 * #1871: Save As fileType must be re-derived from the new filename; tested
 * via executeTabSave in save-executor.test.ts.
 */

import { describe, it, expect } from "vitest";
import { inferFileType } from "@/lib/tab-manager/types";

describe("inferFileType — case-insensitive extension detection (#1887)", () => {
  // .md variants
  it("lower-case .md → .md", () => {
    expect(inferFileType("story.md")).toBe(".md");
  });
  it("upper-case .MD → .md (was broken: returned .mdi)", () => {
    expect(inferFileType("story.MD")).toBe(".md");
  });
  it("mixed-case .Md → .md", () => {
    expect(inferFileType("story.Md")).toBe(".md");
  });
  it("mixed-case .mD → .md", () => {
    expect(inferFileType("story.mD")).toBe(".md");
  });

  // .txt variants
  it("lower-case .txt → .txt", () => {
    expect(inferFileType("notes.txt")).toBe(".txt");
  });
  it("upper-case .TXT → .txt (was broken: returned .mdi)", () => {
    expect(inferFileType("notes.TXT")).toBe(".txt");
  });
  it("mixed-case .Txt → .txt", () => {
    expect(inferFileType("notes.Txt")).toBe(".txt");
  });
  it("mixed-case .tXt → .txt", () => {
    expect(inferFileType("notes.tXt")).toBe(".txt");
  });

  // .mdi variants — all map to .mdi
  it("lower-case .mdi → .mdi", () => {
    expect(inferFileType("novel.mdi")).toBe(".mdi");
  });
  it("upper-case .MDI → .mdi", () => {
    expect(inferFileType("novel.MDI")).toBe(".mdi");
  });
  it("mixed-case .Mdi → .mdi", () => {
    expect(inferFileType("novel.Mdi")).toBe(".mdi");
  });

  // Unknown extensions fall back to .mdi
  it("unknown extension → .mdi (default)", () => {
    expect(inferFileType("file.docx")).toBe(".mdi");
  });
  it("no extension → .mdi (default)", () => {
    expect(inferFileType("README")).toBe(".mdi");
  });

  // Dotfiles and edge cases
  it("filename with dots before extension → correct type", () => {
    expect(inferFileType("my.story.v2.txt")).toBe(".txt");
  });
  it("filename with dots before extension → .md", () => {
    expect(inferFileType("my.story.v2.MD")).toBe(".md");
  });
});
