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
 * Particles that should not appear consecutively (same particle repeated).
 * Consecutive identical particles usually indicate a structural error.
 */
const MONITORED_PARTICLES = new Set(["は", "が", "を", "に", "で", "て", "も", "へ", "から", "より"]);

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Consecutive Particle Rule (L2)
 *
 * Consecutive use of the same particle (e.g., 「〜のの」「〜がが」)
 * is a grammatical error or structural problem in Japanese.
 * This rule detects consecutive identical particles within a token sequence.
 *
 * Detection strategy:
 * - Scan morphological tokens for consecutive 助詞 tokens with the same surface
 * - Flag as an error if the same meaningful particle appears twice in a row
 *
 * Reference: 公用文作成の考え方（文化審議会、2022）
 */
export class ConsecutiveParticleRule extends AbstractMorphologicalLintRule {
  readonly id = "consecutive-particle";
  override engine: CorrectionEngine = "morphological";
  readonly name = "Consecutive Particle";
  readonly nameJa = "同一助詞の連続使用制限";
  readonly description = "The same particle should not appear consecutively";
  readonly descriptionJa = "同一の助詞を連続して使うと読みにくくなります。文の構造を見直してください（公用文作成の考え方）";
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

    for (let i = 1; i < tokens.length; i++) {
      const prev = tokens[i - 1];
      const curr = tokens[i];

      // Both tokens must be particles (助詞)
      if (prev.pos !== "助詞" || curr.pos !== "助詞") continue;

      // Same surface form
      if (prev.surface !== curr.surface) continue;

      // Only flag monitored particles to avoid false positives
      if (!MONITORED_PARTICLES.has(curr.surface)) continue;

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Consecutive identical particle "${curr.surface}${curr.surface}" detected. Restructure the sentence.`,
        messageJa: `助詞「${curr.surface}」が連続しています（「${prev.surface}${curr.surface}」）。文の構造を見直してください（公用文作成の考え方）`,
        from: prev.start,
        to: curr.end,
        originalText: prev.surface + curr.surface,
        reference: KOYO_REF,
      });
    }

    return issues;
  }
}
