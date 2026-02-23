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
 * Pronouns that should use specific forms in official writing.
 * wrong: non-standard form
 * correct: recommended form in official contexts
 * note: explanation
 */
const PRONOUN_GUIDANCE: ReadonlyArray<{
  surface: string;
  correct: string;
  note: string;
}> = [
  {
    surface: "我々",
    correct: "私たち",
    note: "公用文では「私たち」または「われわれ」が適切",
  },
  {
    surface: "吾々",
    correct: "私たち",
    note: "公用文では「私たち」が適切",
  },
  {
    surface: "吾輩",
    correct: "私",
    note: "文語的表現。公用文では「私」を使用",
  },
  {
    surface: "余",
    correct: "私",
    note: "文語的一人称。公用文では「私」を使用",
  },
  {
    surface: "拙者",
    correct: "私",
    note: "古語的一人称。公用文では「私」を使用",
  },
  {
    surface: "誰",
    correct: "だれ",
    note: "公用文では「だれ」とひらがなで書くことが多い",
  },
];

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Pronoun Kanji Rule (L2)
 *
 * Certain pronouns should use specific forms in official writing.
 * e.g., 「我々」→「私たち」, 「誰」→「だれ」in formal contexts.
 *
 * Detection uses morphological analysis to identify pronoun tokens
 * (名詞・代名詞・一般) with non-standard surface forms.
 *
 * Reference: 公用文における漢字使用等について（内閣訓令、2010）
 */
export class PronounKanjiRule extends AbstractMorphologicalLintRule {
  readonly id = "pronoun-kanji";
  override engine: CorrectionEngine = "morphological";
  readonly name = "Pronoun Kanji Form";
  readonly nameJa = "代名詞の漢字表記統一";
  readonly description = "Pronouns should use recommended forms in official writing";
  readonly descriptionJa = "公用文では代名詞の表記を統一します（「我々」→「私たち」等）（公用文における漢字使用等について）";
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
      // Match pronoun tokens: 名詞・代名詞・一般
      if (token.pos !== "名詞") continue;
      if (token.pos_detail_1 !== "代名詞") continue;

      const guidance = PRONOUN_GUIDANCE.find((g) => g.surface === token.surface);
      if (!guidance) continue;

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Pronoun "${token.surface}" — consider "${guidance.correct}". ${guidance.note}`,
        messageJa: `代名詞「${token.surface}」について：${guidance.note}。「${guidance.correct}」を検討してください`,
        from: token.start,
        to: token.end,
        originalText: token.surface,
        reference: KANJI_REF,
        fix: {
          label: `Replace with "${guidance.correct}"`,
          labelJa: `「${guidance.correct}」に置換`,
          replacement: guidance.correct,
        },
      });
    }

    return issues;
  }
}
