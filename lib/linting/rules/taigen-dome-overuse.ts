import type { Token } from "@/lib/nlp-client/types";
import { AbstractMorphologicalLintRule } from "../base-rule";
import { isInDialogue } from "../helpers/dialogue-mask";
import type { SentenceSpan } from "../helpers/sentence-splitter";
import { splitIntoSentences } from "../helpers/sentence-splitter";
import type { LintIssue, LintRuleConfig, LintReference } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Reference to the Japanese style guide */
const STYLE_GUIDE_REF: LintReference = {
  standard: "日本語スタイルガイド",
};

/**
 * Determine whether a sentence ends with a noun (体言止め).
 *
 * Finds the last meaningful token in the sentence (skipping punctuation
 * marks and whitespace-only surfaces) and checks if its POS is 名詞.
 */
function isTaigenDome(
  sentence: SentenceSpan,
  tokens: ReadonlyArray<Token>,
): boolean {
  // Filter tokens that belong to this sentence
  const sentenceTokens = tokens.filter(
    (t) => t.start >= sentence.from && t.end <= sentence.to,
  );

  // Find last meaningful token (skip 記号 and whitespace-only surfaces)
  const lastMeaningful = [...sentenceTokens]
    .reverse()
    .find((t) => t.pos !== "記号" && t.surface.trim().length > 0);

  return lastMeaningful?.pos === "名詞";
}

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Taigen-dome Overuse Detection Rule (L2)
 *
 * Detects consecutive sentences that end with a noun (体言止め).
 * Uses morphological analysis (kuromoji tokens) to identify the last
 * meaningful token of each sentence and check its part-of-speech.
 *
 * When the number of consecutive noun-ending sentences meets or exceeds
 * the threshold (default 4), the entire run is flagged.
 *
 * Reference: 日本語スタイルガイド
 */
export class TaigenDomeOveruseRule extends AbstractMorphologicalLintRule {
  readonly id = "taigen-dome-overuse";
  readonly name = "Taigen-dome Overuse";
  readonly nameJa = "体言止めの多用検出";
  readonly description = "Flags consecutive sentences ending with nouns";
  readonly descriptionJa =
    "体言止めが連続している箇所を検出します";
  readonly level = "L2" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "info",
    options: {
      threshold: 4,
    },
  };

  lintWithTokens(
    text: string,
    tokens: ReadonlyArray<Token>,
    config: LintRuleConfig,
  ): LintIssue[] {
    if (!text || tokens.length === 0) return [];

    const threshold = (config.options?.threshold as number) ?? 4;
    const sentences = splitIntoSentences(text);

    if (sentences.length < threshold) return [];

    const issues: LintIssue[] = [];
    let runStart = 0;
    let runLength = 0;

    for (let i = 0; i < sentences.length; i++) {
      // Skip sentences inside dialogue
      if (config.skipDialogue && isInDialogue(sentences[i].from, text)) {
        if (runLength >= threshold) {
          issues.push(
            this.createIssue(sentences, runStart, runLength, config),
          );
        }
        runLength = 0;
        continue;
      }

      if (isTaigenDome(sentences[i], tokens)) {
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
   * Create a LintIssue spanning the entire consecutive taigen-dome run.
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
      message: `${runLength} consecutive sentences end with nouns (taigen-dome)`,
      messageJa: `日本語スタイルガイドに基づき、${runLength}文連続で体言止めが使われています`,
      from,
      to,
      reference: STYLE_GUIDE_REF,
    };
  }
}
