import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

/** Reference for ji/zu kana rule */
const KANA_REF: LintReference = {
  standard: "文化庁「現代仮名遣い」(1986, 内閣告示第一号)",
};

/**
 * Common misspellings where ず/づ or じ/ぢ are confused.
 * Each entry specifies the incorrect pattern and its correction.
 *
 * These are cases where the standard modern kana usage (現代仮名遣い)
 * requires づ but writers mistakenly use ず, or vice versa.
 */
const JI_ZU_ERRORS: ReadonlyArray<{
  pattern: RegExp;
  correct: string;
  description: string;
}> = [
  // 続く — correct: つづく, common error: つずく
  { pattern: /つずく/g, correct: "つづく", description: "続く" },
  // 基づく — correct: もとづく, common error: もとずく
  { pattern: /もとずく/g, correct: "もとづく", description: "基づく" },
  // 気づく — correct: きづく, common error: きずく
  { pattern: /きずく/g, correct: "きづく", description: "気づく" },
  // 近づく — correct: ちかづく, common error: ちかずく
  { pattern: /ちかずく/g, correct: "ちかづく", description: "近づく" },
  // 続ける — correct: つづける, common error: つずける
  { pattern: /つずける/g, correct: "つづける", description: "続ける" },
  // 片付く — correct: かたづく, common error: かたずく
  { pattern: /かたずく/g, correct: "かたづく", description: "片付く" },
  // 傷つく — correct: きずつく, common error: きづつく
  // (きずつく IS correct — 傷 = きず, so skip this one)
  // 落ち着く — correct: おちつく (no づ involved, skip)
  // 育つ — correct: そだつ (no confusion)
  // 見つかる — correct: みつかる (no confusion)
  // 手続き — correct: てつづき, common error: てつずき
  { pattern: /てつずき/g, correct: "てつづき", description: "手続き" },
  // 落ち着く — no confusion
  // 縮む — correct: ちぢむ, common error: ちずむ
  { pattern: /ちずむ/g, correct: "ちぢむ", description: "縮む" },
  // 縮める — correct: ちぢめる, common error: ちずめる
  { pattern: /ちずめる/g, correct: "ちぢめる", description: "縮める" },
];

/**
 * JiZuKanaRule -- L1 regex-based rule.
 *
 * Detects common misspellings where づ/ぢ and ず/じ are confused.
 * Per 文化庁「現代仮名遣い」, the general rule is:
 * - Use じ and ず as the standard forms
 * - Use ぢ and づ only for rendaku (連濁) and specific traditional words
 *
 * This rule checks for well-known cases where writers mistakenly
 * use ず where づ is required (after rendaku or in compound words).
 */
export class JiZuKanaRule extends AbstractLintRule {
  readonly id = "ji-zu-kana";
  override engine: CorrectionEngine = "regex";
  readonly name = "Correct ji/zu kana usage (じ/ぢ・ず/づ)";
  readonly nameJa = "じ/ぢ・ず/づの使い分け";
  readonly description =
    "Detects common misspellings involving じ/ぢ and ず/づ confusion";
  readonly descriptionJa =
    "現代仮名遣いに基づき、じ/ぢ・ず/づの誤った使い方を検出します";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "error",
    skipDialogue: true,
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];

    const issues: LintIssue[] = [];

    for (const { pattern, correct, description } of JI_ZU_ERRORS) {
      const re = new RegExp(pattern.source, "g");
      for (const match of text.matchAll(re)) {
        if (match.index === undefined) continue;

        const wrongForm = match[0];

        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Incorrect kana: "${wrongForm}" should be "${correct}" (${description}) — 現代仮名遣い`,
          messageJa: `現代仮名遣いに基づき、「${wrongForm}」は「${correct}」（${description}）と表記してください`,
          from: match.index,
          to: match.index + wrongForm.length,
          originalText: wrongForm,
          reference: KANA_REF,
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
