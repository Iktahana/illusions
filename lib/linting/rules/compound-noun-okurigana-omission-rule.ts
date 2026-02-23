import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KANJI_REF: LintReference = {
  standard: "公用文における漢字使用等について（内閣訓令、2010）",
};

/**
 * Compound nouns where okurigana of the latter element should be omitted
 * in official writing.
 * verbose: the form with okurigana retained
 * official: the form used in official documents
 */
const COMPOUND_OKURIGANA_OMIT: ReadonlyArray<{ verbose: string; official: string }> = [
  { verbose: "書き留め", official: "書留" },
  { verbose: "書きとめ", official: "書留" },
  { verbose: "貸し付け", official: "貸付" },
  { verbose: "振り込み", official: "振込" },
  { verbose: "割り増し", official: "割増" },
  { verbose: "引き渡し", official: "引渡" },
  { verbose: "引き受け", official: "引受" },
  { verbose: "払い込み", official: "払込" },
  { verbose: "払い出し", official: "払出" },
  { verbose: "繰り越し", official: "繰越" },
  { verbose: "繰り入れ", official: "繰入" },
  { verbose: "差し引き", official: "差引" },
  { verbose: "見積もり", official: "見積" },
  { verbose: "組み合わせ", official: "組合" },
  { verbose: "割り引き", official: "割引" },
  { verbose: "申し込み", official: "申込" },
  { verbose: "受け付け", official: "受付" },
  { verbose: "売り上げ", official: "売上" },
  { verbose: "積み立て", official: "積立" },
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
 * Compound Noun Okurigana Omission Rule (L1)
 *
 * In official writing, compound nouns omit the okurigana of the latter element.
 * e.g., 「書き留め」→「書留」, 「振り込み」→「振込」
 *
 * Reference: 公用文における漢字使用等について（内閣訓令、2010）
 */
export class CompoundNounOkuriganaOmissionRule extends AbstractLintRule {
  readonly id = "compound-noun-okurigana-omission";
  override engine: CorrectionEngine = "regex";
  readonly name = "Compound Noun Okurigana Omission";
  readonly nameJa = "複合名詞の送り仮名省略";
  readonly description = "Compound nouns should omit okurigana in official documents";
  readonly descriptionJa = "公用文では複合名詞の後半要素の送り仮名を省略します（公用文における漢字使用等について）";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];
    const issues: LintIssue[] = [];

    for (const { verbose, official } of COMPOUND_OKURIGANA_OMIT) {
      for (const from of findAllOccurrences(text, verbose)) {
        const to = from + verbose.length;
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Compound noun "${verbose}" should be written as "${official}" in official documents`,
          messageJa: `公用文では「${verbose}」の送り仮名を省略し「${official}」と書きます（公用文における漢字使用等について）`,
          from,
          to,
          originalText: verbose,
          reference: KANJI_REF,
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
