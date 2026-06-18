import { describe, it, expect } from "vitest";
import {
  MdiDocument,
  MDI_BLANK_MARKER,
  isMdiBlankParagraphLine,
  stripMdiBlankMarkers,
} from "../mdi-document";

describe("MdiDocument — typed derivations (#1449)", () => {
  const RAW = "A段落\n\n[[blank]]\n\nB段落";

  it("toRawText preserves markers verbatim", () => {
    expect(MdiDocument.fromRawText(RAW).toRawText()).toBe(RAW);
  });

  it("toEditorContent preserves markers verbatim (AST conversion is remarkMdiBlankPlugin's job)", () => {
    expect(MdiDocument.fromRawText(RAW).toEditorContent()).toBe(RAW);
  });

  it("toAnalysisText removes [[blank]] marker lines", () => {
    expect(MdiDocument.fromRawText(RAW).toAnalysisText()).toBe("A段落\n\n\n\nB段落");
  });

  it("toAnalysisText keeps inline MDI syntax (analysis outputs must not change)", () => {
    const doc = MdiDocument.fromRawText("{漢字|かんじ}と^12^月\n\n[[blank]]");
    expect(doc.toAnalysisText()).toBe("{漢字|かんじ}と^12^月\n\n");
  });

  // Regression: in-app analysis/statistics panels (語彙統計 / 登場人物 / 読みやすさ)
  // feed the LIVE editor buffer through `fromRawText().toAnalysisText()`. That
  // buffer is the Milkdown serializer output, where the marker is escaped to
  // `\[\[blank]]` (CommonMark escapes the leading `[`). The marker must still be
  // stripped so kuromoji never tokenizes "blank" into the word-frequency list.
  it("toAnalysisText strips the serializer-escaped marker \\[\\[blank]] (analysis leak fix)", () => {
    const escaped = "A段落\n\n\\[\\[blank]]\n\nB段落";
    const out = MdiDocument.fromRawText(escaped).toAnalysisText();
    expect(out).not.toContain("blank");
    expect(out).toBe("A段落\n\n\n\nB段落");
  });

  it("toAnalysisText strips the fully-escaped marker \\[\\[blank\\]\\]", () => {
    expect(MdiDocument.fromRawText("\\[\\[blank\\]\\]").toAnalysisText()).not.toContain("blank");
  });

  it("toAnalysisText preserves an inline escaped occurrence (not a whole-line marker)", () => {
    const inline = "foo \\[\\[blank]] bar";
    expect(MdiDocument.fromRawText(inline).toAnalysisText()).toBe(inline);
  });

  it("toExportText('txt') flattens syntax and turns markers into forced blank lines", () => {
    const txt = MdiDocument.fromRawText(RAW).toExportText("txt");
    expect(txt).not.toContain("[[blank]]");
    expect(txt).toBe("A段落\n\nB段落");
  });

  it("toExportText('txt-ruby') renders ruby in fullwidth parens", () => {
    const txt =
      MdiDocument.fromRawText("{漢字|かんじ}の{東京|とう.きょう}").toExportText("txt-ruby");
    expect(txt).toBe("漢字（かんじ）の東京（とうきょう）");
  });
});

describe("MdiDocument.fromEditorOutput — editor serializer normalization", () => {
  const MDI = { fileType: ".mdi" };

  it("(.mdi) standalone <br /> → [[blank]] marker", () => {
    expect(MdiDocument.fromEditorOutput("<br />", MDI).toRawText()).toBe("[[blank]]");
  });

  it("(.mdi) serializer-escaped \\[\\[blank]] is recovered to [[blank]]", () => {
    expect(MdiDocument.fromEditorOutput("\\[\\[blank]]", MDI).toRawText()).toBe("[[blank]]");
  });

  it("(.md) skips marker recovery and blank conversion", () => {
    expect(MdiDocument.fromEditorOutput("<br />", { fileType: ".md" }).toRawText()).toBe("\n");
    expect(MdiDocument.fromEditorOutput("\\[\\[blank]]", { fileType: ".md" }).toRawText()).toBe(
      "\\[\\[blank]]",
    );
  });

  it("strips editor-injected paired HTML tags, keeps content", () => {
    expect(MdiDocument.fromEditorOutput("<p>本文</p>", MDI).toRawText()).toBe("本文");
  });
});

describe("[[blank]] literal typed by the user — defined semantics (#1449)", () => {
  // Documented behavior (pinned, not changed by the refactor):
  // a line consisting solely of "[[blank]]" is ALWAYS a marker. A user who
  // literally types it gets a forced blank paragraph, and no derivation or
  // exporter outputs the literal. There is no surviving escape on .mdi save
  // because fromEditorOutput un-escapes \[\[blank]] back to the marker.
  it("own-line literal is indistinguishable from a marker: analysis drops it", () => {
    const userTyped = "前の文。\n\n[[blank]]\n\n次の文。";
    expect(MdiDocument.fromRawText(userTyped).toAnalysisText()).not.toContain("[[blank]]");
  });

  it("own-line literal is indistinguishable from a marker: txt export emits a blank line, not the literal", () => {
    const txt = MdiDocument.fromRawText("前の文。\n\n[[blank]]\n\n次の文。").toExportText("txt");
    expect(txt).toBe("前の文。\n\n次の文。");
  });

  it("escaping does not survive a .mdi save round-trip (escape gap, documented)", () => {
    expect(
      MdiDocument.fromEditorOutput("\\[\\[blank\\]\\]", { fileType: ".mdi" }).toRawText(),
    ).toBe(MDI_BLANK_MARKER);
  });

  it("inline literal (text around it) is NOT a marker and is preserved everywhere", () => {
    const inline = "foo [[blank]] bar";
    expect(MdiDocument.fromRawText(inline).toRawText()).toBe(inline);
    expect(MdiDocument.fromRawText(inline).toAnalysisText()).toBe(inline);
    expect(MdiDocument.fromRawText(inline).toExportText("txt")).toBe(inline);
  });

  it("isMdiBlankParagraphLine: own-line (with surrounding whitespace) only", () => {
    expect(isMdiBlankParagraphLine("[[blank]]")).toBe(true);
    expect(isMdiBlankParagraphLine("  [[blank]]\t")).toBe(true);
  });

  it("strips whitespace-tolerant marker lines consistently with isMdiBlankParagraphLine", () => {
    // Copilot review (#1592): exporter (trim) and analysis (regex) semantics
    // must agree — an indented marker is a blank paragraph in BOTH worlds.
    const doc = "前\n  [[blank]]\t\n後";
    expect(stripMdiBlankMarkers(doc)).toBe("前\n\n後");
    expect(MdiDocument.fromRawText(doc).toAnalysisText()).not.toContain("[[blank]]");
    expect(isMdiBlankParagraphLine("foo [[blank]]")).toBe(false);
  });

  it("stripMdiBlankMarkers (deprecated helper) matches toAnalysisText", () => {
    const raw = "A\n\n[[blank]]\n\nfoo [[blank]] bar";
    expect(stripMdiBlankMarkers(raw)).toBe(MdiDocument.fromRawText(raw).toAnalysisText());
  });
});
