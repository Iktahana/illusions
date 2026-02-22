import { describe, it, expect } from "vitest";

import type { Token } from "@/lib/nlp-client/types";

import { RuleRunner } from "../rule-runner";
import { PunctuationRule } from "../rules/punctuation-rules";
import { SentenceLengthRule } from "../rules/sentence-length";
import { NotationConsistencyRule } from "../rules/notation-consistency";
import { ConjunctionOveruseRule } from "../rules/conjunction-overuse";
import type { LintRule, LintIssue, LintRuleConfig } from "../types";
import { AbstractLintRule } from "../base-rule";

/** A minimal test rule for unit testing the runner */
class TestRule extends AbstractLintRule {
  readonly id = "test-rule";
  readonly name = "Test Rule";
  readonly nameJa = "テストルール";
  readonly description = "A rule for testing";
  readonly descriptionJa = "テスト用ルール";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];
    if (text.includes("ERROR")) {
      return [
        {
          ruleId: this.id,
          severity: config.severity,
          message: "Test issue found",
          messageJa: "テスト問題発見",
          from: text.indexOf("ERROR"),
          to: text.indexOf("ERROR") + 5,
        },
      ];
    }
    return [];
  }
}

describe("RuleRunner", () => {
  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------
  describe("registerRule", () => {
    it("should register a rule and set its default config", () => {
      const runner = new RuleRunner();
      const rule = new TestRule();
      runner.registerRule(rule);

      const rules = runner.getRegisteredRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe("test-rule");
    });

    it("should not override existing config when registering", () => {
      const runner = new RuleRunner();
      const rule = new TestRule();
      runner.setConfig("test-rule", { enabled: false, severity: "error" });
      runner.registerRule(rule);

      const config = runner.getConfig("test-rule");
      expect(config?.enabled).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Config management
  // -----------------------------------------------------------------------
  describe("setConfig / getConfig", () => {
    it("should get and set config", () => {
      const runner = new RuleRunner();
      runner.setConfig("my-rule", { enabled: true, severity: "error" });

      const config = runner.getConfig("my-rule");
      expect(config?.enabled).toBe(true);
      expect(config?.severity).toBe("error");
    });

    it("should return undefined for unknown rule", () => {
      const runner = new RuleRunner();
      expect(runner.getConfig("nonexistent")).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // runAll
  // -----------------------------------------------------------------------
  describe("runAll", () => {
    it("should run all enabled rules", () => {
      const runner = new RuleRunner();
      runner.registerRule(new TestRule());

      const issues = runner.runAll("This contains ERROR text.");
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].ruleId).toBe("test-rule");
    });

    it("should skip disabled rules", () => {
      const runner = new RuleRunner();
      runner.registerRule(new TestRule());
      runner.setConfig("test-rule", { enabled: false, severity: "warning" });

      const issues = runner.runAll("This contains ERROR text.");
      expect(issues).toHaveLength(0);
    });

    it("should sort issues by position", () => {
      const runner = new RuleRunner();
      runner.registerRule(new PunctuationRule());
      runner.registerRule(new SentenceLengthRule());

      const issues = runner.runAll("彼は「わかりました。」と答えた。");
      // Issues should be sorted by from position
      for (let i = 1; i < issues.length; i++) {
        expect(issues[i].from).toBeGreaterThanOrEqual(issues[i - 1].from);
      }
    });

    it("should return empty for clean text", () => {
      const runner = new RuleRunner();
      runner.registerRule(new TestRule());

      const issues = runner.runAll("Clean text without issues.");
      expect(issues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // run (single rule)
  // -----------------------------------------------------------------------
  describe("run", () => {
    it("should run a specific rule by id", () => {
      const runner = new RuleRunner();
      runner.registerRule(new TestRule());

      const issues = runner.run("test-rule", "ERROR here");
      expect(issues.length).toBeGreaterThan(0);
    });

    it("should return empty for unknown rule id", () => {
      const runner = new RuleRunner();
      const issues = runner.run("nonexistent", "text");
      expect(issues).toHaveLength(0);
    });

    it("should return empty for disabled rule", () => {
      const runner = new RuleRunner();
      runner.registerRule(new TestRule());
      runner.setConfig("test-rule", { enabled: false, severity: "warning" });

      const issues = runner.run("test-rule", "ERROR here");
      expect(issues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // runDocument
  // -----------------------------------------------------------------------
  describe("runDocument", () => {
    it("should run document-level rules on paragraphs", () => {
      const runner = new RuleRunner();
      runner.registerRule(new NotationConsistencyRule());

      const paragraphs = [
        { text: "作業を行う。", index: 0 },
        { text: "業務を行なう。", index: 1 },
      ];

      const results = runner.runDocument(paragraphs);
      // Results is a Map<number, LintIssue[]>
      expect(results).toBeDefined();
    });

    it("should skip non-document rules", () => {
      const runner = new RuleRunner();
      runner.registerRule(new TestRule()); // Not a document rule

      const paragraphs = [
        { text: "ERROR text", index: 0 },
      ];

      const results = runner.runDocument(paragraphs);
      // TestRule is not a DocumentLintRule, so runDocument should skip it
      let totalIssues = 0;
      for (const issues of results.values()) {
        totalIssues += issues.length;
      }
      expect(totalIssues).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // hasDocumentRules
  // -----------------------------------------------------------------------
  describe("hasDocumentRules", () => {
    it("should return true when document rules are registered", () => {
      const runner = new RuleRunner();
      runner.registerRule(new NotationConsistencyRule());
      expect(runner.hasDocumentRules()).toBe(true);
    });

    it("should return false when no document rules are registered", () => {
      const runner = new RuleRunner();
      runner.registerRule(new TestRule());
      expect(runner.hasDocumentRules()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getEnabledRules
  // -----------------------------------------------------------------------
  describe("getEnabledRules", () => {
    it("should return only enabled rules", () => {
      const runner = new RuleRunner();
      runner.registerRule(new TestRule());
      runner.registerRule(new PunctuationRule());
      runner.setConfig("test-rule", { enabled: false, severity: "warning" });

      const enabled = runner.getEnabledRules();
      expect(enabled.length).toBe(1);
      expect(enabled[0].id).toBe("punctuation-rules");
    });
  });

  // -----------------------------------------------------------------------
  // runAllWithTokens
  // -----------------------------------------------------------------------
  describe("runAllWithTokens", () => {
    it("should route L2 rules through lintWithTokens", () => {
      const runner = new RuleRunner();
      const conjRule = new ConjunctionOveruseRule();
      runner.registerRule(conjRule);

      // Tokens for text with 3 conjunction-starting sentences
      const text = "しかし来た。だから帰った。そして寝た。";
      const tokens: Token[] = [
        { surface: "しかし", pos: "接続詞", start: 0, end: 3 },
        { surface: "来", pos: "動詞", start: 3, end: 4 },
        { surface: "た", pos: "助動詞", start: 4, end: 5 },
        { surface: "だから", pos: "接続詞", start: 6, end: 9 },
        { surface: "帰っ", pos: "動詞", start: 9, end: 11 },
        { surface: "た", pos: "助動詞", start: 11, end: 12 },
        { surface: "そして", pos: "接続詞", start: 13, end: 16 },
        { surface: "寝", pos: "動詞", start: 16, end: 17 },
        { surface: "た", pos: "助動詞", start: 17, end: 18 },
      ] as Token[];

      const issues = runner.runAllWithTokens(text, tokens);
      expect(issues.length).toBeGreaterThan(0);
    });

    it("should also run L1 rules alongside L2 rules", () => {
      const runner = new RuleRunner();
      runner.registerRule(new TestRule());
      runner.registerRule(new ConjunctionOveruseRule());

      const issues = runner.runAllWithTokens("ERROR", []);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].ruleId).toBe("test-rule");
    });
  });

  // -----------------------------------------------------------------------
  // hasMorphologicalRules
  // -----------------------------------------------------------------------
  describe("hasMorphologicalRules", () => {
    it("should return true when morphological rules are registered and enabled", () => {
      const runner = new RuleRunner();
      runner.registerRule(new ConjunctionOveruseRule());
      expect(runner.hasMorphologicalRules()).toBe(true);
    });

    it("should return false when no morphological rules are registered", () => {
      const runner = new RuleRunner();
      runner.registerRule(new TestRule());
      expect(runner.hasMorphologicalRules()).toBe(false);
    });

    it("should return false when morphological rules are disabled", () => {
      const runner = new RuleRunner();
      runner.registerRule(new ConjunctionOveruseRule());
      runner.setConfig("conjunction-overuse", {
        enabled: false,
        severity: "info",
      });
      expect(runner.hasMorphologicalRules()).toBe(false);
    });
  });
});
