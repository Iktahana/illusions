import { describe, it, expect } from "vitest";

import { ConjugationErrorRule } from "../conjugation-errors";

describe("conjugation-errors", () => {
  const rule = new ConjugationErrorRule();
  const config = rule.defaultConfig;

  it("should have correct metadata", () => {
    expect(rule.id).toBe("conjugation-errors");
    expect(rule.level).toBe("L1");
  });

  it("should return no issues for empty text", () => {
    expect(rule.lint("", config)).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // ra-nuki detection
  // -----------------------------------------------------------------------
  describe("ra-nuki (ら抜き)", () => {
    it("should detect ra-nuki 見れる", () => {
      const issues = rule.lint("あの映画は見れる。", config);
      const raNuki = issues.filter((i) => i.message.includes("ra-nuki"));
      expect(raNuki.length).toBeGreaterThan(0);
      expect(raNuki[0].fix?.replacement).toBe("見られる");
    });

    it("should detect ra-nuki 食べれる", () => {
      const issues = rule.lint("これは食べれる。", config);
      const raNuki = issues.filter((i) => i.message.includes("ra-nuki"));
      expect(raNuki.length).toBeGreaterThan(0);
      expect(raNuki[0].fix?.replacement).toBe("食べられる");
    });

    it("should detect ra-nuki with negative form", () => {
      const issues = rule.lint("彼は起きれない。", config);
      const raNuki = issues.filter((i) => i.message.includes("ra-nuki"));
      expect(raNuki.length).toBeGreaterThan(0);
      expect(raNuki[0].fix?.replacement).toBe("起きられない");
    });

    it("should not flag correct potential forms", () => {
      const issues = rule.lint("あの映画は見られる。", config);
      const raNuki = issues.filter((i) => i.message.includes("ra-nuki"));
      expect(raNuki).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // sa-ire detection
  // -----------------------------------------------------------------------
  describe("sa-ire (さ入れ)", () => {
    it("should detect sa-ire 読まさせる", () => {
      const issues = rule.lint("先生が学生に読まさせる。", config);
      const saIre = issues.filter((i) => i.message.includes("sa-ire"));
      expect(saIre.length).toBeGreaterThan(0);
      expect(saIre[0].fix?.replacement).toBe("読ませる");
    });

    it("should detect sa-ire 休まさせる", () => {
      const issues = rule.lint("部下を休まさせる。", config);
      const saIre = issues.filter((i) => i.message.includes("sa-ire"));
      expect(saIre.length).toBeGreaterThan(0);
      expect(saIre[0].fix?.replacement).toBe("休ませる");
    });

    it("should not flag correct causative forms", () => {
      const issues = rule.lint("先生が学生に読ませる。", config);
      const saIre = issues.filter((i) => i.message.includes("sa-ire"));
      expect(saIre).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // i-nuki detection
  // -----------------------------------------------------------------------
  describe("i-nuki (い抜き)", () => {
    it("should detect i-nuki 食べてる", () => {
      const issues = rule.lint("今ご飯を食べてる。", config);
      const iNuki = issues.filter((i) => i.message.includes("i-nuki"));
      expect(iNuki.length).toBeGreaterThan(0);
      expect(iNuki[0].fix?.replacement).toBe("食べている");
      // i-nuki should be info severity regardless of config
      expect(iNuki[0].severity).toBe("info");
    });

    it("should detect i-nuki 見てる", () => {
      const issues = rule.lint("テレビを見てる。", config);
      const iNuki = issues.filter((i) => i.message.includes("i-nuki"));
      expect(iNuki.length).toBeGreaterThan(0);
      expect(iNuki[0].fix?.replacement).toBe("見ている");
    });

    it("should not flag correct progressive forms", () => {
      const issues = rule.lint("テレビを見ている。", config);
      const iNuki = issues.filter((i) => i.message.includes("i-nuki"));
      expect(iNuki).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Dialogue masking
  // -----------------------------------------------------------------------
  it("should skip conjugation errors inside dialogue", () => {
    const issues = rule.lint("「見れるよ」と言った。", config);
    expect(issues).toHaveLength(0);
  });
});
