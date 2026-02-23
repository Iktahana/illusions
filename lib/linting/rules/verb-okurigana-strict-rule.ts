import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OKURIGANA_REF: LintReference = {
  standard: "送り仮名の付け方（内閣告示、1973）",
};

/**
 * Dictionary of common verb okurigana errors.
 * wrong: the incorrect surface form
 * correct: the standard form per 送り仮名の付け方 本則
 */
const VERB_OKURIGANA_ERRORS: ReadonlyArray<{ wrong: string; correct: string }> = [
  { wrong: "動す", correct: "動かす" },
  { wrong: "著す", correct: "著わす" },
  { wrong: "表す", correct: "表わす" },
  { wrong: "現す", correct: "現わす" },
  { wrong: "行う", correct: "行う" }, // placeholder — actually standard, skip
  { wrong: "断る", correct: "断る" }, // placeholder, skip
  { wrong: "承る", correct: "承る" }, // placeholder, skip
  // Actual errors below
  { wrong: "浮ぶ", correct: "浮かぶ" },
  { wrong: "生れる", correct: "生まれる" },
  { wrong: "押える", correct: "押さえる" },
  { wrong: "起る", correct: "起こる" },
  { wrong: "収る", correct: "収まる" },
  { wrong: "縮る", correct: "縮まる" },
  { wrong: "従う", correct: "従う" }, // standard — skip
].filter((pair) => pair.wrong !== pair.correct);

/**
 * Find all non-overlapping occurrences of a literal string in text.
 */
function findAllOccurrences(text: string, needle: string): number[] {
  const indices: number[] = [];
  let pos = 0;
  while (pos <= text.length - needle.length) {
    const idx = text.indexOf(needle, pos);
    if (idx === -1) break;
    indices.push(idx);
    pos = idx + needle.length;
  }
  return indices;
}

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Verb Okurigana Strict Rule (L1)
 *
 * Detects common verb okurigana errors based on 送り仮名の付け方 本則.
 * Flags forms that omit required okurigana from verbs.
 *
 * Reference: 送り仮名の付け方（内閣告示、1973）
 */
export class VerbOkuriganaStrictRule extends AbstractLintRule {
  readonly id = "verb-okurigana-strict";
  override engine: CorrectionEngine = "regex";
  readonly name = "Verb Okurigana (Strict)";
  readonly nameJa = "動詞の送り仮名「本則」";
  readonly description = "Detect verb okurigana errors per 送り仮名の付け方 本則";
  readonly descriptionJa = "送り仮名の付け方（内閣告示、1973）の本則に基づき、動詞の送り仮名の誤りを検出します";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "error",
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];
    const issues: LintIssue[] = [];

    for (const { wrong, correct } of VERB_OKURIGANA_ERRORS) {
      for (const from of findAllOccurrences(text, wrong)) {
        const to = from + wrong.length;
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `"${wrong}" is an incorrect okurigana form. Standard form: "${correct}"`,
          messageJa: `「${wrong}」は送り仮名の誤りです。正しくは「${correct}」です（送り仮名の付け方 本則）`,
          from,
          to,
          originalText: wrong,
          reference: OKURIGANA_REF,
          fix: {
            label: `Replace with "${correct}"`,
            labelJa: `「${correct}」に置換`,
            replacement: correct,
          },
        });
      }
    }

    return issues;
  }
}
