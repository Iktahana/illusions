import type { ILlmClient } from "@/lib/llm-client/types";
import type { Token } from "@/lib/nlp-client/types";

import type {
  CorrectionEngine,
  LintRule,
  LintRuleConfig,
  LintIssue,
  DocumentLintRule,
  MorphologicalLintRule,
  MorphologicalDocumentLintRule,
  LlmLintRule,
  AnalysisContext,
  CorrectionCandidate,
  CorrectionRule,
} from "./types";
import { issueToCandidate } from "./types";

// ============================================================================
// Legacy base classes — now also implement CorrectionRule via bridge methods
// ============================================================================

/**
 * Abstract base class for lint rules.
 * All lint rules should extend this class.
 *
 * @deprecated Use AbstractCorrectionRule for new rules.
 * Existing rules are bridged to CorrectionRule via analyze().
 */
export abstract class AbstractLintRule implements LintRule, CorrectionRule {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly nameJa: string;
  abstract readonly description: string;
  abstract readonly descriptionJa: string;
  abstract readonly level: "L1" | "L2" | "L3";
  abstract readonly defaultConfig: LintRuleConfig;
  /** Default engine for simple regex-based rules */
  engine: CorrectionEngine = "regex";
  /** CorrectionRule scope — paragraph by default */
  readonly scope: "paragraph" | "document" = "paragraph";

  abstract lint(text: string, config: LintRuleConfig): LintIssue[];

  /** CorrectionRule bridge: delegates to lint() and converts results */
  analyze(context: AnalysisContext, config: LintRuleConfig): CorrectionCandidate[] {
    const issues = this.lint(context.text, config);
    return issues.map((i) => issueToCandidate(i, context.text));
  }
}

/**
 * Abstract base class for document-level lint rules.
 * These rules analyze all paragraphs together for cross-paragraph checks.
 *
 * @deprecated Use AbstractCorrectionRule with scope="document" for new rules.
 */
export abstract class AbstractDocumentLintRule extends AbstractLintRule implements DocumentLintRule {
  override readonly scope: "paragraph" | "document" = "document";

  abstract lintDocument(
    paragraphs: ReadonlyArray<{ text: string; index: number }>,
    config: LintRuleConfig,
  ): Array<{ paragraphIndex: number; issues: LintIssue[] }>;

  /** Document-level rules return no issues when called per-paragraph. */
  lint(_text: string, _config: LintRuleConfig): LintIssue[] {
    return [];
  }

  /** CorrectionRule bridge: delegates to lintDocument() and flattens results */
  override analyze(context: AnalysisContext, config: LintRuleConfig): CorrectionCandidate[] {
    if (!context.paragraphs) return [];
    const paragraphs = context.paragraphs.map((text, index) => ({ text, index }));
    const results = this.lintDocument(paragraphs, config);
    return results.flatMap((r) =>
      r.issues.map((i) => issueToCandidate(i, context.paragraphs![r.paragraphIndex])),
    );
  }
}

/**
 * Abstract base class for morphological (L2) lint rules.
 * These rules receive pre-tokenized kuromoji data.
 *
 * @deprecated Use AbstractCorrectionRule with engine="morphological" for new rules.
 */
export abstract class AbstractMorphologicalLintRule
  extends AbstractLintRule
  implements MorphologicalLintRule
{
  /** Morphological rules use kuromoji tokenization */
  override engine: CorrectionEngine = "morphological";

  abstract lintWithTokens(
    text: string,
    tokens: ReadonlyArray<Token>,
    config: LintRuleConfig,
  ): LintIssue[];

  /** L2 rules return no issues without tokens. */
  lint(_text: string, _config: LintRuleConfig): LintIssue[] {
    return [];
  }

  /** CorrectionRule bridge: delegates to lintWithTokens() and converts results */
  override analyze(context: AnalysisContext, config: LintRuleConfig): CorrectionCandidate[] {
    if (!context.tokens) return [];
    const issues = this.lintWithTokens(context.text, context.tokens, config);
    return issues.map((i) => issueToCandidate(i, context.text));
  }
}

/**
 * Abstract base class for morphological document-level lint rules.
 * These rules analyze all paragraphs together with kuromoji tokens.
 *
 * @deprecated Use AbstractCorrectionRule with scope="document" and engine="morphological".
 */
