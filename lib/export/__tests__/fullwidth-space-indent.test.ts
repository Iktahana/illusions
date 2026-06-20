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
import { fullwidthIndentCount, fullwidthIndentPrefix, FULLWIDTH_SPACE } from "../fullwidth-indent";

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

  it("is a no-op when indentCount is 0 even if enabled (defensive)", () => {
    const out = mdiToPlainText("本文", ".mdi", {
      fullwidthSpaceIndent: true,
      indentCount: 0,
    });
    expect(out).toBe("本文");
  });

  it("prefixes every flattened content line uniformly (headings included)", () => {
    // TXT is flattened, so a former heading line is indistinguishable from body
    // and receives the same 字下げ — this documents that intended behavior.
    const out = mdiToPlainText("# 章題\n\n本文", ".mdi", {
      fullwidthSpaceIndent: true,
      indentCount: 1,
    });
    expect(out).toBe(`${U3000}章題\n${U3000}本文`);
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

  it("does not prefix headings (only <p>)", () => {
    const html = mdiToHtml("# 章題\n\n本文", { bodyOnly: true, fullwidthSpaceIndentCount: 1 });
    expect(html).toContain(`<p>${U3000}本文</p>`);
    expect(html).toMatch(/<h1[^>]*>章題<\/h1>/);
    expect(html).not.toContain(`>${U3000}章題`);
  });

  it("places the prefix before inline markup", () => {
    const html = mdiToHtml("**強調**", { bodyOnly: true, fullwidthSpaceIndentCount: 1 });
    expect(html).toContain(`<p>${U3000}<strong>強調</strong></p>`);
  });

  it("combined: full-width injection + suppressed CSS text-indent (no double indent)", () => {
    // Mirrors what pdf-exporter/web-print-preview emit when the toggle is on:
    // textIndentEm forced to 0 and the literal spaces injected instead.
    const html = mdiToHtml("本文", {
      typesetting: { textIndentEm: 0, pageSize: "A4", landscape: false },
      fullwidthSpaceIndentCount: 1,
    });
    expect(html).toContain(`<p>${U3000}本文</p>`);
    expect(html).not.toContain("text-indent");
  });
});

// ---------------------------------------------------------------------------
// DOCX export
// ---------------------------------------------------------------------------

async function docxDocumentXml(
  content: string,
  fullwidthSpaceIndent: boolean,
  textIndent = 1,
): Promise<string> {
  const blob = await generateDocxBlob(content, {
    metadata: { title: "t", language: "ja" },
    settings: { ...DEFAULT_DOCX_SETTINGS, textIndent, fullwidthSpaceIndent },
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

  it("does not prefix headings (only body paragraphs)", async () => {
    const xml = await docxDocumentXml("# 章題\n\n本文一", true);
    expect(xml).toContain(`${U3000}本文一`);
    // The heading text must not gain a leading full-width space.
    expect(xml).toContain("章題");
    expect(xml).not.toContain(`${U3000}章題`);
  });

  it("does not prefix [[blank]] paragraphs", async () => {
    const xml = await docxDocumentXml("本文一\n\n[[blank]]\n\n本文二", true);
    expect(xml).not.toContain(`${U3000}${U3000}`); // no doubled prefix from a stray blank
    // The blank paragraph stays empty (no run text at all for it).
    expect(xml).toContain(`${U3000}本文一`);
    expect(xml).toContain(`${U3000}本文二`);
  });

  it("keeps the prefix before inline markup (bold)", async () => {
    const xml = await docxDocumentXml("**強調**", true);
    // The full-width space is emitted as its own leading run (<w:t>　</w:t>),
    // immediately before the bold run (<w:b/> … 強調).
    expect(xml).toContain(`<w:t xml:space="preserve">${U3000}</w:t>`);
    expect(xml).toMatch(/<w:b\/>[\s\S]*強調/);
  });

  it("toggle on with 0 indent: no prefix and firstLine zeroed (replace semantics)", async () => {
    const xml = await docxDocumentXml("本文一", true, 0);
    expect(xml).not.toContain(`${U3000}本文一`);
    expect(xml).toContain('w:firstLine="0"');
  });
});
