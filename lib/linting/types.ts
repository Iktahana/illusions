import type { ILlmClient } from "@/lib/llm-client/types";
import type { Token } from "@/lib/nlp-client/types";

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
  /** Original text at [from, to] when the issue was detected, used to verify before applying a fix */
  originalText?: string;
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
  /** Whether to skip dialogue text (「」『』) when running this rule */
  skipDialogue?: boolean;
  /** Skip LLM validation for this rule (for rules with very low false-positive rate) */
  skipLlmValidation?: boolean;
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

/**
 * A lint rule that requires morphological analysis (kuromoji tokens).
 * Used for L2 rules that need POS tagging, conjugation info, etc.
 */
export interface MorphologicalLintRule extends LintRule {
  lintWithTokens(
    text: string,
    tokens: ReadonlyArray<Token>,
    config: LintRuleConfig,
  ): LintIssue[];
}

/** Type guard for MorphologicalLintRule */
export function isMorphologicalLintRule(
  rule: LintRule,
): rule is MorphologicalLintRule {
  return "lintWithTokens" in rule;
}

/**
 * A document-level lint rule that requires morphological analysis.
 * Used for L2 document-level rules like desu-masu consistency.
 */
export interface MorphologicalDocumentLintRule extends DocumentLintRule {
  lintDocumentWithTokens(
    paragraphs: ReadonlyArray<{
      text: string;
      index: number;
      tokens: ReadonlyArray<Token>;
    }>,
    config: LintRuleConfig,
  ): Array<{ paragraphIndex: number; issues: LintIssue[] }>;
}

/** Type guard for MorphologicalDocumentLintRule */
export function isMorphologicalDocumentLintRule(
  rule: LintRule,
): rule is MorphologicalDocumentLintRule {
  return "lintDocumentWithTokens" in rule;
}

/**
 * LLM-based lint rule (L3).
 * Uses a language model for contextual analysis.
 * All LLM rules are async and accept an ILlmClient + AbortSignal.
 */
export interface LlmLintRule extends LintRule {
  /**
   * Lint sentences using an LLM for contextual analysis.
   * @param sentences - Array of sentence objects with text and position info
   * @param config - Rule configuration
   * @param llmClient - LLM client for inference
   * @param signal - AbortSignal for cancellation
   */
  lintWithLlm(
    sentences: ReadonlyArray<{ text: string; from: number; to: number }>,
    config: LintRuleConfig,
    llmClient: ILlmClient,
    signal?: AbortSignal,
  ): Promise<LintIssue[]>;
}

/**
 * Type guard for LLM-based lint rules
 */
export function isLlmLintRule(rule: LintRule): rule is LlmLintRule {
  return "lintWithLlm" in rule;
}
