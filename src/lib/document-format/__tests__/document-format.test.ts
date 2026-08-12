import { describe, expect, it } from "vitest";

import {
  documentFormatForExtension,
  encodePlainTextDocument,
  getDocumentAdapter,
} from "@/lib/document-format";

describe("document format registry", () => {
  it.each([
    [".mdi", "mdi"],
    [".md", "markdown"],
    [".txt", "plain-text"],
  ] as const)("maps %s to an explicit adapter", (extension, format) => {
    expect(documentFormatForExtension(extension)).toBe(format);
    expect(getDocumentAdapter(format).format).toBe(format);
  });

  it("exposes format-specific capabilities", () => {
    expect(getDocumentAdapter("mdi").capabilities).toMatchObject({
      mdi: true,
      gfm: true,
      ruby: true,
      tcy: true,
    });
    expect(getDocumentAdapter("markdown").capabilities).toMatchObject({
      mdi: false,
      markdown: true,
      ruby: false,
      tcy: false,
    });
    expect(getDocumentAdapter("plain-text").capabilities).toMatchObject({
      mdi: false,
      markdown: false,
      ruby: false,
      tcy: false,
    });
  });

  it("uses Rust-owned MDI projection and diagnostics only for MDI", async () => {
    const source = "{東京|とうきょう}と^12^。";
    const mdi = getDocumentAdapter("mdi");
    await mdi.initialize();
    expect(mdi.projectText(source).text).toBe("東京と12。");
    expect(mdi.diagnostics(source)).toEqual([]);

    expect(getDocumentAdapter("markdown").projectText(source)).toEqual({
      text: source,
      diagnostics: [],
    });
    expect(getDocumentAdapter("plain-text").projectText(source)).toEqual({
      text: source,
      diagnostics: [],
    });
  });

  it("preserves Markdown and plain-text MDI-like literals", () => {
    const literal = "# {東京|とうきょう}\n\n[[pagebreak]]\n^12^";
    expect(getDocumentAdapter("markdown").projectText(literal).text).toBe(literal);
    expect(getDocumentAdapter("plain-text").projectText(literal).text).toBe(literal);
  });

  it.each([
    ["LF", "一行目\n\n三行目\n", "\n"],
    ["CRLF", "一行目\r\n\r\n三行目\r\n", "\r\n"],
  ])(
    "preserves plain-text consecutive blank lines and trailing %s newline",
    (_name, source, eol) => {
      const lines = source.split(eol);
      const document = {
        forEach(callback: (node: { textContent: string }) => void) {
          lines.forEach((textContent) => callback({ textContent }));
        },
      };
      expect(encodePlainTextDocument(document as never, source)).toBe(source);
    },
  );

  it("preserves plain-text Markdown/MDI-like literals during editor encoding", () => {
    const literal = "# **見出し** [[blank]] {東京|とうきょう} ^12^";
    const document = {
      forEach(callback: (node: { textContent: string }) => void) {
        callback({ textContent: literal });
      },
    };
    expect(encodePlainTextDocument(document as never, literal)).toBe(literal);
  });
});
