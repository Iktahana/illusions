import { describe, expect, it } from "vitest";
import {
  EDITABLE_EXTENSIONS,
  extractExtension,
  isEditableExtension,
  resolveNativePath,
} from "@/lib/tab-manager/open-with-default-app";

describe("extractExtension", () => {
  it("returns the lowercased dotted extension", () => {
    expect(extractExtension("dir/report.DOCX")).toBe(".docx");
    expect(extractExtension("a/b/c.mdi")).toBe(".mdi");
    expect(extractExtension("notes.tar.gz")).toBe(".gz");
  });

  it("returns empty string when there is no extension", () => {
    expect(extractExtension("dir/README")).toBe("");
    expect(extractExtension("LICENSE")).toBe("");
  });
});

describe("isEditableExtension", () => {
  it("treats the editor extensions as editable", () => {
    for (const ext of EDITABLE_EXTENSIONS) {
      expect(isEditableExtension(`file${ext}`)).toBe(true);
    }
  });

  it("treats unsupported extensions as non-editable (delegate to OS)", () => {
    expect(isEditableExtension("paper.docx")).toBe(false);
    expect(isEditableExtension("scan.pdf")).toBe(false);
    expect(isEditableExtension("sheet.xlsx")).toBe(false);
    expect(isEditableExtension("doc.gdoc")).toBe(false);
  });

  it("treats extensionless files as editable text", () => {
    expect(isEditableExtension("project/README")).toBe(true);
  });
});

describe("resolveNativePath", () => {
  it("passes through POSIX absolute paths", () => {
    expect(resolveNativePath("/Users/me/doc.pdf", "/root")).toBe("/Users/me/doc.pdf");
  });

  it("passes through Windows drive-letter paths", () => {
    expect(resolveNativePath("C:/Users/me/doc.pdf", "D:/root")).toBe("C:/Users/me/doc.pdf");
    expect(resolveNativePath("C:\\Users\\me\\doc.pdf", null)).toBe("C:\\Users\\me\\doc.pdf");
  });

  it("joins relative paths onto the root", () => {
    expect(resolveNativePath("sub/doc.pdf", "/root")).toBe("/root/sub/doc.pdf");
  });

  it("returns null for a relative path with no open root", () => {
    expect(resolveNativePath("sub/doc.pdf", null)).toBeNull();
  });
});
