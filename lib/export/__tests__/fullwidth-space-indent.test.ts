import { describe, it, expect } from "vitest";
import { unzipSync, strFromU8 } from "fflate";

import { mdiToPlainText, mdiToRubyText } from "../txt-exporter";
import { mdiToHtml } from "../mdi-to-html";
import { generateDocxBlob } from "../docx-exporter";
import { DEFAULT_DOCX_SETTINGS } from "../docx-export-settings";
import {
  DEFAULT_EXPORT_SETTINGS,
  toPdfExportSettings,
  toDocxExportSettings,
} from "../export-settings";
import {
  fullwidthIndentCount,
  fullwidthIndentPrefix,
  FULLWIDTH_SPACE,
} from "../fullwidth-indent";

const U3000 = "　";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

describe("fullwidth-indent helpers", () => {
  it("FULLWIDTH_SPACE is U+3000", () => {
    expect(FULLWIDTH_SPACE).toBe(U3000);
    expect(FULLWIDTH_SPACE.charCodeAt(0)).toBe(0x3000);
  });

  it("fullwidthIndentCount rounds em values and floors at 0", () => {
    expect(fullwidthIndentCount(1)).toBe(1);
    expect(fullwidthIndentCount(1.5)).toBe(2);
    expect(fullwidthIndentCount(0.4)).toBe(0);
    expect(fullwidthIndentCount(0)).toBe(0);
    expect(fullwidthIndentCount(-3)).toBe(0);
    expect(fullwidthIndentCount(Number.NaN)).toBe(0);
  });

  it("fullwidthIndentPrefix repeats the space and returns empty at 0", () => {
    expect(fullwidthIndentPrefix(0)).toBe("");
    expect(fullwidthIndentPrefix(1)).toBe(U3000);
    expect(fullwidthIndentPrefix(3)).toBe(U3000 + U3000 + U3000);
  });
});

// ---------------------------------------------------------------------------
// TXT export
// ---------------------------------------------------------------------------

describe("TXT export — fullwidth-space 字下げ", () => {
  it("prepends one full-width space to each paragraph line", () => {
    // toExportText collapses the blank line between paragraphs into a single
    // newline for Japanese typesetting, so both lines are non-empty content.
    const out = mdiToPlainText("一行目\n\n二行目", ".mdi", {
      fullwidthSpaceIndent: true,
      indentCount: 1,
    });
    expect(out).toBe(`${U3000}一行目\n${U3000}二行目`);
  });

  it("never prefixes a genuinely empty line", () => {
    // Direct check on the line-level guard: leading content + empty line.
    const out = mdiToPlainText(".md blank line\n\n\n\nafter", ".md", {
      fullwidthSpaceIndent: true,
      indentCount: 1,
    });
    // No line should be just the prefix (empty lines stay empty).
    for (const line of out.split("\n")) {
      expect(line).not.toBe(U3000);
    }
  });

  it("honors the requested count", () => {
    const out = mdiToPlainText("本文", ".mdi", {
      fullwidthSpaceIndent: true,
      indentCount: 3,
    });
    expect(out).toBe(`${U3000}${U3000}${U3000}本文`);
  });

  it("does nothing when disabled (legacy behavior)", () => {
    const out = mdiToPlainText("本文", ".mdi", {
      fullwidthSpaceIndent: false,
      indentCount: 2,
    });
    expect(out).toBe("本文");
  });

  it("does nothing when no options are passed", () => {
    expect(mdiToPlainText("本文")).toBe("本文");
  });

  it("applies to ruby export too", () => {
    const out = mdiToRubyText("{漢字|かんじ}", ".mdi", {
      fullwidthSpaceIndent: true,
      indentCount: 1,
    });
    expect(out).toBe(`${U3000}漢字（かんじ）`);
  });
});

// ---------------------------------------------------------------------------
// PDF / print (mdiToHtml) injection
// ---------------------------------------------------------------------------

describe("PDF export — fullwidth-space injection into <p>", () => {
  it("prepends full-width spaces to each non-empty paragraph", () => {
    const html = mdiToHtml("A\n\nB", { bodyOnly: true, fullwidthSpaceIndentCount: 1 });
    expect(html).toContain(`<p>${U3000}A</p>`);
    expect(html).toContain(`<p>${U3000}B</p>`);
  });

  it("leaves [[blank]] paragraphs untouched", () => {
    const html = mdiToHtml("A\n\n[[blank]]\n\nB", {
      bodyOnly: true,
      fullwidthSpaceIndentCount: 1,
    });
    expect(html).toContain("<p></p>");
    expect(html).not.toContain(`<p>${U3000}</p>`);
    expect(html).toContain(`<p>${U3000}A</p>`);
  });

  it("injects the requested number of spaces", () => {
    const html = mdiToHtml("A", { bodyOnly: true, fullwidthSpaceIndentCount: 2 });
    expect(html).toContain(`<p>${U3000}${U3000}A</p>`);
  });

  it("does not inject when count is 0 / absent", () => {
    expect(mdiToHtml("A", { bodyOnly: true, fullwidthSpaceIndentCount: 0 })).toContain("<p>A</p>");
    expect(mdiToHtml("A", { bodyOnly: true })).toContain("<p>A</p>");
  });
});

// ---------------------------------------------------------------------------
// DOCX export
// ---------------------------------------------------------------------------

async function docxDocumentXml(content: string, fullwidthSpaceIndent: boolean): Promise<string> {
  const blob = await generateDocxBlob(content, {
    metadata: { title: "t", language: "ja" },
    settings: { ...DEFAULT_DOCX_SETTINGS, textIndent: 1, fullwidthSpaceIndent },
    fileType: ".mdi",
  });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const files = unzipSync(bytes);
  return strFromU8(files["word/document.xml"]);
}

// ---------------------------------------------------------------------------
// Unified settings
// ---------------------------------------------------------------------------

describe("export settings — fullwidth-space fields", () => {
  it("defaults are all off / count 1", () => {
    expect(DEFAULT_EXPORT_SETTINGS.fullwidthSpaceIndent).toBe(false);
    expect(DEFAULT_EXPORT_SETTINGS.txtFullwidthSpaceIndent).toBe(false);
    expect(DEFAULT_EXPORT_SETTINGS.txtIndentCount).toBe(1);
  });

  it("toPdfExportSettings carries fullwidthSpaceIndent", () => {
    const pdf = toPdfExportSettings({ ...DEFAULT_EXPORT_SETTINGS, fullwidthSpaceIndent: true });
    expect(pdf.fullwidthSpaceIndent).toBe(true);
  });

  it("toDocxExportSettings carries fullwidthSpaceIndent", () => {
    const docx = toDocxExportSettings({ ...DEFAULT_EXPORT_SETTINGS, fullwidthSpaceIndent: true });
    expect(docx.fullwidthSpaceIndent).toBe(true);
  });
});

describe("DOCX export — fullwidth-space 字下げ", () => {
  it("prepends full-width space to paragraph text and zeroes firstLine indent", async () => {
    const xml = await docxDocumentXml("本文一", true);
    expect(xml).toContain(`${U3000}本文一`);
    expect(xml).toContain('w:firstLine="0"');
  });

  it("uses the Word firstLine indent (no literal space) when disabled", async () => {
    const xml = await docxDocumentXml("本文一", false);
    // 1em at 12pt = 240 twips
    expect(xml).toContain('w:firstLine="240"');
    expect(xml).not.toContain(`${U3000}本文一`);
  });
});
