import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KOYO_REF: LintReference = {
  standard: "公用文作成の考え方（文化審議会、2022）",
};

/**
 * Literary/classical Japanese (文語調) patterns to avoid in modern official writing.
 * These are archaic endings and expressions that should be replaced
 * with modern equivalents.
 */
const LITERARY_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  example: string;
  modern: string;
  note: string;
}> = [
  {
    pattern: /せり[。、\s]/g,
    example: "〜せり",
    modern: "〜した",
    note: "文語の完了形「〜せり」は現代語に言い換えてください",
  },
  {
    // Negative lookbehind excludes modern 「〜になり」「〜となり」
    // and onomatopoeia like めりなり, びなり etc.
    pattern: /(?<![にと])なり[。、\s]/g,
    example: "〜なり",
    modern: "〜である",
    note: "文語の断定「〜なり」は「〜である」に言い換えてください",
  },
  {
    // Negative lookbehind excludes onomatopoeia: ぽたり, ぱたり, ばたり, がたり,
    // かたり, はたり, ぴたり, ひたり, and っ-geminate forms (ぐったり, ばったり, etc.)
    pattern: /(?<![ぽぱばがかはぴひっ])たり[。、\s]/g,
    example: "〜たり",
    modern: "〜た",
    note: "文語の完了「〜たり」は「〜た」に言い換えてください",
  },
  {
    pattern: /べし[。、\s]/g,
    example: "〜べし",
    modern: "〜すべきである",
    note: "文語の推量・義務「〜べし」は「〜すべきである」に言い換えてください",
  },
  {
    pattern: /にて[、。\s]/g,
    example: "〜にて",
    modern: "〜で",
    note: "文語の場所・手段「〜にて」は「〜で」に言い換えてください",
  },
  {
    pattern: /のみ[。、\s]/g,
    example: "〜のみ",
    modern: "〜だけ",
    note: "「のみ」は文語的。「だけ」を使うことが多い（文脈によっては許容）",
  },
  {
    pattern: /なれども/g,
    example: "〜なれども",
    modern: "〜であるが",
    note: "文語の逆接「〜なれども」は「〜であるが」に言い換えてください",
  },
  {
    pattern: /いわんや/g,
    example: "いわんや",
    modern: "まして",
    note: "文語の強調「いわんや」は「まして」に言い換えてください",
  },
  {
    pattern: /しかるに/g,
    example: "しかるに",
    modern: "しかし",
    note: "文語の逆接「しかるに」は「しかし」に言い換えてください",
  },
  {
    pattern: /しかれども/g,
    example: "しかれども",
    modern: "しかしながら",
    note: "文語の逆接「しかれども」は「しかしながら」に言い換えてください",
  },
  {
    pattern: /〜ごとく/g,
    example: "〜ごとく",
    modern: "〜のように",
    note: "文語の比況「〜ごとく」は「〜のように」に言い換えてください",
  },
];

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Literary Style Exclusion Rule (L1)
 *
 * Classical Japanese (文語調) expressions should be avoided in modern
 * official writing. This rule detects archaic endings and forms
 * that should be replaced with contemporary equivalents.
 *
 * e.g., 「〜せり」→「〜した」, 「〜なり」→「〜である」, 「〜べし」→「〜すべきである」
 *
 * Reference: 公用文作成の考え方（文化審議会、2022）
 */
export class LiteraryStyleExclusionRule extends AbstractLintRule {
  readonly id = "literary-style-exclusion";
  override engine: CorrectionEngine = "regex";
  readonly name = "Literary Style Exclusion";
  readonly nameJa = "文語調表現の排除";
  readonly description = "Detect and flag archaic literary Japanese expressions in modern official writing";
  readonly descriptionJa = "「〜せり」「〜なり」「〜べし」「〜にて」等の文語調表現を検出します（公用文作成の考え方）";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];
    const issues: LintIssue[] = [];

    for (const { pattern, example, modern, note } of LITERARY_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(text)) !== null) {
        const from = match.index;
        // Point to the literary ending, not the trailing punctuation
        const to = from + match[0].trimEnd().length;

        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Literary expression "${example}" detected. Consider modern form: "${modern}"`,
          messageJa: `文語調表現「${example}」が検出されました。${note}（現代語：「${modern}」）`,
          from,
          to,
          originalText: match[0].trimEnd(),
          reference: KOYO_REF,
        });
      }
    }

    return issues;
  }
}
