import { AbstractLintRule } from "../base-rule";
import { isInDialogue } from "../helpers/dialogue-mask";
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
 * Represents a sentence extracted from source text,
 * along with its character offsets and detected ending pattern.
 */
interface SentenceInfo {
  /** Start offset in the original text (inclusive) */
  from: number;
  /** End offset in the original text (exclusive, includes the 。) */
  to: number;
  /** Detected ending pattern (last 2 characters before 。), or null if too short */
  endingPattern: string | null;
}

/**
 * Find all sentence boundaries by locating 。 positions in the text,
 * then extract sentence information including ending patterns.
 *
 * Handles edge cases:
 * - Empty sentences (consecutive 。。) are skipped
 * - Dialogue endings (」。) extract the pattern from before 」
 * - Very short sentences (fewer than 2 characters) get a null pattern
 */
function extractSentences(text: string): SentenceInfo[] {
  const sentences: SentenceInfo[] = [];
  let sentenceStart = 0;

  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "。") continue;

    // Extract the sentence content (text before 。)
    const content = text.slice(sentenceStart, i);

    // Skip empty sentences (e.g., consecutive 。。 or leading 。)
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      sentenceStart = i + 1;
      continue;
    }

    // Determine the effective ending text, stripping trailing 」 for dialogue
    let effectiveEnding = trimmed;
    if (effectiveEnding.endsWith("」")) {
      effectiveEnding = effectiveEnding.slice(0, -1);
    }

    // Extract the last 2 characters as the ending pattern
    let endingPattern: string | null = null;
    if (effectiveEnding.length >= 2) {
      endingPattern = effectiveEnding.slice(-2);
    } else if (effectiveEnding.length === 1) {
      // Single character endings (e.g., just "た。")
      endingPattern = effectiveEnding;
    }

    sentences.push({
      from: sentenceStart,
      to: i + 1, // Include the 。 character
      endingPattern,
    });

    sentenceStart = i + 1;
  }

  return sentences;
}

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Sentence Ending Repetition Rule (L1)
 *
 * Detects when the same sentence-ending pattern appears consecutively
 * at or above a configurable threshold (default: 3). Repeated sentence
 * endings (e.g., "...ます。...ます。...ます。") create a monotonous
 * rhythm and reduce readability in Japanese prose.
 *
 * Detection strategy:
 * 1. Find sentence boundaries by locating 。 positions
 * 2. Extract the last 2 characters before 。 as the "ending pattern"
 * 3. Track consecutive runs of the same pattern
 * 4. Flag runs that meet or exceed the threshold
 *
 * Reference: 日本語スタイルガイド
 */
export class SentenceEndingRepetitionRule extends AbstractLintRule {
  readonly id = "sentence-ending-repetition";
  readonly name = "Sentence ending repetition";
  readonly nameJa = "文末表現の重複";
  readonly description =
    "Detect consecutive sentences with the same ending pattern";
  readonly descriptionJa = "同じ文末表現が連続する箇所を検出";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "info",
    options: {
      threshold: 3,
    },
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];

    const threshold = (config.options?.threshold as number) ?? 3;
    const sentences = extractSentences(text);

    // Need at least `threshold` sentences to detect a run
    if (sentences.length < threshold) return [];

    const issues: LintIssue[] = [];

    // Track consecutive runs of the same ending pattern
    let runStart = 0;
    let runPattern: string | null = null;
    let runLength = 0;

    for (let i = 0; i < sentences.length; i++) {
      const pattern = sentences[i].endingPattern;

      // Skip sentences inside dialogue
      if (isInDialogue(sentences[i].from, text)) {
        if (runLength >= threshold && runPattern !== null) {
          issues.push(
            this.createIssue(
              sentences,
              runStart,
              i - 1,
              runPattern,
              runLength,
              config.severity,
            ),
          );
        }
        runPattern = null;
        runLength = 0;
        runStart = i + 1;
        continue;
      }

      // Skip sentences with no detectable pattern (too short)
      if (pattern === null) {
        // Flush any pending run before resetting
        if (runLength >= threshold && runPattern !== null) {
          issues.push(
            this.createIssue(
              sentences,
              runStart,
              i - 1,
              runPattern,
              runLength,
              config.severity,
            ),
          );
        }
        runPattern = null;
        runLength = 0;
        runStart = i + 1;
        continue;
      }

      if (pattern === runPattern) {
        // Continue the current run
        runLength++;
      } else {
        // Different pattern: flush the previous run if it meets threshold
        if (runLength >= threshold && runPattern !== null) {
          issues.push(
            this.createIssue(
              sentences,
              runStart,
              i - 1,
              runPattern,
              runLength,
              config.severity,
            ),
          );
        }
        // Start a new run
        runPattern = pattern;
        runStart = i;
        runLength = 1;
      }
    }

    // Flush final run
    if (runLength >= threshold && runPattern !== null) {
      issues.push(
        this.createIssue(
          sentences,
          runStart,
          sentences.length - 1,
          runPattern,
          runLength,
          config.severity,
        ),
      );
    }

    return issues;
  }

  /**
   * Create a lint issue spanning the consecutive run of repeated endings.
   */
  private createIssue(
    sentences: SentenceInfo[],
    runStartIndex: number,
    runEndIndex: number,
    pattern: string,
    count: number,
    severity: LintIssue["severity"],
  ): LintIssue {
    return {
      ruleId: this.id,
      severity,
      message: `Sentence ending repetition: pattern "${pattern}" appears ${count} times consecutively (recommended: fewer than ${count})`,
      messageJa: `「日本語スタイルガイドに基づき、同じ文末表現「${pattern}」が${count}文連続しています。文末の変化をお勧めします」`,
      from: sentences[runStartIndex].from,
      to: sentences[runEndIndex].to,
      reference: STYLE_GUIDE_REF,
    };
  }
}
