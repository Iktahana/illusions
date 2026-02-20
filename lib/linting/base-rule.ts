import type { LintRule, LintRuleConfig, LintIssue } from "./types";

/**
 * Abstract base class for lint rules.
 * All lint rules should extend this class.
 */
export abstract class AbstractLintRule implements LintRule {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly nameJa: string;
  abstract readonly description: string;
  abstract readonly descriptionJa: string;
  abstract readonly level: "L1" | "L2" | "L3";
  abstract readonly defaultConfig: LintRuleConfig;

  abstract lint(text: string, config: LintRuleConfig): LintIssue[];
}
