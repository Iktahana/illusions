import { AbstractLintRule } from "../base-rule";
import { maskDialogue } from "../helpers/dialogue-mask";
import type { LintIssue, LintRuleConfig, LintReference, Severity } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cultural Affairs Agency reference for conjugation standards */
const KEIGO_REF: LintReference = {
  standard: '文化庁「敬語の指針」(2007)',
};

// ---------------------------------------------------------------------------
// ら抜き言葉 (ra-nuki) dictionary
// ---------------------------------------------------------------------------

/**
 * Map of ら抜き verb stems to their corrected ら入り stems.
 *
 * Key: stem WITHOUT ら (the erroneous form prefix, e.g. "見")
 * Value: stem WITH ら (the standard form prefix, e.g. "見ら")
 *
 * Each stem is matched with various conjugation suffixes:
 * れる, れない, れた, れれば, れます, れました
 */
const RA_NUKI_STEMS: ReadonlyMap<string, string> = new Map([
  ["見", "見ら"],
  ["食べ", "食べら"],
  ["出", "出ら"],
  ["着", "着ら"],
  ["起き", "起きら"],
  ["寝", "寝ら"],
  ["落ち", "落ちら"],
  ["逃げ", "逃げら"],
  ["受け", "受けら"],
  ["開け", "開けら"],
  ["つけ", "つけら"],
  ["やめ", "やめら"],
  ["考え", "考えら"],
  ["答え", "答えら"],
  ["決め", "決めら"],
  ["始め", "始めら"],
]);

/** Conjugation suffixes that follow the れ in potential forms */
const RA_NUKI_SUFFIXES: readonly string[] = [
  "れる",
  "れない",
  "れた",
  "れれば",
  "れます",
  "れました",
  "れません",
];

// ---------------------------------------------------------------------------
// さ入れ言葉 (sa-ire) dictionary
// ---------------------------------------------------------------------------

/**
 * Map of さ入れ causative forms (erroneous) to their standard forms.
 * Key: the erroneous form with extra さ
 * Value: the standard causative form
 */
const SA_IRE_PAIRS: ReadonlyMap<string, string> = new Map([
  ["休まさせる", "休ませる"],
  ["読まさせる", "読ませる"],
  ["行かさせる", "行かせる"],
  ["書かさせる", "書かせる"],
  ["飲まさせる", "飲ませる"],
  ["待たさせる", "待たせる"],
  ["泣かさせる", "泣かせる"],
]);

// ---------------------------------------------------------------------------
// い抜き言葉 (i-nuki) dictionary
// ---------------------------------------------------------------------------

/**
 * Map of い抜き progressive forms (casual) to their standard forms.
 * Key: the casual form without い
 * Value: the standard form with い
 *
 * Note: い抜き is extremely common in casual speech and fiction dialogue.
 * These are flagged as "info" severity, not "warning".
 */
const I_NUKI_PAIRS: ReadonlyMap<string, string> = new Map([
  ["持ってる", "持っている"],
  ["食べてる", "食べている"],
  ["見てる", "見ている"],
  ["走ってる", "走っている"],
  ["読んでる", "読んでいる"],
  ["遊んでる", "遊んでいる"],
  ["待ってる", "待っている"],
  ["歩いてる", "歩いている"],
  ["飲んでる", "飲んでいる"],
  ["寝てる", "寝ている"],
]);

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Find all non-overlapping occurrences of a literal string in text
 * and return their start indices.
 */
function findAllOccurrences(text: string, needle: string): number[] {
  const indices: number[] = [];
  let pos = 0;
  while (pos <= text.length - needle.length) {
    const idx = text.indexOf(needle, pos);
    if (idx === -1) break;
    indices.push(idx);
    pos = idx + needle.length;
  }
  return indices;
}

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Conjugation Error Detection Rule (L1)
 *
 * Detects three categories of common Japanese conjugation errors:
 *
 * 1. ら抜き言葉 (ra-nuki): Missing ら in potential form of ichidan verbs
 *    e.g. 見れる → 見られる
 *
 * 2. さ入れ言葉 (sa-ire): Extra さ in causative form of godan verbs
 *    e.g. 読まさせる → 読ませる
 *
 * 3. い抜き言葉 (i-nuki): Missing い in progressive -ている form
 *    e.g. 食べてる → 食べている
 *
 * This L1 rule uses a dictionary-based approach (no morphological analysis).
 * Reference: 文化庁「敬語の指針」(2007)
 */
