import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

/** Reference for long vowel kana rule */
const JTF_REF: LintReference = {
  standard: "JTF日本語標準スタイルガイド v3.0",
};

const KANA_REF: LintReference = {
  standard: "文化庁「現代仮名遣い」(1986, 内閣告示第一号)",
};

/**
 * Patterns where katakana words incorrectly use a vowel character
 * instead of the long vowel mark (ー) to represent a long vowel sound.
 *
 * Strategy: detect katakana sequences ending in a vowel (ア/イ/ウ/エ/オ)
 * where the preceding character is a non-matching vowel or consonant+vowel
 * combination that typically uses ー in standard orthography.
 *
 * Common problematic patterns — these are known loanword misspellings:
 */
const LONG_VOWEL_ERRORS: ReadonlyArray<{
  pattern: RegExp;
  correct: string;
  description: string;
}> = [
  // エラア → エラー (error)
  { pattern: /エラア(?![ァ-ン])/g, correct: "エラー", description: "error" },
  // コンピュータア → コンピューター (computer)
  { pattern: /コンピュータア/g, correct: "コンピューター", description: "computer" },
  // プリンタア → プリンター (printer)
  { pattern: /プリンタア/g, correct: "プリンター", description: "printer" },
  // スキャナア → スキャナー (scanner)
  { pattern: /スキャナア/g, correct: "スキャナー", description: "scanner" },
  // モニタア → モニター (monitor)
  { pattern: /モニタア/g, correct: "モニター", description: "monitor" },
  // サーバア → サーバー (server)
  { pattern: /サーバア/g, correct: "サーバー", description: "server" },
  // フォルダア → フォルダー (folder)
  { pattern: /フォルダア/g, correct: "フォルダー", description: "folder" },
  // カーソルウ → (not common, skip)
  // コーヒイ → コーヒー (coffee)
  { pattern: /コーヒイ/g, correct: "コーヒー", description: "coffee" },
  // タクシイ → タクシー (taxi)
  { pattern: /タクシイ/g, correct: "タクシー", description: "taxi" },
  // パーティイ → パーティー (party)
  { pattern: /パーティイ/g, correct: "パーティー", description: "party" },
  // ストーリイ → ストーリー (story)
  { pattern: /ストーリイ/g, correct: "ストーリー", description: "story" },
  // ボディイ → ボディー (body)
  { pattern: /ボディイ/g, correct: "ボディー", description: "body" },
  // アイデアア → アイデア (idea — ends in ア naturally, so skip; アイデアア is double)
];

/**
 * LongVowelKanaRule -- L1 regex-based rule.
 *
 * Detects katakana loanwords that use repeated vowels instead of the
 * long vowel mark (ー) to represent a long vowel sound. Per JTF and
 * 現代仮名遣い, katakana loanwords should use ー for long vowels.
 *
 * Examples:
 * - 誤: エラア   → 正: エラー
 * - 誤: コーヒイ → 正: コーヒー
 * - 誤: タクシイ → 正: タクシー
 */
export class LongVowelKanaRule extends AbstractLintRule {
  readonly id = "long-vowel-kana";
  override engine: CorrectionEngine = "regex";
  readonly name = "Use long vowel mark (ー) in katakana loanwords";
  readonly nameJa = "長音の仮名表記";
  readonly description =
    "Detects katakana words using repeated vowels instead of the long vowel mark (ー)";
  readonly descriptionJa =
    "カタカナ語で長音記号「ー」の代わりに母音を繰り返している場合を検出します";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "error",
    skipDialogue: true,
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];

    const issues: LintIssue[] = [];

    for (const { pattern, correct, description } of LONG_VOWEL_ERRORS) {
      const re = new RegExp(pattern.source, "g");
      for (const match of text.matchAll(re)) {
        if (match.index === undefined) continue;

        const wrongForm = match[0];

        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Use long vowel mark: "${wrongForm}" → "${correct}" (${description}) — JTF/現代仮名遣い`,
          messageJa: `JTF・現代仮名遣いに基づき、「${wrongForm}」は長音記号を使って「${correct}」と表記してください（${description}）`,
          from: match.index,
          to: match.index + wrongForm.length,
          originalText: wrongForm,
          reference: JTF_REF,
          fix: {
            label: `Replace with "${correct}"`,
            labelJa: `「${correct}」に修正`,
            replacement: correct,
          },
        });
      }
    }

    return issues;
  }
}
