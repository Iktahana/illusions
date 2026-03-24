import { describe, it, expect } from "vitest";

import { createJtfL1Rules } from "../rules/json-l1/jtf-l1-rules";
import { createManuscriptL1Rules } from "../rules/json-l1/manuscript-l1-rules";
import { createGendaiKanazukaiL1Rules } from "../rules/json-l1/gendai-kanazukai-l1-rules";
import { createNihongoHyoukiL1Rules } from "../rules/json-l1/nihongo-hyouki-l1-rules";

// =========================================================================
// Factory-level tests
// =========================================================================

describe("JSON-driven L1 rule factories", () => {
  // -----------------------------------------------------------------------
  // createJtfL1Rules
  // -----------------------------------------------------------------------
  describe("createJtfL1Rules", () => {
    const rules = createJtfL1Rules();

    it("should return 43 rules (21 implemented + 22 TODO stubs)", () => {
      expect(rules).toHaveLength(43);
    });

    it("should have valid metadata on every rule", () => {
      for (const rule of rules) {
        expect(rule.id).toBeTruthy();
        expect(rule.nameJa).toBeTruthy();
        expect(rule.descriptionJa).toBeTruthy();
        expect(typeof rule.lint).toBe("function");
      }
    });

    it("should set level to L1 for all rules", () => {
      for (const rule of rules) {
        expect(rule.level).toBe("L1");
      }
    });
  });

  // -----------------------------------------------------------------------
  // createManuscriptL1Rules
  // -----------------------------------------------------------------------
  describe("createManuscriptL1Rules", () => {
    const rules = createManuscriptL1Rules();

    it("should return 9 rules", () => {
      expect(rules).toHaveLength(9);
    });

    it("should have valid metadata on every rule", () => {
      for (const rule of rules) {
        expect(rule.id).toBeTruthy();
        expect(rule.nameJa).toBeTruthy();
        expect(rule.descriptionJa).toBeTruthy();
        expect(typeof rule.lint).toBe("function");
      }
    });

    it("should set level to L1 for all rules", () => {
      for (const rule of rules) {
        expect(rule.level).toBe("L1");
      }
    });
  });

  // -----------------------------------------------------------------------
  // createGendaiKanazukaiL1Rules
  // -----------------------------------------------------------------------
  describe("createGendaiKanazukaiL1Rules", () => {
    const rules = createGendaiKanazukaiL1Rules();

    it("should return 3 rules (particle wo, ha, he)", () => {
      expect(rules).toHaveLength(3);
    });

    it("should have valid metadata on every rule", () => {
      for (const rule of rules) {
        expect(rule.id).toBeTruthy();
        expect(rule.nameJa).toBeTruthy();
        expect(rule.descriptionJa).toBeTruthy();
        expect(typeof rule.lint).toBe("function");
      }
    });

    it("should include particle rule IDs", () => {
      const ids = rules.map((r) => r.id);
      expect(ids).toContain("gk-particle-o");
      expect(ids).toContain("gk-particle-ha");
      expect(ids).toContain("gk-particle-he");
    });
  });

  // -----------------------------------------------------------------------
  // createNihongoHyoukiL1Rules
  // -----------------------------------------------------------------------
  describe("createNihongoHyoukiL1Rules", () => {
    const rules = createNihongoHyoukiL1Rules();

    it("should return 6 rules (5 active + 1 stub)", () => {
      expect(rules).toHaveLength(6);
    });

    it("should have valid metadata on every rule", () => {
      for (const rule of rules) {
        expect(rule.id).toBeTruthy();
        expect(rule.nameJa).toBeTruthy();
        expect(rule.descriptionJa).toBeTruthy();
        expect(typeof rule.lint).toBe("function");
      }
    });

    it("should set level to L1 for all rules", () => {
      for (const rule of rules) {
        expect(rule.level).toBe("L1");
      }
    });
  });
});

// =========================================================================
// Individual rule behavior tests
// =========================================================================

