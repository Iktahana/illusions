/**
 * EPUB shared template generator unit tests
 *
 * Focuses on the content.opf spine, which controls page-progression
 * direction for Japanese vertical writing (must be rtl).
 */

import { describe, it, expect } from "vitest";
import { buildEpubFiles } from "../epub-shared";

function getOpf(content: string, verticalWriting: boolean): string {
  const files = buildEpubFiles(content, {
    metadata: { title: "テスト小説", language: "ja" },
    verticalWriting,
  });
  const opf = files.get("OEBPS/content.opf");
  expect(typeof opf).toBe("string");
  return opf as string;
}

describe("buildEpubFiles content.opf spine", () => {
  it("adds page-progression-direction=rtl for vertical writing", () => {
    const opf = getOpf("# 第一章\n\n縦書き本文です。", true);
    expect(opf).toContain('<spine page-progression-direction="rtl">');
  });

  it("omits page-progression-direction for horizontal writing", () => {
    const opf = getOpf("# 第一章\n\n横書き本文です。", false);
    expect(opf).toContain("<spine>");
    expect(opf).not.toContain("page-progression-direction");
  });

  it("still emits vertical-rl writing-mode in the stylesheet when vertical", () => {
    const files = buildEpubFiles("本文", {
      metadata: { title: "テスト", language: "ja" },
      verticalWriting: true,
    });
    const css = files.get("OEBPS/style.css") as string;
    expect(css).toContain("writing-mode: vertical-rl");
  });
});