export abstract class AbstractMorphologicalDocumentLintRule
  extends AbstractLintRule
  implements MorphologicalDocumentLintRule
{
  /** Morphological document rules use kuromoji tokenization */
  override engine: CorrectionEngine = "morphological";
  override readonly scope: "paragraph" | "document" = "document";

  abstract lintDocumentWithTokens(
    paragraphs: ReadonlyArray<{
      text: string;
      index: number;
      tokens: ReadonlyArray<Token>;
    }>,
    config: LintRuleConfig,
  ): Array<{ paragraphIndex: number; issues: LintIssue[] }>;

  /** Document-level rules return no issues when called per-paragraph. */
  lint(_text: string, _config: LintRuleConfig): LintIssue[] {
    return [];
  }

  /** Non-morphological document lint is a no-op; use lintDocumentWithTokens instead. */
  lintDocument(
    _paragraphs: ReadonlyArray<{ text: string; index: number }>,
    _config: LintRuleConfig,
  ): Array<{ paragraphIndex: number; issues: LintIssue[] }> {
    return [];
  }

  /** CorrectionRule bridge: delegates to lintDocumentWithTokens() and flattens results */
  override analyze(context: AnalysisContext, config: LintRuleConfig): CorrectionCandidate[] {
    if (!context.paragraphs) return [];
    // Note: tokens must be provided per-paragraph for document morphological rules
    // The bridge creates stub entries; real tokens are provided by the CorrectionRuleRunner
    const paragraphs = context.paragraphs.map((text, index) => ({
      text,
      index,
      tokens: [] as Token[],
    }));
    const results = this.lintDocumentWithTokens(paragraphs, config);
    return results.flatMap((r) =>
      r.issues.map((i) => issueToCandidate(i, context.paragraphs![r.paragraphIndex])),
    );
  }
}

/**
 * Abstract base class for LLM-based lint rules (L3).
 * Subclasses implement lintWithLlm(). The sync lint() is a no-op.
 *
 * @deprecated Use AbstractCorrectionRule with engine="llm" and analyzeAsync() for new rules.
 */
export abstract class AbstractLlmLintRule
  extends AbstractLintRule
  implements LlmLintRule
{
  readonly level = "L3" as const;
  /** LLM rules use language model inference */
  override engine: CorrectionEngine = "llm";

  lint(_text: string, _config: LintRuleConfig): LintIssue[] {
    return []; // L3 rules only run via lintWithLlm()
  }

  /** Sync analyze is a no-op for LLM rules; use analyzeAsync() instead */
  override analyze(_context: AnalysisContext, _config: LintRuleConfig): CorrectionCandidate[] {
    return [];
  }

  abstract lintWithLlm(
    sentences: ReadonlyArray<{ text: string; from: number; to: number }>,
    config: LintRuleConfig,
    llmClient: ILlmClient,
    signal?: AbortSignal,
  ): Promise<LintIssue[]>;

  /** CorrectionRule async bridge: delegates to lintWithLlm() and converts results */
  async analyzeAsync(
    context: AnalysisContext,
    config: LintRuleConfig,
    llmClient: ILlmClient,
    signal?: AbortSignal,
  ): Promise<CorrectionCandidate[]> {
    // Build sentence spans from context text
    const sentences = [{ text: context.text, from: 0, to: context.text.length }];
    const issues = await this.lintWithLlm(sentences, config, llmClient, signal);
    return issues.map((i) => issueToCandidate(i, context.text));
  }
}

// ============================================================================
// Unified AbstractCorrectionRule (Phase D)
// ============================================================================

/**
 * Abstract base class for the unified CorrectionRule interface.
 * New rules should extend this class instead of the legacy AbstractLintRule hierarchy.
 */
export abstract class AbstractCorrectionRule implements CorrectionRule {
  abstract readonly id: string;
  abstract readonly engine: CorrectionEngine;
  readonly scope: "paragraph" | "document" = "paragraph";
  abstract readonly defaultConfig: LintRuleConfig;
  readonly validationHint?: string;

  abstract analyze(
    context: AnalysisContext,
    config: LintRuleConfig,
  ): CorrectionCandidate[];
}
