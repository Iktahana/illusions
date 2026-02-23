import { AbstractLintRule } from "../base-rule";
import { maskDialogue } from "../helpers/dialogue-mask";
import { splitIntoSentences } from "../helpers/sentence-splitter";
import type { LintIssue, LintRuleConfig, LintReference , CorrectionEngine} from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Reference to style guide for particle usage */
const STYLE_GUIDE_REF: LintReference = {
  standard: "日本語スタイルガイド",
};

/**
 * Words that contain の but are NOT particle usage.
 * Ordered longest-first to ensure greedy matching.
 */
const EXCEPTION_WORDS: readonly string[] = [
  "このまま",
  "そのまま",
  "あのまま",
  "ものの",
  "もの",
  "この",
  "その",
  "あの",
  "どの",
] as const;

/**
 * Build a regex that matches any exception word containing の.
 * Used to mask these words before counting particle の occurrences.
 */
function buildExceptionPattern(): RegExp {
  // Escape is unnecessary for these words, but sort by length descending
  // to ensure longer matches take priority (e.g. "ものの" before "もの")
  const sorted = [...EXCEPTION_WORDS].sort((a, b) => b.length - a.length);
  return new RegExp(sorted.join("|"), "g");
}

const EXCEPTION_PATTERN = buildExceptionPattern();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Count the number of particle の occurrences in a sentence.
 *
 * Strategy:
 * 1. Replace all known exception words (この, その, etc.) with
 *    placeholder characters that do not contain の.
 * 2. Count remaining の characters in the masked sentence.
 *
 * This is a simplified L1 heuristic. An L2 implementation would
 * use morphological analysis (kuromoji) for accurate POS tagging.
 */
function countParticleNo(sentence: string): number {
  // Replace exception words with same-length placeholders (using 〇)
  const masked = sentence.replace(EXCEPTION_PATTERN, (match) =>
    "〇".repeat(match.length),
  );

  // Count remaining の characters
  let count = 0;
  for (const ch of masked) {
    if (ch === "の") {
      count++;
    }
  }

  return count;
}

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Particle の Repetition Rule (L1)
 *
 * Detects excessive use of the particle の within a single sentence.
 * Repeated の creates deeply nested noun modification chains that
 * reduce readability (e.g. "私の友人の兄の会社の社長の車").
 *
 * The rule splits text into sentences, counts particle の occurrences
 * (excluding known compound words like この, その, もの), and flags
 * sentences that meet or exceed the configurable threshold.
 *
 * Reference: 日本語スタイルガイド
 */
export class ParticleNoRepetitionRule extends AbstractLintRule {
  readonly id = "particle-no-repetition";
  override engine: CorrectionEngine = "regex";
  readonly name = "Excessive particle の usage";
  readonly nameJa = "助詞「の」の連続使用";
  readonly description =
    "Detect excessive use of particle の in a single sentence";
  readonly descriptionJa = "1文中の「の」の多用を検出";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "info",
    skipDialogue: true,
    options: {
      threshold: 4,
    },
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];

    const maskedText = config.skipDialogue ? maskDialogue(text) : text;
    const threshold = (config.options?.threshold as number) ?? 4;
    const sentences = splitIntoSentences(maskedText);
    const issues: LintIssue[] = [];

    for (const sentence of sentences) {
      const count = countParticleNo(sentence.text);

      if (count >= threshold) {
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Excessive particle の usage: ${count} occurrences in one sentence (recommended: fewer than ${threshold})`,
          messageJa: `「日本語スタイルガイドに基づき、1文中に助詞「の」が${count}回使用されています（推奨: ${threshold}回未満）」`,
          from: sentence.from,
          to: sentence.to,
          reference: STYLE_GUIDE_REF,
        });
      }
    }

    return issues;
  }
}
