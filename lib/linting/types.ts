export type Severity = "error" | "warning" | "info";

export interface LintReference {
  /** Standard name, e.g. "JIS X 4051:2004" */
  standard: string;
  /** Section reference, e.g. "\u00a73.1.2" */
  section?: string;
  /** URL to standard */
  url?: string;
}

export interface LintIssue {
  ruleId: string;
  severity: Severity;
  message: string;
  /** Japanese description for UI display */
  messageJa: string;
  /** Character offset in source text (start) */
  from: number;
  /** Character offset in source text (end) */
  to: number;
  /** Reference to official standard */
  reference?: LintReference;
  /** Optional fix suggestion */
  fix?: {
    label: string;
    labelJa: string;
    replacement: string;
  };
}

export interface LintRuleConfig {
  enabled: boolean;
  severity: Severity;
  /** Rule-specific options */
  options?: Record<string, unknown>;
}

export interface LintRule {
  id: string;
  name: string;
  nameJa: string;
  description: string;
  descriptionJa: string;
  /** Detection level: L1=regex, L2=morphological, L3=advanced */
  level: "L1" | "L2" | "L3";
  defaultConfig: LintRuleConfig;
  /** Run the rule on text, return issues found */
  lint(text: string, config: LintRuleConfig): LintIssue[];
}

/**
 * A document-level lint rule that analyzes all paragraphs together.
 * Used for cross-paragraph checks like notation consistency.
 */
export interface DocumentLintRule extends LintRule {
  /**
   * Run the rule on the entire document.
   * @param paragraphs All paragraphs with their text and index
   * @param config Rule configuration
   * @returns Issues grouped by paragraph index
   */
  lintDocument(
    paragraphs: ReadonlyArray<{ text: string; index: number }>,
    config: LintRuleConfig,
  ): Array<{ paragraphIndex: number; issues: LintIssue[] }>;
}

/** Type guard for DocumentLintRule */
export function isDocumentLintRule(rule: LintRule): rule is DocumentLintRule {
  return "lintDocument" in rule;
}
