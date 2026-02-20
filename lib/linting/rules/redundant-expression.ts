import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference } from "../types";

/** Reference for redundant expression detection */
const STYLE_GUIDE_REF: LintReference = {
  standard: "日本語スタイルガイド",
};

/**
 * Entry in the redundant expression dictionary.
 */
interface RedundantEntry {
  /** The redundant expression to detect */
  readonly pattern: string;
  /** The concise replacement */
  readonly suggestion: string;
  /** Explanation of why it is redundant (Japanese) */
  readonly descriptionJa: string;
}

/**
 * Dictionary of common redundant (tautological) expressions in Japanese.
 * Each entry pairs a redundant phrase with its concise replacement
 * and an explanation of the redundancy.
 */
const REDUNDANT_EXPRESSIONS: ReadonlyArray<RedundantEntry> = [
  {
    pattern: "頭痛が痛い",
    suggestion: "頭が痛い",
    descriptionJa: "「頭痛」に「痛い」の意味が含まれています",
  },
  {
    pattern: "一番最初",
    suggestion: "最初",
    descriptionJa: "「一番」と「最初」は同じ意味です",
  },
  {
    pattern: "まず最初に",
    suggestion: "まず",
    descriptionJa: "「まず」と「最初に」は同じ意味です",
  },
  {
    pattern: "後で後悔",
    suggestion: "後悔",
    descriptionJa: "「後悔」に「後で」の意味が含まれています",
  },
  {
    pattern: "犯罪を犯す",
    suggestion: "罪を犯す",
    descriptionJa: "「犯罪」と「犯す」で意味が重複しています",
  },
  {
    pattern: "返事を返す",
    suggestion: "返事をする",
    descriptionJa: "「返事」と「返す」で意味が重複しています",
  },
  {
    pattern: "被害を被る",
    suggestion: "被害を受ける",
    descriptionJa: "「被害」と「被る」で意味が重複しています",
  },
  {
    pattern: "違和感を感じる",
    suggestion: "違和感がある",
    descriptionJa: "「違和感」と「感じる」で意味が重複しています",
  },
  {
    pattern: "馬から落馬",
    suggestion: "落馬する",
    descriptionJa: "「落馬」に「馬から落ちる」の意味が含まれています",
  },
  {
    pattern: "日本に来日",
    suggestion: "来日する",
    descriptionJa: "「来日」に「日本に来る」の意味が含まれています",
  },
  {
    pattern: "歌を歌う",
    suggestion: "歌う",
    descriptionJa: "「歌」と「歌う」で意味が重複しています",
  },
  {
    pattern: "挙式を挙げる",
    suggestion: "挙式する",
    descriptionJa: "「挙式」と「挙げる」で意味が重複しています",
  },
  {
    pattern: "過半数を超える",
    suggestion: "半数を超える",
    descriptionJa: "「過半数」に「超える」の意味が含まれています",
  },
  {
    pattern: "必ず必要",
    suggestion: "必要",
    descriptionJa: "「必ず」と「必要」で意味が重複しています",
  },
  {
    pattern: "各々それぞれ",
    suggestion: "それぞれ",
    descriptionJa: "「各々」と「それぞれ」は同じ意味です",
  },
  {
    pattern: "あらかじめ予約",
    suggestion: "予約する",
    descriptionJa: "「予約」に「あらかじめ」の意味が含まれています",
  },
  {
    pattern: "今の現状",
    suggestion: "現状",
    descriptionJa: "「今の」と「現状」で意味が重複しています",
  },
  {
    pattern: "元旦の朝",
    suggestion: "元旦",
    descriptionJa: "「元旦」に「朝」の意味が含まれています",
  },
  {
    pattern: "最後の切り札",
    suggestion: "切り札",
    descriptionJa: "「切り札」に「最後の」の意味が含まれています",
  },
  {
    pattern: "射程距離",
    suggestion: "射程",
    descriptionJa: "「射程」に「距離」の意味が含まれています",
  },
  {
    pattern: "思いがけないハプニング",
    suggestion: "ハプニング",
    descriptionJa:
      "「ハプニング」に「思いがけない」の意味が含まれています",
  },
  {
    pattern: "内定が決まる",
    suggestion: "内定する",
    descriptionJa: "「内定」に「決まる」の意味が含まれています",
  },
  {
    pattern: "旅行に行く",
    suggestion: "旅行する",
    descriptionJa: "「旅行」と「行く」で意味が重複しています",
  },
  {
    pattern: "断トツの1位",
    suggestion: "断トツ",
    descriptionJa:
      "「断トツ」は「断然トップ」の略で「1位」の意味を含みます",
  },
  {
    pattern: "第1号",
    suggestion: "1号",
    descriptionJa: "「第」と「号」で序数の意味が重複しています",
  },
] as const;

/**
 * RedundantExpressionRule -- L1 dictionary-based redundant expression detection.
 *
 * Scans text for tautological expressions where the same meaning is
 * expressed twice (e.g. "頭痛が痛い") and suggests concise alternatives.
 */
export class RedundantExpressionRule extends AbstractLintRule {
  readonly id = "redundant-expression";
  readonly name = "Redundant expression detection";
  readonly nameJa = "二重表現の検出";
  readonly description =
    "Detect tautological expressions where the same meaning is expressed twice";
  readonly descriptionJa = "意味が重複している冗長な表現を検出";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];

    const issues: LintIssue[] = [];

    for (const entry of REDUNDANT_EXPRESSIONS) {
      let searchFrom = 0;
      let index = text.indexOf(entry.pattern, searchFrom);

      while (index !== -1) {
        const from = index;
        const to = index + entry.pattern.length;

        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Redundant expression "${entry.pattern}" can be replaced with "${entry.suggestion}"`,
          messageJa:
            `「日本語スタイルガイドに基づき、「${entry.pattern}」は二重表現です。${entry.descriptionJa}。「${entry.suggestion}」への書き換えを推奨します」`,
          from,
          to,
          reference: STYLE_GUIDE_REF,
          fix: {
            label: `Replace with "${entry.suggestion}"`,
            labelJa: `「${entry.suggestion}」に置換`,
            replacement: entry.suggestion,
          },
        });

        searchFrom = to;
        index = text.indexOf(entry.pattern, searchFrom);
      }
    }

    return issues;
  }
}
