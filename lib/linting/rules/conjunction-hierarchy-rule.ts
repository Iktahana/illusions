import { AbstractLintRule } from "../base-rule";
import { splitIntoSentences } from "../helpers/sentence-splitter";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KOYO_REF: LintReference = {
  standard: "公用文作成の考え方（文化審議会、2022）",
};

/**
 * Conjunction hierarchy rule for 並列 (parallel) and 選択 (alternative) conjunctions.
 *
 * Hierarchy in legal/official Japanese:
 * - Parallel (and): 「及び」(simpler) < 「並びに」(higher-level)
 * - Alternative (or): 「又は」(simpler) < 「若しくは」(higher-level)
 *
 * When both levels appear in the same sentence, it indicates complex nesting
 * that requires careful review to ensure correct hierarchy is applied.
 */
const HIERARCHY_CHECKS: ReadonlyArray<{
  lower: string;
  higher: string;
  type: string;
  note: string;
}> = [
  {
    lower: "及び",
    higher: "並びに",
    type: "parallel",
    note: "「及び」と「並びに」が同一文に共存しています。並列の階層構造を確認してください。「及び」が小項目、「並びに」が大項目の並列に使います",
  },
  {
    lower: "又は",
    higher: "若しくは",
    type: "alternative",
    note: "「又は」と「若しくは」が同一文に共存しています。選択の階層構造を確認してください。「若しくは」が小項目、「又は」が大項目の選択に使います",
  },
];

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Conjunction Hierarchy Rule (L1 heuristic)
 *
 * In legal and official Japanese, parallel and alternative conjunctions
 * follow a strict hierarchy:
 * - Parallel: 「及び」(lower level) + 「並びに」(higher level)
 * - Alternative: 「若しくは」(lower level) + 「又は」(higher level)
 *
 * When both levels appear in the same sentence, the hierarchy must be
 * applied correctly. This rule flags such co-occurrences for manual review.
 *
 * Reference: 公用文作成の考え方（文化審議会、2022）
 */
export class ConjunctionHierarchyRule extends AbstractLintRule {
  readonly id = "conjunction-hierarchy";
  override engine: CorrectionEngine = "regex";
  readonly name = "Conjunction Hierarchy";
  readonly nameJa = "並列・選択の接続詞の階層ルール";
  readonly description = "Check correct hierarchy of 及び/並びに and 又は/若しくは in the same sentence";
  readonly descriptionJa = "「及び」「並びに」「又は」「若しくは」の階層的な使い分けを確認します（公用文作成の考え方）";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];
    const issues: LintIssue[] = [];

    const sentences = splitIntoSentences(text);

    for (const sentence of sentences) {
      const sentenceText = text.slice(sentence.from, sentence.to);

      for (const { lower, higher, note } of HIERARCHY_CHECKS) {
        if (sentenceText.includes(lower) && sentenceText.includes(higher)) {
          // Flag at the position of the higher-level conjunction
          const higherIdx = sentenceText.indexOf(higher);
          const from = sentence.from + higherIdx;
          const to = from + higher.length;

          issues.push({
            ruleId: this.id,
            severity: config.severity,
            message: `Both "${lower}" and "${higher}" appear in the same sentence. Check conjunction hierarchy.`,
            messageJa: note,
            from,
            to,
            originalText: higher,
            reference: KOYO_REF,
          });
        }
      }
    }

    return issues;
  }
}
