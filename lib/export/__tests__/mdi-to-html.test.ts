import { describe, expect, it } from "vitest";

import { mdiToHtml } from "../mdi-to-html";

describe("mdiToHtml", () => {
  it("renders MDI inline syntax outside code", () => {
    const html = mdiToHtml("{東京|とうきょう}の^12^月[[br]][[no-break:ABC]][[kern:0.5em:wide]]", {
      bodyOnly: true,
    });

    expect(html).toContain("<ruby>東京<rt>とうきょう</rt></ruby>");
    expect(html).toContain('<span class="mdi-tcy">12</span>');
    expect(html).toContain('<br class="mdi-break">');
    expect(html).toContain('<span class="mdi-nobr">ABC</span>');
    expect(html).toContain('<span class="mdi-kern" style="--mdi-kern:0.5em;">wide</span>');
  });

  it("does not render MDI inline syntax inside inline code", () => {
    const html = mdiToHtml("`{東京|とうきょう}[[br]]^12^[[no-break:ABC]][[kern:0.5em:wide]]`", {
      bodyOnly: true,
    });

    expect(html).toContain(
      "<code>{東京|とうきょう}[[br]]^12^[[no-break:ABC]][[kern:0.5em:wide]]</code>",
    );
    expect(html).not.toContain("<ruby>");
    expect(html).not.toContain('class="mdi-break"');
    expect(html).not.toContain('class="mdi-tcy"');
    expect(html).not.toContain('class="mdi-nobr"');
    expect(html).not.toContain('class="mdi-kern"');
  });

  it("does not render MDI inline syntax inside fenced code blocks", () => {
    const html = mdiToHtml(
      "```text\n{東京|とうきょう}\n[[br]]\n^12^\n[[no-break:ABC]]\n[[kern:0.5em:wide]]\n```\n\n外では[[br]]変換する",
      { bodyOnly: true },
    );

    expect(html).toContain(
      '<pre><code class="language-text">{東京|とうきょう}\n[[br]]\n^12^\n[[no-break:ABC]]\n[[kern:0.5em:wide]]\n</code></pre>',
    );
    expect(html).toContain('外では<br class="mdi-break">変換する');
  });

  it(".md/.txt: preserves escaped MDI syntax as literal text (DATA-LOSS guard)", () => {
    // Non-.mdi documents are raw authored text — the HTML pipeline must NOT
    // recover serializer escapes, so author-written literals survive verbatim.
    for (const fileType of [".md", ".txt"]) {
      const html = mdiToHtml("\\{東京|とうきょう} \\^12^ \\[[br]]", { bodyOnly: true, fileType });
      expect(html).toContain("{東京|とうきょう} ^12^ [[br]]");
      expect(html).not.toContain("<ruby>");
      expect(html).not.toContain('class="mdi-break"');
      expect(html).not.toContain('class="mdi-tcy"');
    }
  });

  describe(".txt/.md fileType MDI macro pass-through (#1918)", () => {
    // For non-.mdi files, bracket macros are authored literal text and must NOT
    // be interpreted as MDI syntax in print/PDF/preview output.

    it(".txt: [[blank]] is preserved as literal text, not removed", () => {
      for (const fileType of [".txt", ".md"]) {
        const html = mdiToHtml("[[blank]]", { bodyOnly: true, fileType });
        expect(html).toContain("[[blank]]");
      }
    });

    it(".txt: [[no-break:…]] passes through unchanged, no mdi-nobr span", () => {
      for (const fileType of [".txt", ".md"]) {
        const html = mdiToHtml("ABC[[no-break:DEF]]GHI", { bodyOnly: true, fileType });
        expect(html).toContain("[[no-break:DEF]]");
        expect(html).not.toContain('class="mdi-nobr"');
      }
    });

    it(".txt: [[kern:…]] passes through unchanged, no mdi-kern span", () => {
      for (const fileType of [".txt", ".md"]) {
        const html = mdiToHtml("[[kern:0.5em:テスト]]", { bodyOnly: true, fileType });
        expect(html).toContain("[[kern:0.5em:テスト]]");
        expect(html).not.toContain('class="mdi-kern"');
      }
    });

    it(".mdi: [[blank]] is still removed (sentinel path preserved)", () => {
      const html = mdiToHtml("[[blank]]", { bodyOnly: true, fileType: ".mdi" });
      expect(html).not.toContain("[[blank]]");
      // blank paragraph becomes empty <p></p>
      expect(html).toContain("<p></p>");
    });

    it(".mdi: [[no-break:…]] still converts to mdi-nobr span", () => {
      const html = mdiToHtml("[[no-break:ABC]]", { bodyOnly: true, fileType: ".mdi" });
      expect(html).toContain('<span class="mdi-nobr">ABC</span>');
      expect(html).not.toContain("[[no-break:ABC]]");
    });

    it(".mdi: [[kern:…]] still converts to mdi-kern span", () => {
      const html = mdiToHtml("[[kern:0.5em:wide]]", { bodyOnly: true, fileType: ".mdi" });
      expect(html).toContain('<span class="mdi-kern" style="--mdi-kern:0.5em;">wide</span>');
      expect(html).not.toContain("[[kern:0.5em:wide]]");
    });
  });

  it(".mdi: recovers serializer-escaped bracket macros so they render (PDF/EPUB parity)", () => {
    // The Milkdown serializer escapes the leading `[` of MDI bracket macros to
    // `\[`. For ".mdi" the HTML pipeline un-escapes them (Step 0) — matching the
    // save path and TXT/DOCX — so e.g. `\[[br]]` becomes a real <br> instead of
    // leaking `[[br]]` as literal text. (Ruby `{…}` / tcy `^…^` are outside
    // Step 0's recovery scope and intentionally stay literal.)
    const html = mdiToHtml("\\{東京|とうきょう} \\^12^ \\[[br]]", {
      bodyOnly: true,
      fileType: ".mdi",
    });
    expect(html).toContain('<br class="mdi-break">');
    expect(html).not.toContain("[[br]]");
    // Ruby / tcy escapes are not in Step 0's scope → remain literal text.
    expect(html).toContain("{東京|とうきょう} ^12^");
    expect(html).not.toContain("<ruby>");
    expect(html).not.toContain('class="mdi-tcy"');
  });
});
