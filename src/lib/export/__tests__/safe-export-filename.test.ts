import { describe, expect, it } from "vitest";

import { safeExportBaseName } from "../safe-export-filename";

describe("safeExportBaseName", () => {
  it.each([
    ["作品.mdi", "作品"],
    ["作品.md", "作品"],
    ["作品.txt", "作品"],
    ["作品", "作品"],
  ])("normalizes %s to %s", (title, expected) => {
    expect(safeExportBaseName(title)).toBe(expected);
  });

  it("removes path separators, controls, and Windows-invalid suffixes", () => {
    expect(safeExportBaseName(" ../章<1>:\u0000. ")).toBe(".._章_1___");
  });

  it.each(["", ".", "..", null, undefined])("uses a safe fallback for %s", (title) => {
    expect(safeExportBaseName(title)).toBe("untitled");
  });

  it.each(["CON", "prn", "LPT9"])("escapes the Windows reserved name %s", (title) => {
    expect(safeExportBaseName(title)).toBe(`${title}_`);
  });

  it("limits the basename without splitting Unicode code points", () => {
    const name = safeExportBaseName("😀".repeat(200));
    expect(Array.from(name)).toHaveLength(120);
    expect(name).not.toContain("�");
  });
});
