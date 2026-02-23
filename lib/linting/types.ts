import type { ILlmClient } from "@/lib/llm-client/types";
import type { Token } from "@/lib/nlp-client/types";

export type Severity = "error" | "warning" | "info";

/** The underlying implementation engine for a correction rule */
export type CorrectionEngine = "regex" | "morphological" | "llm";

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
  /** LLM validation state: undefined = pending, true = confirmed, false = rejected */
  llmValidated?: boolean;
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
  /** The underlying implementation engine for this rule */
  engine?: CorrectionEngine;
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

// ============================================================================
// Unified CorrectionRule interface (Phase D)
// ============================================================================

/** Unified context passed to all rules */
export interface AnalysisContext {
  /** The paragraph text (or full document text for document-scope rules) */
  text: string;
  /** Morphological tokens from NLP client (available for morphological rules) */
  tokens?: Token[];
  /** All paragraph texts (for document-scope rules) */
  paragraphs?: string[];
  /** Current correction mode (e.g. "novel", "official", "academic") */
  mode: string;
  /** Active guideline identifiers */
  guidelines: string[];
}

/** Candidate issue from any rule, before LLM validation */
export interface CorrectionCandidate {
  ruleId: string;
  from: number;
  to: number;
  severity: Severity;
  message: string;
  messageJa: string;
  suggestion?: string;
  reference?: LintReference;
  /** Surrounding sentence text (at least one complete sentence) for LLM validation */
  context: string;
  /** When true, skip LLM validation (e.g. formatting/structural rules) */
  skipValidation?: boolean;
}

/** Unified rule interface — replaces LintRule/DocumentLintRule/MorphologicalLintRule */
export interface CorrectionRule {
  id: string;
  engine: CorrectionEngine;
  scope: "paragraph" | "document";
  defaultConfig: LintRuleConfig;
  /** Optional extra hint for LLM validator */
  validationHint?: string;

  /** Single entry point — receives full AnalysisContext */
  analyze(context: AnalysisContext, config: LintRuleConfig): CorrectionCandidate[];

  /** Async entry point for LLM-based rules */
  analyzeAsync?(
    context: AnalysisContext,
    config: LintRuleConfig,
    llmClient: ILlmClient,
    signal?: AbortSignal,
  ): Promise<CorrectionCandidate[]>;
}

// ============================================================================
// Conversion utilities between LintIssue and CorrectionCandidate
// ============================================================================

/** Convert a LintIssue to a CorrectionCandidate */
export function issueToCandidate(issue: LintIssue, contextText: string): CorrectionCandidate {
  return {
    ruleId: issue.ruleId,
    from: issue.from,
    to: issue.to,
    severity: issue.severity,
    message: issue.message,
    messageJa: issue.messageJa,
    suggestion: issue.fix?.replacement,
    reference: issue.reference,
    context: contextText,
    skipValidation: false,
  };
}

/** Convert a CorrectionCandidate to a LintIssue */
export function candidateToIssue(candidate: CorrectionCandidate): LintIssue {
  return {
    ruleId: candidate.ruleId,
    from: candidate.from,
    to: candidate.to,
    severity: candidate.severity,
    message: candidate.message,
    messageJa: candidate.messageJa,
    fix: candidate.suggestion
      ? { label: "Fix", labelJa: "修正", replacement: candidate.suggestion }
      : undefined,
    reference: candidate.reference,
  };
}
