/**
 * L2 rule: warn on nouns that are not registered in the Genji dictionary.
 *
 * Gated on `genjiVocab.isReady()` — when the dictionary is not installed
 * or still loading, the rule reports no issues. V1 does not consult the
 * per-file user dictionary (tracked as follow-up); the rule defaults to
 * disabled so any false positives are opt-in.
 */

import { AbstractMorphologicalLintRule } from "@/lib/linting/base-rule";
import type { LintIssue, LintRuleConfig, RuleLevel } from "@/lib/linting/types";
import type { Token } from "@/lib/nlp-client/types";
import { genjiVocab } from "@/lib/dict/genji-vocab";

const CHECKABLE_POS_DETAIL = new Set(["一般", "固有名詞", "サ変接続"]);
const EXCLUDED_POS_DETAIL = new Set([
  "代名詞",
  "数",
  "非自立",
  "接尾",
  "副詞可能",
  "形容動詞語幹",
  "ナイ形容詞語幹",
  "特殊",
]);

const ASCII_OR_DIGITS_ONLY = /^[\x00-\x7f]+$/;
const HIRAGANA_ONLY = /^[\u3041-\u3096ー]+$/;

function isCheckableNoun(token: Token): boolean {
  if (token.pos !== "名詞") return false;

  const detail = token.pos_detail_1;
  if (detail && EXCLUDED_POS_DETAIL.has(detail)) return false;
  if (detail && !CHECKABLE_POS_DETAIL.has(detail)) return false;

  const surface = token.surface;
  if (!surface) return false;
  if (ASCII_OR_DIGITS_ONLY.test(surface)) return false;
  // Suppress lone hiragana surfaces (2+ char noise words are usually 非自立 and excluded above).
  if (HIRAGANA_ONLY.test(surface) && surface.length < 2) return false;

  return true;
}

export class GenjiUnknownNounRule extends AbstractMorphologicalLintRule {
  readonly id = "genji-unknown-noun";
  readonly name = "Genji Unknown Noun";
  readonly nameJa = "辞典外名詞の警告（Genji 辞典）";
  readonly description = "Warn nouns that are not registered in the Genji dictionary.";
  readonly descriptionJa =
    "Genji 辞典に登録されていない名詞を警告します（user dict 参照は follow-up）。";
  readonly level: RuleLevel = "L2";
  readonly defaultConfig: LintRuleConfig = {
    enabled: false,
    severity: "warning",
    skipDialogue: false,
  };

  lintWithTokens(_text: string, tokens: ReadonlyArray<Token>, config: LintRuleConfig): LintIssue[] {
    if (!genjiVocab.isReady()) return [];

    const issues: LintIssue[] = [];
    for (const t of tokens) {
      if (!isCheckableNoun(t)) continue;

      const surface = t.surface;
      const basic = t.basic_form && t.basic_form !== "*" ? t.basic_form : surface;
      if (genjiVocab.has(surface) || genjiVocab.has(basic)) continue;

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Noun "${surface}" is not registered in the Genji dictionary.`,
        messageJa: `Genji 辞典に未登録の名詞です：「${surface}」`,
        from: t.start,
        to: t.end,
        originalText: surface,
      });
    }
    return issues;
  }
}
