import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KOYO_REF: LintReference = {
  standard: "公用文作成の考え方（文化審議会、2022）",
};

/**
 * Common tautologies (重言・重複表現) in Japanese.
 * These expressions contain redundant meaning.
 */
const TAUTOLOGIES: ReadonlyArray<{
  pattern: string;
  correct: string;
  note: string;
}> = [
  {
    pattern: "まず最初に",
    correct: "まず",
    note: "「まず」と「最初に」は同じ意味の重複です",
  },
  {
    pattern: "一番最初",
    correct: "最初",
    note: "「一番」と「最初」は同じ意味の重複です",
  },
  {
    pattern: "一番最後",
    correct: "最後",
    note: "「一番」と「最後」は同じ意味の重複です",
  },
  {
    pattern: "後で後悔",
    correct: "後悔",
    note: "「後悔」には「後で」の意味が含まれています",
  },
  {
    pattern: "頭痛が痛い",
    correct: "頭が痛い",
    note: "「頭痛」には「痛い」の意味が含まれています",
  },
  {
    pattern: "馬から落馬",
    correct: "落馬",
    note: "「落馬」には「馬から落ちる」の意味が含まれています",
  },
  {
    pattern: "犯罪を犯す",
    correct: "犯罪を行う",
    note: "「犯す」と「犯罪」は同じ語源の重複です",
  },
  {
    pattern: "被害を被る",
    correct: "被害を受ける",
    note: "「被る」と「被害」は同じ語源の重複です",
  },
  {
    pattern: "違和感を感じる",
    correct: "違和感がある",
    note: "「感じる」と「違和感」は同じ語源の重複です",
  },
  {
    pattern: "過半数を超える",
    correct: "過半数に達する",
    note: "「過半数」には「半分を超える」の意味が含まれています",
  },
  {
    pattern: "必ず必要",
    correct: "必要",
    note: "「必ず」と「必要」は同じ意味の重複です",
  },
  {
    pattern: "各々それぞれ",
    correct: "それぞれ",
    note: "「各々」と「それぞれ」は同じ意味の重複です",
  },
  {
    pattern: "引き続き継続",
    correct: "継続",
    note: "「引き続き」と「継続」は同じ意味の重複です",
  },
  {
    pattern: "お体の具合はいかがでしょうか",
    correct: "お体の具合はいかがですか",
    note: "「具合」と「いかが」を組み合わせると冗長になります（過剰な丁寧表現）",
  },
  {
    pattern: "最後の結末",
    correct: "結末",
    note: "「最後」と「結末」は同じ意味の重複です",
  },
  {
    pattern: "返事を返す",
    correct: "返事をする",
    note: "「返事」と「返す」は同じ語源の重複です",
  },
  {
    pattern: "はっきりと明確に",
    correct: "明確に",
    note: "「はっきり」と「明確」は同じ意味の重複です",
  },
  {
    pattern: "予め予約",
    correct: "予約",
    note: "「予約」には「予め」の意味が含まれています",
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
 * Tautology Redundancy Rule (L1)
 *
 * Detects common tautologies (重言・重複表現) where the same meaning is
 * expressed twice in the same phrase.
 * e.g., 「まず最初に」→「まず」, 「頭痛が痛い」→「頭が痛い」
 *
 * Reference: 公用文作成の考え方（文化審議会、2022）
 */
export class TautologyRedundancyRule extends AbstractLintRule {
  readonly id = "tautology-redundancy";
  override engine: CorrectionEngine = "regex";
  readonly name = "Tautology / Redundant Expression";
  readonly nameJa = "重複表現（重言）の禁止";
  readonly description = "Detect tautological expressions where the same meaning is stated twice";
  readonly descriptionJa = "「まず最初に」「頭痛が痛い」等の重複表現（重言）を検出します（公用文作成の考え方）";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];
    const issues: LintIssue[] = [];

    for (const { pattern, correct, note } of TAUTOLOGIES) {
      for (const from of findAllOccurrences(text, pattern)) {
        const to = from + pattern.length;
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Tautology detected: "${pattern}". ${note} Consider: "${correct}"`,
          messageJa: `重複表現（重言）：「${pattern}」。${note}「${correct}」への修正を検討してください`,
          from,
          to,
          originalText: pattern,
          reference: KOYO_REF,
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