export class ConjugationErrorRule extends AbstractLintRule {
  readonly id = "conjugation-errors";
  readonly name = "Conjugation error detection";
  readonly nameJa = "活用の誤り検出";
  readonly description =
    "Detect ら抜き, さ入れ, and い抜き conjugation errors";
  readonly descriptionJa = "ら抜き・さ入れ・い抜き言葉の検出";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];

    const maskedText = maskDialogue(text);
    const issues: LintIssue[] = [];
    issues.push(...this.checkRaNuki(maskedText, config.severity));
    issues.push(...this.checkSaIre(maskedText, config.severity));
    issues.push(...this.checkINuki(maskedText));
    return issues;
  }

  // -------------------------------------------------------------------------
  // ら抜き言葉 detection
  // -------------------------------------------------------------------------

  /**
   * Detect ら抜き言葉 by iterating over known ichidan verb stems
   * and checking for potential-form conjugation suffixes.
   *
   * For each stem, builds patterns like:
   *   見れる, 見れない, 見れた, 見れれば, 見れます, 見れました
   * and suggests the standard form with ら inserted:
   *   見られる, 見られない, 見られた, 見られれば, 見られます, 見られました
   */
  private checkRaNuki(text: string, severity: Severity): LintIssue[] {
    const issues: LintIssue[] = [];

    for (const [errorStem, correctStem] of RA_NUKI_STEMS) {
      for (const suffix of RA_NUKI_SUFFIXES) {
        const errorForm = errorStem + suffix;
        const correctForm = correctStem + suffix;

        const occurrences = findAllOccurrences(text, errorForm);
        for (const from of occurrences) {
          const to = from + errorForm.length;

          issues.push({
            ruleId: this.id,
            severity,
            message: `"${errorForm}" is ra-nuki (ら抜き). Standard form: "${correctForm}"`,
            messageJa:
              `「文化庁「敬語の指針」に基づき、「${errorForm}」はら抜き言葉です。「${correctForm}」が標準的です」`,
            from,
            to,
            reference: KEIGO_REF,
            fix: {
              label: `Replace with "${correctForm}"`,
              labelJa: `「${correctForm}」に置換`,
              replacement: correctForm,
            },
          });
        }
      }
    }

    return issues;
  }

  // -------------------------------------------------------------------------
  // さ入れ言葉 detection
  // -------------------------------------------------------------------------

  /**
   * Detect さ入れ言葉 by looking up known erroneous causative forms
   * from the dictionary.
   *
   * e.g. 読まさせる → 読ませる
   */
  private checkSaIre(text: string, severity: Severity): LintIssue[] {
    const issues: LintIssue[] = [];

    for (const [errorForm, correctForm] of SA_IRE_PAIRS) {
      const occurrences = findAllOccurrences(text, errorForm);
      for (const from of occurrences) {
        const to = from + errorForm.length;

        issues.push({
          ruleId: this.id,
          severity,
          message: `"${errorForm}" is sa-ire (さ入れ). Standard form: "${correctForm}"`,
          messageJa:
            `「文化庁「敬語の指針」に基づき、「${errorForm}」はさ入れ言葉です。「${correctForm}」が標準的です」`,
          from,
          to,
          reference: KEIGO_REF,
          fix: {
            label: `Replace with "${correctForm}"`,
            labelJa: `「${correctForm}」に置換`,
            replacement: correctForm,
          },
        });
      }
    }

    return issues;
  }

  // -------------------------------------------------------------------------
  // い抜き言葉 detection
  // -------------------------------------------------------------------------

  /**
   * Detect い抜き言葉 by looking up known casual progressive forms
   * from the dictionary.
   *
   * These are always flagged as "info" severity since い抜き is
   * extremely common in casual speech and novel dialogue, where
   * it may be used intentionally for characterization.
   *
   * e.g. 食べてる → 食べている
   */
  private checkINuki(text: string): LintIssue[] {
    const issues: LintIssue[] = [];

    for (const [errorForm, correctForm] of I_NUKI_PAIRS) {
      const occurrences = findAllOccurrences(text, errorForm);
      for (const from of occurrences) {
        const to = from + errorForm.length;

        issues.push({
          ruleId: this.id,
          severity: "info",
          message: `"${errorForm}" is i-nuki (い抜き). Standard form: "${correctForm}"`,
          messageJa:
            `「${errorForm}」はい抜き言葉です。「${correctForm}」が標準的です`,
          from,
          to,
          reference: KEIGO_REF,
          fix: {
            label: `Replace with "${correctForm}"`,
            labelJa: `「${correctForm}」に置換`,
            replacement: correctForm,
          },
        });
      }
    }

    return issues;
  }
}
