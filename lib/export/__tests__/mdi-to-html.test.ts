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
      "<pre><code class=\"language-text\">{東京|とうきょう}\n[[br]]\n^12^\n[[no-break:ABC]]\n[[kern:0.5em:wide]]\n</code></pre>",
    );
    expect(html).toContain("外では<br class=\"mdi-break\">変換する");
  });

  it("preserves escaped MDI syntax as literal text", () => {
    const html = mdiToHtml("\\{東京|とうきょう} \\^12^ \\[[br]]", { bodyOnly: true });

    expect(html).toContain("{東京|とうきょう} ^12^ [[br]]");
    expect(html).not.toContain("<ruby>");
    expect(html).not.toContain('class="mdi-break"');
    expect(html).not.toContain('class="mdi-tcy"');
  });
});
