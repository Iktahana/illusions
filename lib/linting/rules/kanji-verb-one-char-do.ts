import type { Token } from "@/lib/nlp-client/types";
import { AbstractMorphologicalLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KOYO_REF: LintReference = {
  standard: "公用文作成の考え方（文化審議会、2022）",
};

/**
 * Single-kanji + する compound verbs where a more descriptive
 * two-kanji + する form exists and is preferred in official writing.
 *
 * form: the single-kanji+する form
 * preferred: the preferred, more descriptive form(s)
 * note: explanation
 */
const SINGLE_KANJI_SURU: ReadonlyArray<{
  form: string;
  preferred: string;
  note: string;
}> = [
  {
    form: "処する",
    preferred: "処置する・処理する",
    note: "「処する」より具体的な「処置する」「処理する」が明確です",
  },
  {
    form: "発する",
    preferred: "発信する・発表する・発令する",
    note: "「発する」より「発信する」「発表する」等が意味を明確に伝えます",
  },
  {
    form: "論する",
    preferred: "論じる・論述する",
    note: "「論する」は文語的。「論じる」または「論述する」が適切です",
  },
  {
    form: "称する",
    preferred: "称号を与える・呼称する",
    note: "「称する」より具体的な表現を使ってください",
  },
  {
    form: "接する",
    preferred: "接触する・対応する",
    note: "「接する」より具体的な「接触する」「対応する」が明確です（文脈による）",
  },
];

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Kanji Verb One Char Do Rule (L2)
 *
 * Certain single-kanji + する compound verbs (漢字1字＋する) are vague
 * and can be replaced with more descriptive two-kanji + する forms
 * in official writing.
 * e.g., 「処する」→「処置する」, 「発する」→「発信する」
 *
 * Detection uses morphological analysis to find サ変 (suru-verb) tokens
 * whose basic form matches the dictionary of vague single-kanji+する verbs.
 *
 * Reference: 公用文作成の考え方（文化審議会、2022）
 */
export class KanjiVerbOneCharDo extends AbstractMorphologicalLintRule {
  readonly id = "kanji-verb-one-char-do";
  override engine: CorrectionEngine = "morphological";
  readonly name = "Single-Kanji + する Verb Paraphrase";
  readonly nameJa = "「漢字1字＋する」型の動詞の言い換え";
  readonly description = "Replace vague single-kanji+する verbs with more descriptive forms";
  readonly descriptionJa = "「処する」「発する」等の「漢字1字＋する」型動詞をより具体的な表現に言い換えます（公用文作成の考え方）";
  readonly level = "L2" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "info",
  };

  lintWithTokens(
    _text: string,
    tokens: ReadonlyArray<Token>,
    config: LintRuleConfig,
  ): LintIssue[] {
    const issues: LintIssue[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Look for サ変接続 nouns followed by する
      // or direct サ変動詞 tokens with matching basic_form
      if (token.pos === "動詞") {
        const basicForm = token.basic_form ?? token.surface;
        const guidance = SINGLE_KANJI_SURU.find((g) => g.form === basicForm);

        if (!guidance) continue;

        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `"${guidance.form}" is vague. Consider: "${guidance.preferred}"`,
          messageJa: `「${guidance.form}」の意味が曖昧な場合があります。${guidance.note}（候補：「${guidance.preferred}」）`,
          from: token.start,
          to: token.end,
          originalText: token.surface,
          reference: KOYO_REF,
        });
        continue;
      }

      // Also check for [名詞・サ変接続] + [する] pattern
      if (
        token.pos === "名詞" &&
        token.pos_detail_1 === "サ変接続" &&
        i + 1 < tokens.length
      ) {
        const nextToken = tokens[i + 1];
        if (
          nextToken.pos === "動詞" &&
          (nextToken.basic_form === "する" || nextToken.surface === "する")
        ) {
          const compound = token.surface + "する";
          const guidance = SINGLE_KANJI_SURU.find((g) => g.form === compound);

          if (!guidance) continue;

          issues.push({
            ruleId: this.id,
            severity: config.severity,
            message: `"${guidance.form}" is vague. Consider: "${guidance.preferred}"`,
            messageJa: `「${guidance.form}」の意味が曖昧な場合があります。${guidance.note}（候補：「${guidance.preferred}」）`,
            from: token.start,
            to: nextToken.end,
            originalText: compound,
            reference: KOYO_REF,
          });
        }
      }
    }

    return issues;
  }
}
