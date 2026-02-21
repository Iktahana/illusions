import { AbstractMorphologicalLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference } from "../types";
import type { Token } from "@/lib/nlp-client/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Reference to the Japanese style guide */
const STYLE_GUIDE_REF: LintReference = {
  standard: "日本語スタイルガイド",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Represents a sentence extracted from source text,
 * along with its character offsets.
 */
interface SentenceSpan {
  text: string;
  from: number;
  to: number;
}

/**
 * Split text into sentences at sentence-ending delimiters,
 * tracking character positions for each sentence.
 *
 * Delimiters: 。 ！ ？ ! ? \n
 * Empty or whitespace-only segments are skipped.
 */
function splitIntoSentences(text: string): SentenceSpan[] {
  const sentences: SentenceSpan[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (
      ch === "\u3002" || // 。
      ch === "\uFF01" || // ！
      ch === "\uFF1F" || // ？
      ch === "!" ||
      ch === "?" ||
      ch === "\n"
    ) {
      const sentenceText = text.substring(start, i);
      if (sentenceText.trim().length > 0) {
        sentences.push({ text: sentenceText, from: start, to: i });
      }
      start = i + 1;
    }
  }

  // Handle trailing text without delimiter
  if (start < text.length) {
    const sentenceText = text.substring(start);
    if (sentenceText.trim().length > 0) {
      sentences.push({ text: sentenceText, from: start, to: text.length });
    }
  }

  return sentences;
}

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Conjunction Overuse Detection Rule (L2)
 *
 * Detects consecutive sentences that begin with a conjunction (接続詞).
 * Uses morphological analysis (kuromoji tokens) to identify the first
 * meaningful token of each sentence and check its part-of-speech.
 *
 * When the number of consecutive conjunction-starting sentences meets
 * or exceeds the threshold (default 3), the entire run is flagged.
 *
 * Reference: 日本語スタイルガイド
 */
export class ConjunctionOveruseRule extends AbstractMorphologicalLintRule {
  readonly id = "conjunction-overuse";
  readonly name = "Conjunction Overuse";
  readonly nameJa = "接続詞の多用検出";
  readonly description =
    "Flags consecutive sentences starting with conjunctions";
  readonly descriptionJa =
    "接続詞で始まる文が連続している箇所を検出します";
  readonly level = "L2" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "info",
    options: {
      threshold: 3,
    },
  };

  lintWithTokens(
    text: string,
    tokens: ReadonlyArray<Token>,
    config: LintRuleConfig,
  ): LintIssue[] {
    if (!text || tokens.length === 0) return [];

    const threshold = (config.options?.threshold as number) ?? 3;
    const sentences = splitIntoSentences(text);

    if (sentences.length < threshold) return [];

    const issues: LintIssue[] = [];
    let runStart = 0;
    let runLength = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];

      // Filter tokens that belong to this sentence
      const sentenceTokens = tokens.filter(
        (t) => t.start >= sentence.from && t.end <= sentence.to,
      );

      // Find the first meaningful (non-whitespace) token
      const firstToken = sentenceTokens.find(
        (t) => t.surface.trim().length > 0,
      );

      const startsWithConjunction = firstToken?.pos === "接続詞";

      if (startsWithConjunction) {
        if (runLength === 0) {
          runStart = i;
        }
        runLength++;
      } else {
        if (runLength >= threshold) {
          issues.push(
            this.createIssue(sentences, runStart, runLength, config),
          );
        }
        runLength = 0;
      }
    }

    // Flush final run
    if (runLength >= threshold) {
      issues.push(this.createIssue(sentences, runStart, runLength, config));
    }

    return issues;
  }

  /**
   * Create a LintIssue spanning the entire consecutive conjunction run.
   */
  private createIssue(
    sentences: SentenceSpan[],
    runStart: number,
    runLength: number,
    config: LintRuleConfig,
  ): LintIssue {
    const from = sentences[runStart].from;
    const to = sentences[runStart + runLength - 1].to;

    return {
      ruleId: this.id,
      severity: config.severity,
      message: `${runLength} consecutive sentences start with conjunctions`,
      messageJa: `日本語スタイルガイドに基づき、${runLength}文連続で接続詞から始まっています`,
      from,
      to,
      reference: STYLE_GUIDE_REF,
    };
  }
}
