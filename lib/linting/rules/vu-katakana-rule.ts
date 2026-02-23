import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

/** Reference for vu-katakana rule */
const GAIRAI_REF: LintReference = {
  standard: "文化庁「外来語の表記」(1991, 内閣告示第二号)",
};

/** Matches the katakana character ヴ (U+30F4) and its combinations */
const VU_PATTERN = /ヴ[ァィゥェォ]?/g;

/**
 * Standard substitutions for ヴ combinations.
 * These represent the preferred forms in public documents.
 */
const VU_SUBSTITUTIONS: ReadonlyMap<string, string> = new Map([
  ["ヴァ", "バ"],
  ["ヴィ", "ビ"],
  ["ヴ", "ブ"],
  ["ヴェ", "ベ"],
  ["ヴォ", "ボ"],
]);

/**
 * VuKatakanaRule -- L1 regex-based rule.
 *
 * Detects use of ヴ (U+30F4) in text. Per 文化庁「外来語の表記」,
 * public documents and formal writing should avoid ヴ and instead
 * use the standard ba-row (バ行) characters.
 *
 * Common substitutions:
 * - ヴァ → バ (violin: ヴァイオリン → バイオリン)
 * - ヴィ → ビ (video: ヴィデオ → ビデオ)
 * - ヴ  → ブ
 * - ヴェ → ベ
 * - ヴォ → ボ
 */
export class VuKatakanaRule extends AbstractLintRule {
  readonly id = "vu-katakana";
  override engine: CorrectionEngine = "regex";
  readonly name = "Avoid ヴ in formal Japanese text";
  readonly nameJa = "「ヴ」の使用制限";
  readonly description =
    "Detects ヴ which should be replaced with バ/ビ/ブ/ベ/ボ in formal text";
  readonly descriptionJa =
    "公用文や正式な文書では「ヴ」を避け、バ行の表記を使用してください";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
    skipDialogue: true,
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];

    const issues: LintIssue[] = [];

    for (const match of text.matchAll(VU_PATTERN)) {
      if (match.index === undefined) continue;

      const matchedText = match[0];
      const suggestion = VU_SUBSTITUTIONS.get(matchedText);

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Avoid "ヴ" in formal text — use バ行 instead (外来語の表記)`,
        messageJa: `外来語の表記に基づき、公用文では「${matchedText}」を使用せず、バ行で表記してください${suggestion !== undefined ? `（例：「${suggestion}」）` : ""}`,
        from: match.index,
        to: match.index + matchedText.length,
        originalText: matchedText,
        reference: GAIRAI_REF,
        ...(suggestion !== undefined
          ? {
              fix: {
                label: `Replace with "${suggestion}"`,
                labelJa: `「${suggestion}」に変換`,
                replacement: suggestion,
              },
            }
          : {}),
      });
    }

    return issues;
  }
}
