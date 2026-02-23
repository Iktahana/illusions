import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

/** Reference for gairai kana table rule */
const GAIRAI_REF: LintReference = {
  standard: "文化庁「外来語の表記」(1991, 内閣告示第二号)",
};

/**
 * Second-table (第2表) extended kana combinations.
 * These are allowed in general usage but should be avoided in formal/public documents
 * where first-table (第1表) standard kana is preferred.
 *
 * Each entry provides the extended form and the preferred standard form.
 */
const SECOND_TABLE_KANA: ReadonlyArray<{
  pattern: RegExp;
  extended: string;
  preferred: string;
}> = [
  { pattern: /ティ/g, extended: "ティ", preferred: "チ" },
  { pattern: /ディ/g, extended: "ディ", preferred: "ジ" },
  { pattern: /デュ/g, extended: "デュ", preferred: "ジュ" },
  { pattern: /ファ/g, extended: "ファ", preferred: "ハ" },
  { pattern: /フィ/g, extended: "フィ", preferred: "ヒ" },
  { pattern: /フェ/g, extended: "フェ", preferred: "ヘ" },
  { pattern: /フォ/g, extended: "フォ", preferred: "ホ" },
  { pattern: /ウィ/g, extended: "ウィ", preferred: "ウイ" },
  { pattern: /ウェ/g, extended: "ウェ", preferred: "ウエ" },
  { pattern: /ウォ/g, extended: "ウォ", preferred: "ウオ" },
  { pattern: /チェ/g, extended: "チェ", preferred: "チエ" },
  { pattern: /トゥ/g, extended: "トゥ", preferred: "トウ" },
  { pattern: /ドゥ/g, extended: "ドゥ", preferred: "ドウ" },
  { pattern: /イェ/g, extended: "イェ", preferred: "イエ" },
];

/**
 * GairaiKanaTableRule -- L1 regex-based rule.
 *
 * Detects use of extended (第2表) katakana combinations in text that
 * should use standard (第1表) representations. Per 文化庁「外来語の表記」,
 * formal and public documents should prefer the first-table standard kana
 * over the extended second-table forms.
 *
 * Examples:
 * - ティ → チ (party: パーティ → パーチ)
 * - ファ → ハ (file: ファイル → ハイル)
 * Note: Suggestions are approximate; the user should verify the correct
 * standard form for the specific loanword.
 */
export class GairaiKanaTableRule extends AbstractLintRule {
  readonly id = "gairai-kana-table";
  override engine: CorrectionEngine = "regex";
  readonly name = "Use first-table kana for loanwords";
  readonly nameJa = "外来語仮名の第1表・第2表準拠";
  readonly description =
    "Detects second-table extended kana combinations in formal text";
  readonly descriptionJa =
    "公用文・学術文書では外来語表記の第2表（拡張仮名）の使用を避け、第1表の表記を推奨します";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
    skipDialogue: true,
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];

    const issues: LintIssue[] = [];

    for (const { pattern, extended, preferred } of SECOND_TABLE_KANA) {
      const re = new RegExp(pattern.source, "g");
      for (const match of text.matchAll(re)) {
        if (match.index === undefined) continue;

        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Extended kana "${extended}" (第2表) should be "${preferred}" (第1表) in formal text (外来語の表記)`,
          messageJa: `外来語の表記に基づき、公用文では第2表の「${extended}」より第1表の「${preferred}」が推奨されます`,
          from: match.index,
          to: match.index + extended.length,
          originalText: extended,
          reference: GAIRAI_REF,
          fix: {
            label: `Replace with first-table form "${preferred}"`,
            labelJa: `第1表の形「${preferred}」に変換`,
            replacement: preferred,
          },
        });
      }
    }

    return issues;
  }
}
