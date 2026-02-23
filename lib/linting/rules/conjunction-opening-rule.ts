import type { Token } from "@/lib/nlp-client/types";
import { AbstractMorphologicalLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KANJI_REF: LintReference = {
  standard: "公用文における漢字使用等について（内閣訓令、2010）",
};

/**
 * Conjunctions that should be written in hiragana in official documents.
 * Key: kanji surface form
 * Value: hiragana replacement
 *
 * Note: 「又は」「及び」「並びに」「若しくは」are special legal terms
 * kept in kanji for precision in legal/official contexts.
 * Non-legal conjunctions like 「但し」「尚」should be hiragana.
 */
const CONJUNCTION_HIRAGANA_MAP: ReadonlyMap<string, string> = new Map([
  ["但し", "ただし"],
  ["尚", "なお"],
  ["且つ", "かつ"],
  ["即ち", "すなわち"],
  ["従って", "したがって"],
  ["因って", "よって"],
  ["故に", "ゆえに"],
  ["乃至", "ないし"],
]);

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Conjunction Opening Rule (L2)
 *
 * Certain conjunctions should be written in hiragana in official documents
 * per 公用文における漢字使用等について.
 * e.g., 「但し」→「ただし」, 「尚」→「なお」, 「且つ」→「かつ」
 *
 * Note: Legal conjunctions 「又は」「及び」「並びに」「若しくは」
 * remain in kanji as established terminology.
 *
 * Reference: 公用文における漢字使用等について（内閣訓令、2010）
 */
export class ConjunctionOpeningRule extends AbstractMorphologicalLintRule {
  readonly id = "conjunction-opening";
  override engine: CorrectionEngine = "morphological";
  readonly name = "Conjunction in Hiragana";
  readonly nameJa = "接続詞のひらがな表記";
  readonly description = "Certain conjunctions should be written in hiragana in official writing";
  readonly descriptionJa = "「ただし」「なお」「かつ」「すなわち」「したがって」等の接続詞はひらがなで書きます（公用文における漢字使用等について）";
  readonly level = "L2" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
  };

  lintWithTokens(
    _text: string,
    tokens: ReadonlyArray<Token>,
    config: LintRuleConfig,
  ): LintIssue[] {
    const issues: LintIssue[] = [];

    for (const token of tokens) {
      if (token.pos !== "接続詞") continue;

      const hiragana = CONJUNCTION_HIRAGANA_MAP.get(token.surface);
      if (!hiragana) continue;

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Conjunction "${token.surface}" should be written in hiragana as "${hiragana}"`,
        messageJa: `接続詞「${token.surface}」はひらがなで「${hiragana}」と書きます（公用文における漢字使用等について）`,
        from: token.start,
        to: token.end,
        originalText: token.surface,
        reference: KANJI_REF,
        fix: {
          label: `Replace with "${hiragana}"`,
          labelJa: `「${hiragana}」に置換`,
          replacement: hiragana,
        },
      });
    }

    return issues;
  }
}
