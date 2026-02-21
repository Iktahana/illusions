import type { ILlmClient } from "@/lib/llm-client/types";
import type { Token } from "@/lib/nlp-client/types";

import type {
  LintRule,
  LintRuleConfig,
  LintIssue,
  DocumentLintRule,
  MorphologicalLintRule,
  MorphologicalDocumentLintRule,
  LlmLintRule,
} from "./types";

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

/**
 * Abstract base class for document-level lint rules.
 * These rules analyze all paragraphs together for cross-paragraph checks.
 *
 * The per-paragraph `lint()` method returns empty since document-level
 * rules only produce meaningful results when given the full document.
 */
export abstract class AbstractDocumentLintRule extends AbstractLintRule implements DocumentLintRule {
  abstract lintDocument(
    paragraphs: ReadonlyArray<{ text: string; index: number }>,
    config: LintRuleConfig,
  ): Array<{ paragraphIndex: number; issues: LintIssue[] }>;

  /** Document-level rules return no issues when called per-paragraph. */
  lint(_text: string, _config: LintRuleConfig): LintIssue[] {
    return [];
  }
}

/**
 * Abstract base class for morphological (L2) lint rules.
 * These rules receive pre-tokenized kuromoji data.
 * The `lint()` method returns empty since L2 rules need tokens.
 */
export abstract class AbstractMorphologicalLintRule
  extends AbstractLintRule
  implements MorphologicalLintRule
{
  abstract lintWithTokens(
    text: string,
    tokens: ReadonlyArray<Token>,
    config: LintRuleConfig,
  ): LintIssue[];

  /** L2 rules return no issues without tokens. */
  lint(_text: string, _config: LintRuleConfig): LintIssue[] {
    return [];
  }
}

/**
 * Abstract base class for morphological document-level lint rules.
 * These rules analyze all paragraphs together with kuromoji tokens.
 */
export abstract class AbstractMorphologicalDocumentLintRule
  extends AbstractLintRule
  implements MorphologicalDocumentLintRule
{
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
}

/**
 * Abstract base class for LLM-based lint rules (L3).
 * Subclasses implement lintWithLlm(). The sync lint() is a no-op.
 */
export abstract class AbstractLlmLintRule
  extends AbstractLintRule
  implements LlmLintRule
{
  readonly level = "L3" as const;

  lint(_text: string, _config: LintRuleConfig): LintIssue[] {
    return []; // L3 rules only run via lintWithLlm()
  }

  abstract lintWithLlm(
    sentences: ReadonlyArray<{ text: string; from: number; to: number }>,
    config: LintRuleConfig,
    llmClient: ILlmClient,
    signal?: AbortSignal,
  ): Promise<LintIssue[]>;
}
