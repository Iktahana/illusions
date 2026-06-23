import { describe, it, expect } from "vitest";

import { RuleRunner } from "../rule-runner";
import type { LintIssue, LintRuleConfig } from "../types";
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

/** A second stub rule that fires on a different trigger, for multi-rule tests */
class AnotherRule extends AbstractLintRule {
  readonly id = "another-rule";
  readonly name = "Another Rule";
  readonly nameJa = "別のルール";
  readonly description = "Another rule for testing";
  readonly descriptionJa = "テスト用の別ルール";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "info",
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];
    if (text.includes("WARN")) {
      return [
        {
          ruleId: this.id,
          severity: config.severity,
          message: "Another issue found",
          messageJa: "別の問題発見",
          from: text.indexOf("WARN"),
          to: text.indexOf("WARN") + 4,
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

    it("preserves manifest rule options when a later setConfig omits them (#1962)", () => {
      // A rule registered with options (e.g. genji-out-of-dict noun-only scope).
      class OptionRule extends AbstractLintRule {
        readonly id = "opt-rule";
        readonly name = "Opt";
        readonly nameJa = "Opt";
        readonly description = "";
        readonly descriptionJa = "";
        readonly level = "L2" as const;
        readonly defaultConfig: LintRuleConfig = {
          enabled: true,
          severity: "info",
          options: { includeVerbsAdjectives: false },
        };
        lint(): LintIssue[] {
          return [];
        }
      }
      const runner = new RuleRunner();
      runner.registerRule(new OptionRule());

      // The renderer pushes a mode config carrying only enabled/severity.
      runner.setConfig("opt-rule", { enabled: true, severity: "info" });

      // Options must survive — otherwise the rule reverts to its internal default.
      expect(runner.getConfig("opt-rule")?.options).toEqual({ includeVerbsAdjectives: false });
    });

    it("lets an explicit options object override the preserved one (#1962)", () => {
      const runner = new RuleRunner();
      runner.setConfig("r", { enabled: true, severity: "info", options: { a: 1 } });
      runner.setConfig("r", { enabled: true, severity: "info", options: { b: 2 } });
      expect(runner.getConfig("r")?.options).toEqual({ b: 2 });
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
      // AnotherRule fires on "WARN" (position 0), TestRule fires on "ERROR" (position 5)
      runner.registerRule(new AnotherRule());
      runner.registerRule(new TestRule());

      // "WARN ERROR" — WARN at 0, ERROR at 5
      const issues = runner.runAll("WARN ERROR text");
      expect(issues.length).toBeGreaterThanOrEqual(2);
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
      runner.registerRule(new AnotherRule());
      runner.setConfig("test-rule", { enabled: false, severity: "warning" });

      const enabled = runner.getEnabledRules();
      expect(enabled.length).toBe(1);
      expect(enabled[0].id).toBe("another-rule");
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
