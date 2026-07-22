import { describe, expect, it } from "vitest";

import { docxExportProfile } from "../docx-exporter";
import { DEFAULT_EXPORT_SETTINGS } from "../export-settings";

describe("DOCX export profile", () => {
  it("preserves the unified characters-per-line and lines-per-page settings", () => {
    const profile = docxExportProfile({
      metadata: { title: "組版テスト", author: "著者" },
      settings: {
        ...DEFAULT_EXPORT_SETTINGS,
        pageSize: "Bunko",
        landscape: false,
        verticalWriting: true,
        charsPerLine: 33,
        linesPerPage: 22,
        margins: { top: 11, right: 12, bottom: 13, left: 14 },
        fontFamily: "yu-mincho",
        textIndent: 2,
        fullwidthSpaceIndent: true,
        showPageNumbers: true,
        pageNumberFormat: "fraction",
        pageNumberPosition: "top-right",
      },
    });

    expect(profile.metadata).toMatchObject({ title: "組版テスト", author: "著者" });
    expect(profile.typesetting).toMatchObject({
      writingMode: "vertical",
      fontFamily: "Yu Mincho",
      textIndentEm: 2,
      fullwidthSpaceIndent: true,
    });
    expect(profile.pagination).toMatchObject({
      pageSize: "Bunko",
      landscape: false,
      charactersPerLine: 33,
      linesPerPage: 22,
      margins: { top: 11, right: 12, bottom: 13, left: 14 },
      pageNumbers: { enabled: true, format: "fraction", position: "top-right" },
    });
  });

  it("fills omitted partial settings from the upstream-backed unified defaults", () => {
    const profile = docxExportProfile({
      metadata: { title: "既定値" },
      settings: { charsPerLine: 28 },
    });

    expect(profile.pagination?.charactersPerLine).toBe(28);
    expect(profile.pagination?.linesPerPage).toBe(DEFAULT_EXPORT_SETTINGS.linesPerPage);
    expect(profile.typesetting?.fontFamily).toBe("Yu Mincho");
  });
});
