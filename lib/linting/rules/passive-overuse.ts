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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine whether a set of tokens for a sentence contains a passive
 * voice construction.
 *
 * Kuromoji (IPAdic) passive detection strategy:
 * - Look for tokens with basic_form = "れる" or "られる" where POS = "動詞"
 *   and pos_detail_1 is "接尾" or "非自立" (auxiliary/suffix usage).
 * - Also check for される / させられる which may be tokenized as single tokens.
 *
 * Tokens with pos_detail_1 === "自立" are typically potential forms (可能),
 * not passive, so they are excluded.
 */
function hasPassiveVoice(sentenceTokens: ReadonlyArray<Token>): boolean {
  for (let i = 0; i < sentenceTokens.length; i++) {
    const token = sentenceTokens[i];
    const basicForm = token.basic_form ?? token.surface;

    // Check for passive auxiliary: れる or られる
    if (
      (basicForm === "れる" || basicForm === "られる") &&
      token.pos === "動詞"
    ) {
      // Verify it is being used as passive (接尾 or 非自立)
      if (
        token.pos_detail_1 === "接尾" ||
        token.pos_detail_1 === "非自立"
      ) {
        return true;
      }
    }

    // Check for される / させられる (may be tokenized as a single token)
    if (basicForm === "される" || basicForm === "させられる") {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Passive Overuse Rule (L2)
 *
 * Detects consecutive passive-voice sentences. Excessive use of passive
 * constructions creates awkward, indirect prose and reduces readability.
 *
 * Detection strategy:
 * 1. Split text into sentences by 。！？!?\n boundaries
 * 2. Skip sentences that are entirely within dialogue brackets
 * 3. Use morphological analysis to detect passive auxiliary verbs
 * 4. Track consecutive passive runs and flag when threshold is met
 *
 * Reference: 日本語スタイルガイド
 */
export class PassiveOveruseRule extends AbstractMorphologicalLintRule {
  readonly id = "passive-overuse";
  readonly name = "Passive Overuse";
  readonly nameJa = "受動態の多用検出";
  readonly description = "Flags consecutive passive-voice sentences";
  readonly descriptionJa =
    "受動態が連続して使われている箇所を検出します";
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

    // Step 1: Split text into sentences
    const sentences = splitIntoSentences(text);
    if (sentences.length < threshold) return [];

    const issues: LintIssue[] = [];

    // Step 2-3: Track consecutive passive runs, skipping dialogue
    let runStart = 0;
    let runLength = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];

      // Skip dialogue sentences
      if (isInDialogue(sentence.from, text)) {
        // Flush any pending run before skipping
        if (runLength >= threshold) {
          issues.push(
            this.createIssue(sentences, runStart, runLength, config),
          );
        }
        runLength = 0;
        continue;
      }

      // Filter tokens that belong to this sentence
      const sentenceTokens = tokens.filter(
        (t) => t.start >= sentence.from && t.end <= sentence.to,
      );

      if (hasPassiveVoice(sentenceTokens)) {
        if (runLength === 0) runStart = i;
        runLength++;
      } else {
        // End of a run: flush if it meets the threshold
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
      issues.push(
        this.createIssue(sentences, runStart, runLength, config),
      );
    }

    return issues;
  }

  /**
   * Create a lint issue spanning the consecutive passive-voice run.
   */
  private createIssue(
    sentences: SentenceSpan[],
    runStart: number,
    runLength: number,
    config: LintRuleConfig,
  ): LintIssue {
    return {
      ruleId: this.id,
      severity: config.severity,
      message: `${runLength} consecutive sentences use passive voice`,
      messageJa: `日本語スタイルガイドに基づき、${runLength}文連続で受動態が使われています`,
      from: sentences[runStart].from,
      to: sentences[runStart + runLength - 1].to,
      reference: STYLE_GUIDE_REF,
    };
  }
}
