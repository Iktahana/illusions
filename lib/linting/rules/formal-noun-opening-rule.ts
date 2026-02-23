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
 * Formal nouns (形式名詞) that should be written in hiragana in official documents.
 * Key: kanji surface form
 * Value: hiragana replacement
 */
const FORMAL_NOUN_MAP: ReadonlyMap<string, string> = new Map([
  ["事", "こと"],
  ["物", "もの"],
  ["時", "とき"],
  ["所", "ところ"],
  ["訳", "わけ"],
  ["為", "ため"],
  ["通り", "とおり"],
  ["方", "ほう"],
  ["上", "うえ"],
  ["中", "なか"],
  ["間", "あいだ"],
  ["内", "うち"],
]);

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Formal Noun Opening Rule (L2)
 *
 * Formal nouns (形式名詞) should be written in hiragana in official documents.
 * These nouns lose their concrete meaning when used grammatically,
 * e.g., 「わかった事」→「わかったこと」, 「する為」→「するため」
 *
 * Detection uses morphological analysis: tokens classified as 名詞・非自立
 * with a kanji surface form that matches known formal nouns.
 *
 * Reference: 公用文における漢字使用等について（内閣訓令、2010）
 */
export class FormalNounOpeningRule extends AbstractMorphologicalLintRule {
  readonly id = "formal-noun-opening";
  override engine: CorrectionEngine = "morphological";
  readonly name = "Formal Noun in Hiragana";
  readonly nameJa = "形式名詞のひらがな表記";
  readonly description = "Formal nouns (形式名詞) should be written in hiragana";
  readonly descriptionJa = "形式名詞（こと・もの・とき・ところ・わけ・ため等）はひらがなで書きます（公用文における漢字使用等について）";
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
      // Match tokens classified as 名詞・非自立 (non-independent noun = formal noun)
      if (token.pos !== "名詞") continue;
      if (token.pos_detail_1 !== "非自立") continue;

      const hiragana = FORMAL_NOUN_MAP.get(token.surface);
      if (!hiragana) continue;

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Formal noun "${token.surface}" should be written in hiragana as "${hiragana}"`,
        messageJa: `形式名詞「${token.surface}」はひらがなで「${hiragana}」と書きます（公用文における漢字使用等について）`,
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
