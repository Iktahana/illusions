import { describe, it, expect } from "vitest";

import {
  stripMdiInlineSyntax,
  replaceMdiWithRubyText,
  MDI_RUBY_RE,
  MDI_TCY_RE,
  MDI_NOBR_RE,
  MDI_KERN_RE,
  MDI_KERN_AMOUNT_RE,
} from "../mdi-parser";

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

describe("MDI regex patterns", () => {
  describe("MDI_RUBY_RE", () => {
    it("should match {base|ruby}", () => {
      expect("text {漢字|かんじ} more").toMatch(MDI_RUBY_RE);
    });

    it("should not match empty base or ruby", () => {
      expect("{|かんじ}").not.toMatch(MDI_RUBY_RE);
      expect("{漢字|}").not.toMatch(MDI_RUBY_RE);
    });
  });

  describe("MDI_TCY_RE", () => {
    it("should match ^text^", () => {
      expect("value ^12^ here").toMatch(MDI_TCY_RE);
    });

    it("should not match empty ^^ ", () => {
      expect("^^").not.toMatch(MDI_TCY_RE);
    });
  });

  describe("MDI_NOBR_RE", () => {
    it("should match [[no-break:text]]", () => {
      expect("a [[no-break:word]] b").toMatch(MDI_NOBR_RE);
    });
  });

  describe("MDI_KERN_RE", () => {
    it("should match [[kern:amount:text]]", () => {
      expect("a [[kern:0.5em:text]] b").toMatch(MDI_KERN_RE);
    });
  });

  describe("MDI_KERN_AMOUNT_RE", () => {
    it("should match valid kern amounts", () => {
      expect("0.5em").toMatch(MDI_KERN_AMOUNT_RE);
      expect("-1em").toMatch(MDI_KERN_AMOUNT_RE);
      expect("+0.25em").toMatch(MDI_KERN_AMOUNT_RE);
      expect("2em").toMatch(MDI_KERN_AMOUNT_RE);
    });

    it("should reject invalid kern amounts", () => {
      expect("0.5px").not.toMatch(MDI_KERN_AMOUNT_RE);
      expect("auto").not.toMatch(MDI_KERN_AMOUNT_RE);
      expect("em").not.toMatch(MDI_KERN_AMOUNT_RE);
    });
  });
});

// ---------------------------------------------------------------------------
// stripMdiInlineSyntax
// ---------------------------------------------------------------------------

describe("stripMdiInlineSyntax", () => {
  it("should strip ruby keeping base text", () => {
    expect(stripMdiInlineSyntax("{漢字|かんじ}")).toBe("漢字");
  });

  it("should strip tate-chu-yoko markers", () => {
    expect(stripMdiInlineSyntax("^12^")).toBe("12");
  });

  it("should strip no-break markers", () => {
    expect(stripMdiInlineSyntax("[[no-break:word]]")).toBe("word");
  });

  it("should strip kerning markers", () => {
    expect(stripMdiInlineSyntax("[[kern:0.5em:text]]")).toBe("text");
  });

  it("should handle multiple constructs in one string", () => {
    const input = "{東京|とうきょう}の^12^月、[[no-break:ABC]]と[[kern:0.5em:wide]]";
    const expected = "東京の12月、ABCとwide";
    expect(stripMdiInlineSyntax(input)).toBe(expected);
  });

  it("should pass through plain text unchanged", () => {
    expect(stripMdiInlineSyntax("普通のテキスト")).toBe("普通のテキスト");
  });
});

// ---------------------------------------------------------------------------
// replaceMdiWithRubyText
// ---------------------------------------------------------------------------

describe("replaceMdiWithRubyText", () => {
  it("should convert ruby to fullwidth parentheses", () => {
    expect(replaceMdiWithRubyText("{漢字|かんじ}")).toBe("漢字（かんじ）");
  });

  it("should strip dots from split ruby", () => {
    expect(replaceMdiWithRubyText("{東京|とう.きょう}")).toBe("東京（とうきょう）");
  });

  it("should strip tate-chu-yoko markers", () => {
    expect(replaceMdiWithRubyText("^12^")).toBe("12");
  });

  it("should strip no-break markers", () => {
    expect(replaceMdiWithRubyText("[[no-break:word]]")).toBe("word");
  });

  it("should strip kerning markers", () => {
    expect(replaceMdiWithRubyText("[[kern:0.5em:text]]")).toBe("text");
  });

  it("should handle multiple constructs in one string", () => {
    const input = "{東京|とうきょう}の^12^月";
    const expected = "東京（とうきょう）の12月";
    expect(replaceMdiWithRubyText(input)).toBe(expected);
  });
});
