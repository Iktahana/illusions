import { describe, it, expect } from "vitest";

import { RuleRunner } from "../rule-runner";
import type { LintIssue, LintRuleConfig } from "../types";
import { AbstractLintRule } from "../base-rule";
import { createJtfL1Rules } from "../rules/json-l1/jtf-l1-rules";
import { createGendaiKanazukaiL2Rules } from "../rules/l2/gendai-kanazukai-l2-rules";

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
      // Register a real JTF rule for testing sort behavior
      const jtfRules = createJtfL1Rules();
      if (jtfRules.length > 0) {
        runner.registerRule(jtfRules[0]);
      }
      runner.registerRule(new TestRule());

      const issues = runner.runAll("ERROR ﾒｰﾙ text");
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
    it("should skip non-document rules", () => {
      const runner = new RuleRunner();
      runner.registerRule(new TestRule()); // Not a document rule

      const paragraphs = [{ text: "ERROR text", index: 0 }];

      const results = runner.runDocument(paragraphs);
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
      const gkRules = createGendaiKanazukaiL2Rules();
      if (gkRules.length > 0) {
        runner.registerRule(gkRules[0]);
      }
      runner.setConfig("test-rule", { enabled: false, severity: "warning" });

      const enabled = runner.getEnabledRules();
      expect(enabled.length).toBe(1);
      expect(enabled[0].id).toBe(gkRules[0].id);
    });
  });

  // -----------------------------------------------------------------------
  // hasMorphologicalRules
  // -----------------------------------------------------------------------
  describe("hasMorphologicalRules", () => {
    it("should return false when no morphological rules are registered", () => {
      const runner = new RuleRunner();
      runner.registerRule(new TestRule());
      expect(runner.hasMorphologicalRules()).toBe(false);
    });
  });
});
