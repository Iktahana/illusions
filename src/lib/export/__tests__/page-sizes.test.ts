import { describe, expect, it } from "vitest";
import { listPageSizes, resolvePrintProfile } from "@illusions-lab/mdi-export-profile";

import { MDI_VERTICAL_PRINT_DEFAULTS, PAGE_SIZE_CATEGORIES } from "../page-sizes";

describe("renderer-safe MDI publication metadata", () => {
  it("matches the installed upstream paper catalogue", () => {
    expect(PAGE_SIZE_CATEGORIES).toEqual([
      {
        name: "MDI 標準用紙サイズ",
        sizes: listPageSizes().map(({ key, label, widthMm, heightMm }) => ({
          key,
          label,
          width: widthMm,
          height: heightMm,
        })),
      },
    ]);
  });

  it("matches the installed upstream vertical publisher defaults", () => {
    const upstream = resolvePrintProfile({ layout: { system: "japanese-publisher" } }, "vertical");
    expect(MDI_VERTICAL_PRINT_DEFAULTS).toEqual({
      pageSize: upstream.pagination.pageSize,
      landscape: upstream.pagination.landscape,
      verticalWriting: upstream.typesetting.writingMode === "vertical",
      charsPerLine: upstream.pagination.charactersPerLine,
      linesPerPage: upstream.pagination.linesPerPage,
      margins: upstream.pagination.margins,
    });
  });
});
