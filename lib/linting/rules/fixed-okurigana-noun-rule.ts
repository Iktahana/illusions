import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OKURIGANA_REF: LintReference = {
  standard: "送り仮名の付け方（内閣告示、1973）",
};

/**
 * Nouns where okurigana should be omitted in official writing (公用文).
 * These are established by 送り仮名の付け方 §許容.
 */
const OMIT_OKURIGANA: ReadonlyArray<{ verbose: string; official: string }> = [
  { verbose: "手続き", official: "手続" },
  { verbose: "問合わせ", official: "問合せ" },
  { verbose: "取扱い", official: "取扱" },
  { verbose: "申込み", official: "申込" },
  { verbose: "受付け", official: "受付" },
  { verbose: "売上げ", official: "売上" },
  { verbose: "積立て", official: "積立" },
  { verbose: "繰越し", official: "繰越" },
  { verbose: "貸出し", official: "貸出" },
  { verbose: "払出し", official: "払出" },
  { verbose: "払込み", official: "払込" },
  { verbose: "振出し", official: "振出" },
  { verbose: "引受け", official: "引受" },
  { verbose: "引渡し", official: "引渡" },
  { verbose: "見積り", official: "見積" },
  { verbose: "割引き", official: "割引" },
  { verbose: "貸付け", official: "貸付" },
  { verbose: "繰入れ", official: "繰入" },
  { verbose: "差引き", official: "差引" },
  { verbose: "組合せ", official: "組合" },
];

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
 * Fixed Okurigana Noun Rule (L1)
 *
 * In official writing (公用文), certain compound nouns have their okurigana
 * omitted by convention per 送り仮名の付け方 §許容.
 * e.g., 手続き → 手続, 取扱い → 取扱
 *
 * Reference: 送り仮名の付け方（内閣告示、1973）
 */
export class FixedOkuriganaNounRule extends AbstractLintRule {
  readonly id = "fixed-okurigana-noun";
  override engine: CorrectionEngine = "regex";
  readonly name = "Fixed Okurigana Noun";
  readonly nameJa = "慣用固定名詞の送り仮名省略";
  readonly description = "Detect noun okurigana that should be omitted in official writing";
  readonly descriptionJa = "公用文では慣用が固定した名詞の送り仮名を省略します（送り仮名の付け方 §許容）";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];
    const issues: LintIssue[] = [];

    for (const { verbose, official } of OMIT_OKURIGANA) {
      for (const from of findAllOccurrences(text, verbose)) {
        const to = from + verbose.length;
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `"${verbose}" should be written as "${official}" in official documents (okurigana omission)`,
          messageJa: `公用文では「${verbose}」の送り仮名を省略し「${official}」と書きます（送り仮名の付け方 §許容）`,
          from,
          to,
          originalText: verbose,
          reference: OKURIGANA_REF,
          fix: {
            label: `Replace with "${official}"`,
            labelJa: `「${official}」に置換`,
            replacement: official,
          },
        });
      }
    }

    return issues;
  }
}
