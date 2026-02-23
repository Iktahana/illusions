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
 * Auxiliary verbs and adjectives (補助動詞・補助形容詞) that should be written
 * in hiragana when used in grammatical (non-lexical) contexts.
 *
 * Key: kanji surface form
 * Value: hiragana replacement
 */
const AUXILIARY_VERB_MAP: ReadonlyMap<string, string> = new Map([
  // 補助動詞
  ["居る", "いる"],
  ["居ます", "います"],
  ["居た", "いた"],
  ["置く", "おく"],
  ["置き", "おき"],
  ["置いて", "おいて"],
  ["仕舞う", "しまう"],
  ["仕舞い", "しまい"],
  ["仕舞って", "しまって"],
  ["見る", "みる"],
  ["見て", "みて"],
  ["見た", "みた"],
  ["来る", "くる"],
  ["来て", "きて"],
  ["来た", "きた"],
  ["行く", "いく"],
  ["行って", "いって"],
  ["頂く", "いただく"],
  ["頂き", "いただき"],
  ["頂いて", "いただいて"],
  ["下さい", "ください"],
  ["下さる", "くださる"],
  ["下さって", "くださって"],
  ["上げる", "あげる"],
  ["上げて", "あげて"],
  ["貰う", "もらう"],
  ["貰って", "もらって"],
]);

/**
 * Check if a kanji string contains at least one kanji character.
 */
function containsKanji(str: string): boolean {
  return /[\u4e00-\u9fff]/.test(str);
}

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Auxiliary Verb Opening Rule (L2)
 *
 * Auxiliary verbs and adjectives (補助動詞・補助形容詞) used after the te-form
 * of verbs should be written in hiragana in official documents.
 * e.g., 〜て「居る」→「いる」, 〜て「置く」→「おく」, 「下さい」→「ください」
 *
 * Detection uses morphological analysis: tokens classified as 動詞・非自立
 * with a kanji surface form matching known auxiliary verbs.
 *
 * Reference: 公用文における漢字使用等について（内閣訓令、2010）
 */
export class AuxiliaryVerbOpeningRule extends AbstractMorphologicalLintRule {
  readonly id = "auxiliary-verb-opening";
  override engine: CorrectionEngine = "morphological";
  readonly name = "Auxiliary Verb in Hiragana";
  readonly nameJa = "補助動詞・補助形容詞のひらがな表記";
  readonly description = "Auxiliary verbs used after te-form should be written in hiragana";
  readonly descriptionJa = "補助動詞・補助形容詞（いる・おく・しまう・みる・いただく・ください等）はひらがなで書きます（公用文における漢字使用等について）";
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

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Auxiliary verbs: 動詞・非自立 containing kanji
      const isAuxVerb =
        token.pos === "動詞" && token.pos_detail_1 === "非自立";

      // Also check for 下さい which may tokenize differently
      const isMiscAux =
        (token.pos === "動詞" || token.pos === "助動詞") &&
        containsKanji(token.surface);

      if (!isAuxVerb && !isMiscAux) continue;

      const hiragana = AUXILIARY_VERB_MAP.get(token.surface);
      if (!hiragana) continue;

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Auxiliary verb "${token.surface}" should be written in hiragana as "${hiragana}"`,
        messageJa: `補助動詞「${token.surface}」はひらがなで「${hiragana}」と書きます（公用文における漢字使用等について）`,
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