describe("JTF L1 rule behavior", () => {
  const rules = createJtfL1Rules();
  const findRule = (id: string) => rules.find((r) => r.id === id)!;

  // -----------------------------------------------------------------------
  // JTF_2_1_5_fullwidth_kana: Half-width katakana detection
  // -----------------------------------------------------------------------
  describe("JTF_2_1_5_fullwidth_kana", () => {
    const rule = findRule("JTF_2_1_5_fullwidth_kana");
    const config = rule.defaultConfig;

    it("should flag half-width katakana", () => {
      const issues = rule.lint("ﾒｰﾙを送る。", config);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].ruleId).toBe("JTF_2_1_5_fullwidth_kana");
    });

    it("should not flag full-width katakana", () => {
      const issues = rule.lint("メールを送る。", config);
      expect(issues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // JTF_2_1_8_halfwidth_alnum: Full-width digit detection
  // -----------------------------------------------------------------------
  describe("JTF_2_1_8_halfwidth_alnum", () => {
    const rule = findRule("JTF_2_1_8_halfwidth_alnum");
    const config = rule.defaultConfig;

    it("should flag full-width digits", () => {
      const issues = rule.lint("１２３個のファイル。", config);
      expect(issues.length).toBeGreaterThan(0);
    });

    it("should not flag half-width digits", () => {
      const issues = rule.lint("123個のファイル。", config);
      // Should not flag the half-width digits themselves
      const digitIssues = issues.filter(
        (i) => i.originalText && /[０-９Ａ-Ｚａ-ｚ]/.test(i.originalText),
      );
      expect(digitIssues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // JTF_3_1_1_kuten_brackets: Period before closing bracket
  // -----------------------------------------------------------------------
  describe("JTF_3_1_1_kuten_brackets", () => {
    const rule = findRule("JTF_3_1_1_kuten_brackets");
    const config = rule.defaultConfig;

    it("should flag period before closing bracket", () => {
      const issues = rule.lint("「わかりました。」と答えた。", config);
      expect(issues.length).toBeGreaterThan(0);
    });

    it("should not flag text without bracket-period pattern", () => {
      const issues = rule.lint("「わかりました」と答えた。", config);
      expect(issues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // JTF_3_3_brackets_fullwidth: Half-width brackets detection
  // -----------------------------------------------------------------------
  describe("JTF_3_3_brackets_fullwidth", () => {
    const rule = findRule("JTF_3_3_brackets_fullwidth");
    const config = rule.defaultConfig;

    it("should flag half-width brackets in Japanese text", () => {
      const issues = rule.lint("[ファイル]を開く。", config);
      expect(issues.length).toBeGreaterThan(0);
    });

    it("should not flag full-width brackets", () => {
      const issues = rule.lint("［ファイル］を開く。", config);
      expect(issues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Common: disabled rules return no issues
  // -----------------------------------------------------------------------
  describe("disabled rules", () => {
    it("should return no issues when config.enabled is false", () => {
      for (const rule of rules) {
        const issues = rule.lint("テストテキスト。ﾒｰﾙ１２３", {
          enabled: false,
          severity: "warning",
        });
        expect(issues).toHaveLength(0);
      }
    });
  });

  describe("empty text", () => {
    it("should return no issues for empty string", () => {
      for (const rule of rules) {
        const issues = rule.lint("", rule.defaultConfig);
        expect(issues).toHaveLength(0);
      }
    });
  });
});

describe("Manuscript L1 rule behavior", () => {
  const rules = createManuscriptL1Rules();
  const findRule = (id: string) => rules.find((r) => r.id === id)!;

  // -----------------------------------------------------------------------
  // me2-kanji-font: Old-form kanji detection
  // -----------------------------------------------------------------------
  describe("me2-kanji-font", () => {
    const rule = findRule("me2-kanji-font");
    const config = rule.defaultConfig;

    it("should flag old-form kanji", () => {
      const issues = rule.lint("榮光を讃える。", config);
      expect(issues.length).toBeGreaterThan(0);
      // Should suggest standard forms
      const eiIssue = issues.find((i) => i.originalText === "榮");
      expect(eiIssue).toBeDefined();
      expect(eiIssue!.fix?.replacement).toBe("栄");
    });

    it("should not flag standard-form kanji", () => {
      const issues = rule.lint("栄光を讃える。", config);
      const eiIssues = issues.filter((i) => i.originalText === "栄");
      expect(eiIssues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // me2-foreign-long-vowel: Missing long vowel mark
  // -----------------------------------------------------------------------
  describe("me2-foreign-long-vowel", () => {
    const rule = findRule("me2-foreign-long-vowel");
    const config = rule.defaultConfig;

    it("should flag missing long vowel mark", () => {
      const issues = rule.lint("スキャナを使う。", config);
      expect(issues.length).toBeGreaterThan(0);
      const scannerIssue = issues.find((i) => i.originalText === "スキャナ");
      expect(scannerIssue).toBeDefined();
      expect(scannerIssue!.fix?.replacement).toBe("スキャナー");
    });

    it("should not flag words with long vowel mark present", () => {
      const issues = rule.lint("スキャナーを使う。", config);
      const scannerIssues = issues.filter(
        (i) => i.originalText === "スキャナ",
      );
      expect(scannerIssues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // me2-punctuation-consistency: Mixed punctuation styles
  // -----------------------------------------------------------------------
  describe("me2-punctuation-consistency", () => {
    const rule = findRule("me2-punctuation-consistency");
    const config = rule.defaultConfig;

    it("should flag mixed comma styles", () => {
      // Uses both 、and ，
      const issues = rule.lint("東京、大阪，名古屋。", config);
      expect(issues.length).toBeGreaterThan(0);
    });

    it("should not flag consistent punctuation", () => {
      const issues = rule.lint("東京、大阪、名古屋。", config);
      expect(issues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // me2-repetition-marks: Repetition mark usage
  // -----------------------------------------------------------------------
  describe("me2-repetition-marks", () => {
    const rule = findRule("me2-repetition-marks");
    const config = { enabled: true, severity: "info" as const };

    it("should flag kana repetition marks in general prose", () => {
      const issues = rule.lint("おのゝのれ", config);
      expect(issues.length).toBeGreaterThan(0);
    });

    it("should flag words that should use nodo mark (々)", () => {
      const issues = rule.lint("人びとが集まった。", config);
      expect(issues.length).toBeGreaterThan(0);
      const hitobito = issues.find((i) => i.originalText === "人びと");
      expect(hitobito).toBeDefined();
      expect(hitobito!.fix?.replacement).toBe("人々");
    });
  });
});

describe("Gendai-kanazukai L1 rule behavior", () => {
  const rules = createGendaiKanazukaiL1Rules();
  const findRule = (id: string) => rules.find((r) => r.id === id)!;

  // -----------------------------------------------------------------------
  // gk-particle-ha: Particle は
  // -----------------------------------------------------------------------
  describe("gk-particle-ha", () => {
    const rule = findRule("gk-particle-ha");
    const config = rule.defaultConfig;

    it("should flag こんにちわ", () => {
      const issues = rule.lint("こんにちわ、元気ですか。", config);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].fix?.replacement).toBe("は");
    });

    it("should not flag こんにちは", () => {
      const issues = rule.lint("こんにちは、元気ですか。", config);
      const haIssues = issues.filter(
        (i) => i.ruleId === "gk-particle-ha",
      );
      expect(haIssues).toHaveLength(0);
    });

    it("should flag pronoun + わ patterns", () => {
      const issues = rule.lint("これわ大切だ。", config);
      expect(issues.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // gk-particle-o: Particle を
  // -----------------------------------------------------------------------
  describe("gk-particle-o", () => {
    const rule = findRule("gk-particle-o");
    const config = rule.defaultConfig;

    it("should flag kanji + お + verb pattern", () => {
      const issues = rule.lint("本お読む。", config);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].fix?.replacement).toBe("を");
    });

    it("should not flag normal を usage", () => {
      const issues = rule.lint("本を読む。", config);
      expect(issues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // gk-particle-he: Particle へ
  // -----------------------------------------------------------------------
  describe("gk-particle-he", () => {
    const rule = findRule("gk-particle-he");
    const config = rule.defaultConfig;

    it("should flag kanji + え + directional verb", () => {
      const issues = rule.lint("故郷え帰る。", config);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].fix?.replacement).toBe("へ");
    });

    it("should not flag normal へ usage", () => {
      const issues = rule.lint("故郷へ帰る。", config);
      expect(issues).toHaveLength(0);
    });
  });
});

describe("Nihongo-hyouki L1 rule behavior", () => {
  const rules = createNihongoHyoukiL1Rules();
  const findRule = (id: string) => rules.find((r) => r.id === id)!;

  // -----------------------------------------------------------------------
  // nh-number-format: Full-width digit detection
  // -----------------------------------------------------------------------
  describe("nh-number-format", () => {
    const rule = findRule("nh-number-format");
    const config = rule.defaultConfig;

    it("should flag full-width digits", () => {
      const issues = rule.lint("１２３ページを開く。", config);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].fix?.replacement).toBe("123");
    });

    it("should not flag half-width digits", () => {
      const issues = rule.lint("123ページを開く。", config);
      expect(issues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // nh-descriptive-symbols: Ellipsis/quotes/dashes
  // -----------------------------------------------------------------------
  describe("nh-descriptive-symbols", () => {
    const rule = findRule("nh-descriptive-symbols");
    const config = rule.defaultConfig;

    it("should flag ASCII ellipsis (three dots)", () => {
      // Three ASCII periods at the start (not preceded by alphanumeric)
      const issues = rule.lint("...沈黙が続いた。", config);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].fix?.replacement).toBe("……");
    });

    it("should flag ASCII double dash", () => {
      const issues = rule.lint("彼は言った--そして去った。", config);
      const dashIssues = issues.filter(
        (i) => i.originalText === "--",
      );
      expect(dashIssues.length).toBeGreaterThan(0);
      expect(dashIssues[0].fix?.replacement).toBe("——");
    });

    it("should not flag proper full-width ellipsis", () => {
      const issues = rule.lint("……沈黙が続いた。", config);
      const ellipsisIssues = issues.filter(
        (i) => i.message.includes("ellipsis"),
      );
      expect(ellipsisIssues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // nh-ji-zu-di-du-exceptions: Kana exceptions
  // -----------------------------------------------------------------------
  describe("nh-ji-zu-di-du-exceptions", () => {
    const rule = findRule("nh-ji-zu-di-du-exceptions");
    const config = rule.defaultConfig;

    it("should flag incorrect kana in compound words", () => {
      const issues = rule.lint("手続きのてつずきを確認する。", config);
      expect(issues.length).toBeGreaterThan(0);
      const issue = issues.find((i) => i.originalText === "てつずき");
      expect(issue).toBeDefined();
      expect(issue!.fix?.replacement).toBe("てつづき");
    });

    it("should flag incorrect ぢ usage", () => {
      const issues = rule.lint("ぢめんが揺れた。", config);
      expect(issues.length).toBeGreaterThan(0);
      const issue = issues.find((i) => i.originalText === "ぢめん");
      expect(issue).toBeDefined();
      expect(issue!.fix?.replacement).toBe("じめん");
    });
  });

  // -----------------------------------------------------------------------
  // nh-compound-noun-okurigana: Compound noun okurigana omission
  // -----------------------------------------------------------------------
  describe("nh-compound-noun-okurigana", () => {
    const rule = findRule("nh-compound-noun-okurigana");
    const config = rule.defaultConfig;

    it("should flag compound nouns with unnecessary okurigana", () => {
      const issues = rule.lint("受け付けで手続きをする。", config);
      expect(issues.length).toBeGreaterThan(0);
      const issue = issues.find((i) => i.originalText === "受け付け");
      expect(issue).toBeDefined();
      expect(issue!.fix?.replacement).toBe("受付");
    });

    it("should not flag correct compound nouns", () => {
      const issues = rule.lint("受付で手続きをする。", config);
      const uketsuke = issues.filter((i) => i.originalText === "受付");
      expect(uketsuke).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Stub rule should return no issues
  // -----------------------------------------------------------------------
  describe("nh-gendai-kanazukai-notes (stub)", () => {
    const rule = findRule("nh-gendai-kanazukai-notes");

    it("should be disabled by default", () => {
      expect(rule.defaultConfig.enabled).toBe(false);
    });

    it("should return no issues even when enabled", () => {
      const issues = rule.lint("テスト文章。", {
        enabled: true,
        severity: "warning",
      });
      expect(issues).toHaveLength(0);
    });
  });
});
