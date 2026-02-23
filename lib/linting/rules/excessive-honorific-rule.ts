import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KOYO_REF: LintReference = {
  standard: "公用文作成の考え方（文化審議会、2022）",
};

/**
 * Excessive or double honorific (過剰な敬語・二重敬語) patterns.
 * These expressions are overly polite or grammatically redundant.
 */
const EXCESSIVE_HONORIFIC_PATTERNS: ReadonlyArray<{
  pattern: string;
  correct: string;
  note: string;
}> = [
  {
    pattern: "おっしゃられ",
    correct: "おっしゃ",
    note: "「おっしゃる」はすでに尊敬語。「られる」を重ねると二重敬語になります",
  },
  {
    pattern: "拝見させていただ",
    correct: "拝見し",
    note: "「拝見する」はすでに謙譲語。「させていただく」を重ねると過剰です",
  },
  {
    pattern: "お召し上がりになられ",
    correct: "召し上がり",
    note: "「召し上がる」はすでに尊敬語。「お〜になられる」を重ねると二重敬語になります",
  },
  {
    pattern: "いただけましたでしょうか",
    correct: "いただけますか",
    note: "「〜ましたでしょうか」は過剰な丁寧表現です",
  },
  {
    pattern: "させていただきます",
    correct: "します",
    note: "「させていただく」の多用は過剰な丁寧表現になります（文脈により許容）",
  },
  {
    pattern: "ご覧になられ",
    correct: "ご覧になり",
    note: "「ご覧になる」はすでに尊敬語。「られる」を重ねると二重敬語になります",
  },
  {
    pattern: "おられます",
    correct: "いらっしゃいます",
    note: "「おられる」は誤った尊敬語。「いらっしゃる」が正しい尊敬語です",
  },
  {
    pattern: "いただけたでしょうか",
    correct: "いただけましたか",
    note: "「〜いただけたでしょうか」は過剰な丁寧表現です",
  },
  {
    pattern: "ご確認のほどよろしくお願い申し上げます",
    correct: "ご確認をお願いします",
    note: "重複した丁寧表現です。より簡潔に表現してください",
  },
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
 * Excessive Honorific Rule (L1)
 *
 * Detects excessive or double honorific expressions (過剰な敬語・二重敬語).
 * Double keigo occurs when two honorific elements are stacked unnecessarily,
 * e.g., 「おっしゃられる」(おっしゃる + られる) or 「拝見させていただく」.
 *
 * Reference: 公用文作成の考え方（文化審議会、2022）
 */
export class ExcessiveHonorificRule extends AbstractLintRule {
  readonly id = "excessive-honorific";
  override engine: CorrectionEngine = "regex";
  readonly name = "Excessive Honorific Expression";
  readonly nameJa = "過剰な敬語表現の禁止";
  readonly description = "Detect double keigo and excessively polite expressions";
  readonly descriptionJa = "二重敬語や過剰な丁寧表現（おっしゃられる・拝見させていただく等）を検出します（公用文作成の考え方）";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];
    const issues: LintIssue[] = [];

    for (const { pattern, correct, note } of EXCESSIVE_HONORIFIC_PATTERNS) {
      for (const from of findAllOccurrences(text, pattern)) {
        const to = from + pattern.length;
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Excessive honorific: "${pattern}". ${note} Consider: "${correct}..."`,
          messageJa: `過剰な敬語表現：「${pattern}」。${note}「${correct}」を検討してください`,
          from,
          to,
          originalText: pattern,
          reference: KOYO_REF,
        });
      }
    }

    return issues;
  }
}
