import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KANJI_REF: LintReference = {
  standard: "公用文における漢字使用等について（内閣訓令、2010）",
};

/**
 * Particles, suffixes, and pre-noun modifiers (副助詞・接尾語・連体詞)
 * that should be written in hiragana in official documents.
 * Key: kanji surface form
 * Value: hiragana replacement
 */
const PARTICLE_SUFFIX_HIRAGANA: ReadonlyArray<{ kanji: string; hiragana: string }> = [
  { kanji: "程", hiragana: "ほど" },
  { kanji: "位", hiragana: "くらい" },
  { kanji: "迄", hiragana: "まで" },
  { kanji: "共", hiragana: "とも" },
  { kanji: "等", hiragana: "など" },
  { kanji: "頃", hiragana: "ごろ" },
  { kanji: "毎", hiragana: "ごと" },
  { kanji: "共々", hiragana: "ともども" },
  { kanji: "此", hiragana: "この" },
  { kanji: "其", hiragana: "その" },
  { kanji: "彼の", hiragana: "あの" },
  { kanji: "何れ", hiragana: "いずれ" },
];

/**
 * Build a regex pattern that matches the kanji form only when used
 * as a standalone particle (surrounded by non-kanji context).
 */
function buildParticlePattern(kanji: string): RegExp {
  // Escape regex special chars
  const escaped = kanji.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match the kanji when not part of a larger kanji compound
  return new RegExp(`(?<=[^\\u4e00-\\u9fff\\w]|^)${escaped}(?=[^\\u4e00-\\u9fff\\w]|$)`, "g");
}

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Particle Suffix Modifier Opening Rule (L1)
 *
 * Particles, suffixes, and pre-noun modifiers (副助詞・接尾語・連体詞)
 * should be written in hiragana in official documents.
 * e.g., 「程」→「ほど」, 「等」→「など」, 「頃」→「ごろ」
 *
 * This rule uses regex with context-awareness to avoid flagging
 * kanji that are part of compound words.
 *
 * Reference: 公用文における漢字使用等について（内閣訓令、2010）
 */
export class ParticleSuffixModifierOpeningRule extends AbstractLintRule {
  readonly id = "particle-suffix-modifier-opening";
  override engine: CorrectionEngine = "regex";
  readonly name = "Particle/Suffix in Hiragana";
  readonly nameJa = "副助詞・接尾語・連体詞のひらがな表記";
  readonly description = "Particles, suffixes, and pre-noun modifiers should be hiragana";
  readonly descriptionJa = "「ほど」「くらい」「まで」「など」「ごろ」等の副助詞・接尾語・連体詞はひらがなで書きます（公用文における漢字使用等について）";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];
    const issues: LintIssue[] = [];

    for (const { kanji, hiragana } of PARTICLE_SUFFIX_HIRAGANA) {
      const pattern = buildParticlePattern(kanji);
      let match: RegExpExecArray | null;

      // Reset lastIndex
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text)) !== null) {
        const from = match.index;
        const to = from + kanji.length;
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `"${kanji}" (particle/suffix) should be written in hiragana as "${hiragana}"`,
          messageJa: `「${kanji}」はひらがなで「${hiragana}」と書きます（公用文における漢字使用等について）`,
          from,
          to,
          originalText: kanji,
          reference: KANJI_REF,
          fix: {
            label: `Replace with "${hiragana}"`,
            labelJa: `「${hiragana}」に置換`,
            replacement: hiragana,
          },
        });
      }
    }

    return issues;
  }
}
