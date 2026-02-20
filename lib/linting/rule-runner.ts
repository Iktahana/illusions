import type { LintRule, LintRuleConfig, LintIssue } from "./types";

/**
 * Manages lint rule registration, configuration, and execution.
 */
export class RuleRunner {
  private rules: Map<string, LintRule> = new Map();
  private configs: Map<string, LintRuleConfig> = new Map();

  /** Register a rule. Sets default config if none exists yet. */
  registerRule(rule: LintRule): void {
    this.rules.set(rule.id, rule);
    if (!this.configs.has(rule.id)) {
      this.configs.set(rule.id, { ...rule.defaultConfig });
    }
  }

  /** Update the config for a specific rule. */
  setConfig(ruleId: string, config: LintRuleConfig): void {
    this.configs.set(ruleId, config);
  }

  /** Get the current config for a specific rule. */
  getConfig(ruleId: string): LintRuleConfig | undefined {
    return this.configs.get(ruleId);
  }

  /** Run all enabled rules on the given text. Returns issues sorted by position. */
  runAll(text: string): LintIssue[] {
    const issues: LintIssue[] = [];

    for (const rule of this.rules.values()) {
      const config = this.configs.get(rule.id);
      if (!config?.enabled) continue;
      issues.push(...rule.lint(text, config));
    }

    return issues.sort((a, b) => a.from - b.from);
  }

  /** Run a specific rule on the given text. Respects enabled status. */
  run(ruleId: string, text: string): LintIssue[] {
    const rule = this.rules.get(ruleId);
    if (!rule) return [];

    const config = this.configs.get(ruleId);
    if (!config?.enabled) return [];

    return rule.lint(text, config);
  }

  /** Return all registered rules. */
  getRegisteredRules(): LintRule[] {
    return Array.from(this.rules.values());
  }

  /** Return only rules whose config has enabled=true. */
  getEnabledRules(): LintRule[] {
    return Array.from(this.rules.values()).filter((rule) => {
      const config = this.configs.get(rule.id);
      return config?.enabled === true;
    });
  }
}
