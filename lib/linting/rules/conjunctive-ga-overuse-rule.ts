import type { Token } from "@/lib/nlp-client/types";
import { AbstractMorphologicalDocumentLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KOYO_REF: LintReference = {
  standard: "公用文作成の考え方（文化審議会、2022）",
};

/** Maximum number of conjunctive が per paragraph before flagging */
const MAX_CONJUNCTIVE_GA_PER_PARAGRAPH = 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Count connective 「が」tokens in a token array.
 * Connective が is classified as 助詞・接続助詞.
 */
function countConnectiveGa(tokens: ReadonlyArray<Token>): Array<{ start: number; end: number }> {
  return tokens
    .filter(
      (t) =>
        t.pos === "助詞" &&
        t.pos_detail_1 === "接続助詞" &&
        t.surface === "が",
    )
    .map((t) => ({ start: t.start, end: t.end }));
}

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Conjunctive Ga Overuse Rule (L2, document-level)
 *
 * The conjunctive particle 「が」connecting clauses is often overused in
 * Japanese writing, creating long, rambling sentences. Official writing
 * guidelines recommend limiting its use to at most 2 times per paragraph.
 *
 * Detection uses morphological analysis to identify tokens classified as
 * 助詞・接続助詞 with surface form 「が」.
 *
 * Reference: 公用文作成の考え方（文化審議会、2022）
 */
export class ConjunctiveGaOveruseRule extends AbstractMorphologicalDocumentLintRule {
  readonly id = "conjunctive-ga-overuse";
  override engine: CorrectionEngine = "morphological";
  readonly name = "Conjunctive が Overuse";
  readonly nameJa = "接続助詞「が」の多用禁止";
  readonly description = "Limit the use of conjunctive が to avoid long, convoluted sentences";
  readonly descriptionJa = "接続助詞「が」の多用を避け、文を分けてください（公用文作成の考え方）";
  readonly level = "L2" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
  };

  lintDocumentWithTokens(
    paragraphs: ReadonlyArray<{
      text: string;
      index: number;
      tokens: ReadonlyArray<Token>;
    }>,
    config: LintRuleConfig,
  ): Array<{ paragraphIndex: number; issues: LintIssue[] }> {
    const results: Array<{ paragraphIndex: number; issues: LintIssue[] }> = [];

    for (const paragraph of paragraphs) {
      const gaOccurrences = countConnectiveGa(paragraph.tokens);

      if (gaOccurrences.length <= MAX_CONJUNCTIVE_GA_PER_PARAGRAPH) continue;

      const issues: LintIssue[] = [];

      // Flag from the third occurrence onward
      for (let i = MAX_CONJUNCTIVE_GA_PER_PARAGRAPH; i < gaOccurrences.length; i++) {
        const occ = gaOccurrences[i];
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Conjunctive "が" appears ${gaOccurrences.length} times in this paragraph (max ${MAX_CONJUNCTIVE_GA_PER_PARAGRAPH}). Consider splitting the sentence.`,
          messageJa: `この段落で接続助詞「が」が${gaOccurrences.length}回使われています（推奨は${MAX_CONJUNCTIVE_GA_PER_PARAGRAPH}回以内）。文を分割することを検討してください（公用文作成の考え方）`,
          from: occ.start,
          to: occ.end,
          originalText: "が",
          reference: KOYO_REF,
        });
      }

      if (issues.length > 0) {
        results.push({ paragraphIndex: paragraph.index, issues });
      }
    }

    return results;
  }
}
