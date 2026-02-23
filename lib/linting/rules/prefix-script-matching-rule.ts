import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KANJI_REF: LintReference = {
  standard: "公用文における漢字使用等について（内閣訓令、2010）",
};

/**
 * Known mismatches of お/ご prefix with word type.
 * Rule: 和語 → お〜, 漢語 → ご〜
 *
 * wrong: incorrect prefix + word combination
 * correct: correct prefix + word combination
 * note: explanation of the mismatch
 */
const PREFIX_MISMATCH_PAIRS: ReadonlyArray<{
  wrong: string;
  correct: string;
  note: string;
}> = [
  // ご+和語 (should be お+和語)
  { wrong: "ご心配", correct: "お心配", note: "「心配」は和語的使用のためお〜が適切" },
  { wrong: "ご手紙", correct: "お手紙", note: "「手紙」は和語のためお〜が適切" },
  { wrong: "ご祝儀", correct: "ご祝儀", note: "「祝儀」は漢語のためご〜が適切（正しい）" },
  // お+漢語 (should be ご+漢語)
  { wrong: "お利用", correct: "ご利用", note: "「利用」は漢語のためご〜が適切" },
  { wrong: "お案内", correct: "ご案内", note: "「案内」は漢語のためご〜が適切" },
  { wrong: "お連絡", correct: "ご連絡", note: "「連絡」は漢語のためご〜が適切" },
  { wrong: "お確認", correct: "ご確認", note: "「確認」は漢語のためご〜が適切" },
  { wrong: "お報告", correct: "ご報告", note: "「報告」は漢語のためご〜が適切" },
  { wrong: "お説明", correct: "ご説明", note: "「説明」は漢語のためご〜が適切" },
  { wrong: "お参加", correct: "ご参加", note: "「参加」は漢語のためご〜が適切" },
  { wrong: "お協力", correct: "ご協力", note: "「協力」は漢語のためご〜が適切" },
  { wrong: "お質問", correct: "ご質問", note: "「質問」は漢語のためご〜が適切" },
  { wrong: "お返信", correct: "ご返信", note: "「返信」は漢語のためご〜が適切" },
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
 * Prefix Script Matching Rule (L1)
 *
 * The honorific prefixes 「お」and「ご」follow a script-matching rule:
 * - Yamato words (和語): お〜 (e.g., お手紙, お願い)
 * - Sino-Japanese words (漢語): ご〜 (e.g., ご利用, ご確認)
 *
 * This rule flags known mismatches from a dictionary.
 *
 * Reference: 公用文における漢字使用等について（内閣訓令、2010）
 */
export class PrefixScriptMatchingRule extends AbstractLintRule {
  readonly id = "prefix-script-matching";
  override engine: CorrectionEngine = "regex";
  readonly name = "Honorific Prefix Script Matching (お/ご)";
  readonly nameJa = "接頭語「御・ご・お」の使い分け";
  readonly description = "Yamato words take お〜, Sino-Japanese words take ご〜";
  readonly descriptionJa = "和語にはお〜、漢語にはご〜を付けます（公用文における漢字使用等について）";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];
    const issues: LintIssue[] = [];

    for (const { wrong, correct, note } of PREFIX_MISMATCH_PAIRS) {
      for (const from of findAllOccurrences(text, wrong)) {
        const to = from + wrong.length;
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `"${wrong}" uses incorrect honorific prefix. Consider "${correct}". (${note})`,
          messageJa: `「${wrong}」の接頭語が不適切です。「${correct}」を検討してください。（${note}）`,
          from,
          to,
          originalText: wrong,
          reference: KANJI_REF,
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
