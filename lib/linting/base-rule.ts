import type { Token } from "@/lib/nlp-client/types";

import type {
  CorrectionEngine,
  JsonRuleMeta,
  LintRule,
  LintRuleConfig,
  LintIssue,
  DocumentLintRule,
  MorphologicalLintRule,
  MorphologicalDocumentLintRule,
  RuleLevel,
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
  abstract readonly level: RuleLevel;
  abstract readonly defaultConfig: LintRuleConfig;
  /** Default engine for simple regex-based rules */
  engine: CorrectionEngine = "regex";

  abstract lint(text: string, config: LintRuleConfig): LintIssue[];
}

/**
 * Abstract base class for document-level lint rules.
 * These rules analyze all paragraphs together for cross-paragraph checks.
 */
export abstract class AbstractDocumentLintRule
  extends AbstractLintRule
  implements DocumentLintRule
{
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
}

/**
 * Abstract base class for morphological document-level lint rules.
 * These rules analyze all paragraphs together with kuromoji tokens.
 */
export abstract class AbstractMorphologicalDocumentLintRule
  extends AbstractLintRule
  implements MorphologicalDocumentLintRule
{
  /** Morphological document rules use kuromoji tokenization */
  override engine: CorrectionEngine = "morphological";

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
 * Abstract base class for data-driven L1 (regex) lint rules.
 * These rules are configured via JsonRuleMeta loaded from rules.json.
 */
export abstract class AbstractL1Rule extends AbstractLintRule {
  readonly meta: JsonRuleMeta;
  readonly id: string;
  readonly name: string;
  readonly nameJa: string;
  readonly description: string;
  readonly descriptionJa: string;
  readonly level: RuleLevel = "L1";
  readonly defaultConfig: LintRuleConfig;

  constructor(
    meta: JsonRuleMeta,
    config: {
      id: string;
      name: string;
      nameJa: string;
      description: string;
      descriptionJa: string;
      defaultConfig: LintRuleConfig;
    },
  ) {
    super();
    this.meta = meta;
    this.id = config.id;
    this.name = config.name;
    this.nameJa = config.nameJa;
    this.description = config.description;
    this.descriptionJa = config.descriptionJa;
    this.defaultConfig = config.defaultConfig;
  }
}
