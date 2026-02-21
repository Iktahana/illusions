import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Reference to the Japanese style guide */
const STYLE_GUIDE_REF: LintReference = {
  standard: "日本語スタイルガイド",
};

/** Sentence-ending delimiters */
const SENTENCE_DELIMITERS = /[。！？!?\n]/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Represents a sentence extracted from source text,
 * along with its character offsets.
 */
interface SentenceSpan {
  /** Start offset in the original text (inclusive) */
  from: number;
  /** End offset in the original text (exclusive) */
  to: number;
  /** The raw sentence text (before masking) */
  text: string;
}

/**
 * Split text into sentences by delimiter characters (。！？!?\n),
 * tracking the original character offsets of each sentence.
 *
 * Empty sentences (whitespace-only) are skipped.
 */
function splitSentences(text: string): SentenceSpan[] {
  const sentences: SentenceSpan[] = [];
  let sentenceStart = 0;

  for (let i = 0; i < text.length; i++) {
    if (SENTENCE_DELIMITERS.test(text[i])) {
      const content = text.slice(sentenceStart, i);

      // Skip empty / whitespace-only segments
      if (content.trim().length > 0) {
        sentences.push({
          from: sentenceStart,
          to: i, // Exclude the delimiter itself from the span
          text: content,
        });
      }

      sentenceStart = i + 1;
    }
  }

  // Handle trailing text without a delimiter
  if (sentenceStart < text.length) {
    const content = text.slice(sentenceStart);
    if (content.trim().length > 0) {
      sentences.push({
        from: sentenceStart,
        to: text.length,
        text: content,
      });
    }
  }

  return sentences;
}

/**
 * Mask dialogue content inside bracket pairs so that dialogue characters
 * are not counted toward the sentence length.
 *
 * Handles nested brackets by tracking depth for each bracket type:
 * - `「…」` (corner brackets)
 * - `『…』` (double corner brackets)
 *
 * Characters inside dialogue are replaced with the placeholder `〇`
 * to preserve string length / offsets.
 */
function maskDialogue(sentence: string): string {
  const chars = Array.from(sentence);
  let cornerDepth = 0; // 「」 depth
  let doubleCornerDepth = 0; // 『』 depth

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    if (ch === "「") {
      cornerDepth++;
      chars[i] = "〇";
      continue;
    }
    if (ch === "」") {
      if (cornerDepth > 0) cornerDepth--;
      chars[i] = "〇";
      continue;
    }
    if (ch === "『") {
      doubleCornerDepth++;
      chars[i] = "〇";
      continue;
    }
    if (ch === "』") {
      if (doubleCornerDepth > 0) doubleCornerDepth--;
      chars[i] = "〇";
      continue;
    }

    // Inside any dialogue — mask the character
    if (cornerDepth > 0 || doubleCornerDepth > 0) {
      chars[i] = "〇";
    }
  }

  return chars.join("");
}

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Sentence Length Rule (L1)
 *
 * Detects sentences that exceed a configurable character length threshold.
 * Long sentences reduce readability; the default threshold is 100 characters.
 *
 * Detection strategy:
 * 1. Split text into sentences at 。！？!?\n delimiters
 * 2. Mask dialogue content (「…」 / 『…』) so it is not counted
 * 3. Measure the effective length (excluding masked placeholders)
 * 4. Flag sentences whose effective length exceeds the threshold
 *
 * Reference: 日本語スタイルガイド
 */
export class SentenceLengthRule extends AbstractLintRule {
  readonly id = "sentence-length";
  readonly name = "Sentence Length";
  readonly nameJa = "長文の検出";
  readonly description =
    "Flags sentences exceeding configurable length threshold";
  readonly descriptionJa = "設定した文字数を超える文を検出します";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "info",
    options: {
      maxLength: 100,
    },
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];

    const maxLength = (config.options?.maxLength as number) ?? 100;
    const sentences = splitSentences(text);
    const issues: LintIssue[] = [];

    for (const sentence of sentences) {
      const masked = maskDialogue(sentence.text);
      // Effective length: exclude the placeholder characters
      const effectiveLength = masked.replace(/〇/g, "").length;

      if (effectiveLength > maxLength) {
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Sentence is ${effectiveLength} characters long (threshold: ${maxLength})`,
          messageJa: `日本語スタイルガイドに基づき、一文が${effectiveLength}文字あります（推奨上限: ${maxLength}文字）`,
          from: sentence.from,
          to: sentence.to,
          reference: STYLE_GUIDE_REF,
        });
      }
    }

    return issues;
  }
}
