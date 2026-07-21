import { describe, expect, it } from "vitest";
import { renderHtmlWithDiagnostics } from "@illusions-lab/mdi";
import { resolvePrintProfile } from "@illusions-lab/mdi-export-profile";

import { exportMdiText } from "../txt-exporter";
import { normalizeExportSource, toExportProfile } from "../mdi-export";
import { DEFAULT_EXPORT_SETTINGS } from "../export-settings";

const source = "# 見出し\n\n{漢字|かんじ}と^12^月。\n\n[[blank]]\n\n次。";

describe("@illusions-lab/mdi export boundary", () => {
  it.each([
    ["txt", "見出し\n　漢字と12月。\n\n　次。"],
    ["txt-ruby", "見出し\n　{漢字|かんじ}と12月。\n\n　次。"],
    ["narou", "見出し\n　｜漢字《かんじ》と12月。\n\n　次。"],
    ["kakuyomu", "見出し\n　｜漢字《かんじ》と12月。\n\n　次。"],
    ["aozora", "見出し［＃「見出し」は大見出し］\r\n　｜漢字《かんじ》と12月。\r\n\r\n　次。"],
  ] as const)("renders the exact upstream %s text convention", async (format, expected) => {
    await expect(
      exportMdiText(source, format, ".mdi", {
        fullwidthSpaceIndent: true,
        indentCount: 1,
      }),
    ).resolves.toBe(expected);
  });

  it("normalizes escaped MDI blank macros without rewriting raw Markdown/TXT source", () => {
    const editorOutput = String.raw`前。\n\n\[\[blank]]\n\n後。`;
    expect(normalizeExportSource(editorOutput, ".mdi")).toBe(String.raw`前。\n\n[[blank]]\n\n後。`);
    expect(normalizeExportSource(editorOutput, ".md")).toBe(editorOutput);
    expect(normalizeExportSource(editorOutput, ".txt")).toBe(editorOutput);
  });

  it("retains Rust diagnostics and headings for HTML consumers", () => {
    const result = renderHtmlWithDiagnostics(normalizeExportSource(source), { bodyOnly: true });
    expect(result.diagnostics).toEqual([]);
    expect(result.headings).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: "見出し" })]),
    );
    expect(result.output).toContain('<ruby class="mdi-ruby">');
    expect(result.output).toContain('<p class="mdi-blank"></p>');
  });

  it("uses the upstream japanese-publisher defaults", () => {
    const profile = toExportProfile(DEFAULT_EXPORT_SETTINGS, { title: "テスト", language: "ja" });
    const resolved = resolvePrintProfile(profile, "vertical");
    expect(resolved.layout.system).toBe("japanese-publisher");
    expect(resolved.pagination.pageSize).toBeDefined();
  });
});
