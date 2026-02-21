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

/** Sentence-ending delimiter pattern */
const SENTENCE_DELIMITER = /[。！？!?\n]/;

/** POS categories considered as content words */
const CONTENT_POS = new Set(["名詞", "動詞", "形容詞", "副詞"]);

/** POS detail values to exclude */
const EXCLUDED_POS_DETAIL = new Set(["非自立", "接尾", "数"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A sentence with its text range in the source */
interface SentenceRange {
  /** Start offset in the original text (inclusive) */
  from: number;
  /** End offset in the original text (exclusive) */
  to: number;
}

/** A content word extracted from a sentence */
interface ContentWord {
  /** Normalized basic form */
  basicForm: string;
  /** Original token (for position info) */
  token: Token;
}

/**
 * Split text into sentence ranges by delimiter characters.
 * Each range represents the text between delimiters.
 */
function splitSentences(text: string): SentenceRange[] {
  const sentences: SentenceRange[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    if (SENTENCE_DELIMITER.test(text[i])) {
      // Only add non-empty sentences
      if (i > start) {
        sentences.push({ from: start, to: i });
      }
      start = i + 1;
    }
  }

  // Handle trailing text without a delimiter
  if (start < text.length) {
    sentences.push({ from: start, to: text.length });
  }

  return sentences;
}

/**
 * Extract content words from tokens that fall within a sentence range.
 *
 * Filters for nouns, verbs, i-adjectives, and adverbs while excluding
 * non-independent words, suffixes, numbers, proper nouns, and
 * single-character surface forms. Normalizes each token by its basic form.
 */
function extractContentWords(
  tokens: ReadonlyArray<Token>,
  sentence: SentenceRange,
): ContentWord[] {
  const words: ContentWord[] = [];

  for (const token of tokens) {
    // Only consider tokens within the sentence range
    if (token.start < sentence.from || token.end > sentence.to) continue;

    // Must be a content POS
    if (!CONTENT_POS.has(token.pos)) continue;

    // Exclude non-independent, suffix, number sub-categories
    if (token.pos_detail_1 && EXCLUDED_POS_DETAIL.has(token.pos_detail_1)) {
      continue;
    }

    // Exclude proper nouns
    if (token.pos_detail_1 === "固有名詞") continue;

    // Exclude single-character words
    if (token.surface.length <= 1) continue;

    // Normalize to basic form
    const basicForm =
      token.basic_form && token.basic_form !== "*"
        ? token.basic_form
        : token.surface;

    words.push({ basicForm, token });
  }

  return words;
}

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Word Repetition Rule (L2)
 *
 * Detects repeated content words within a sliding window of consecutive
 * sentences. When the same word (normalized by basic form) appears at
 * or above a configurable threshold within the window, the 2nd and
 * subsequent occurrences are flagged.
 *
 * Detection strategy:
 * 1. Split text into sentences by 。！？!?\n
 * 2. Extract content words per sentence using morphological analysis
 * 3. Slide a window across sentences, counting word occurrences
 * 4. Flag words exceeding the threshold (skip the first occurrence)
 * 5. Deduplicate issues from overlapping windows
 *
 * Reference: 日本語スタイルガイド
 */
export class WordRepetitionRule extends AbstractMorphologicalLintRule {
  readonly id = "word-repetition";
  readonly name = "Word Repetition";
  readonly nameJa = "近接語句の反復検出";
  readonly description =
    "Detects repeated content words in nearby sentences";
  readonly descriptionJa =
    "近接する文で同じ語句が繰り返し使われている箇所を検出します";
  readonly level = "L2" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "info",
    options: {
      threshold: 3,
      windowSize: 5,
    },
  };

  lintWithTokens(
    text: string,
    tokens: ReadonlyArray<Token>,
    config: LintRuleConfig,
  ): LintIssue[] {
    if (!text || tokens.length === 0) return [];

    const threshold = (config.options?.threshold as number) ?? 3;
    const windowSize = (config.options?.windowSize as number) ?? 5;

    // Step 1: Split text into sentences
    const sentences = splitSentences(text);
    if (sentences.length === 0) return [];

    // Step 2: Extract content words per sentence
    const sentenceWords: ContentWord[][] = sentences.map((sentence) =>
      extractContentWords(tokens, sentence),
    );

    // Step 3: Sliding window detection
    const issues: LintIssue[] = [];
    /** Track flagged token positions to avoid duplicates from overlapping windows */
    const flaggedPositions = new Set<string>();

    for (
      let windowStart = 0;
      windowStart <= sentences.length - windowSize;
      windowStart++
    ) {
      // Collect all content words in this window
      const windowWords: ContentWord[] = [];
      for (let i = windowStart; i < windowStart + windowSize; i++) {
        windowWords.push(...sentenceWords[i]);
      }

      // Count occurrences of each basicForm
      const counts = new Map<string, ContentWord[]>();
      for (const word of windowWords) {
        const existing = counts.get(word.basicForm);
        if (existing) {
          existing.push(word);
        } else {
          counts.set(word.basicForm, [word]);
        }
      }

      // Flag words exceeding the threshold
      for (const [basicForm, occurrences] of counts) {
        if (occurrences.length < threshold) continue;

        const count = occurrences.length;

        // Skip the first occurrence; flag 2nd and subsequent
        for (let i = 1; i < occurrences.length; i++) {
          const { token } = occurrences[i];
          const posKey = `${token.start}:${token.end}`;

          // Deduplicate: skip if this position was already flagged
          if (flaggedPositions.has(posKey)) continue;
          flaggedPositions.add(posKey);

          issues.push({
            ruleId: this.id,
            severity: config.severity,
            message: `'${basicForm}' appears ${count} times in ${windowSize} consecutive sentences`,
            messageJa: `日本語スタイルガイドに基づき、「${basicForm}」が${windowSize}文中に${count}回使われています`,
            from: token.start,
            to: token.end,
            reference: STYLE_GUIDE_REF,
          });
        }
      }
    }

    // Sort issues by position for consistent output
    issues.sort((a, b) => a.from - b.from || a.to - b.to);

    return issues;
  }
}
