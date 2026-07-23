import { describe, expect, it } from "vitest";

import { txtExportSuggestedName } from "../txt-export-filename";

describe("txtExportSuggestedName", () => {
  it.each([
    ["作品.mdi", "txt", "作品.txt"],
    ["作品.md", "txt-ruby", "作品_ruby.txt"],
    ["作品.txt", "narou", "作品_narou.txt"],
    ["作品", "kakuyomu", "作品_kakuyomu.txt"],
    ["作品", "aozora", "作品_aozora.txt"],
  ] as const)("maps %s and %s to %s", (title, format, expected) => {
    expect(txtExportSuggestedName(title, format)).toBe(expected);
  });

  it("removes path separators, control characters, and Windows-invalid suffixes", () => {
    expect(txtExportSuggestedName(" ../章<1>:\u0000. ", "txt")).toBe(".._章_1___.txt");
  });

  it.each(["", ".", "..", null, undefined])("uses a safe fallback for %s", (title) => {
    expect(txtExportSuggestedName(title, "txt")).toBe("untitled.txt");
  });

  it.each(["CON", "prn", "LPT9"])("escapes the Windows reserved name %s", (title) => {
    expect(txtExportSuggestedName(title, "txt")).toBe(`${title}_.txt`);
  });

  it("limits the default basename without splitting Unicode code points", () => {
    const name = txtExportSuggestedName("😀".repeat(200), "txt");
    expect(Array.from(name.replace(/\.txt$/, ""))).toHaveLength(120);
    expect(name).not.toContain("�");
  });
});
