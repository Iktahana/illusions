import { AbstractDocumentLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

/** JTF reference for list formatting consistency rule */
const JTF_REF: LintReference = {
  standard: "JTF日本語標準スタイルガイド v3.0",
  section: "3.1.1",
};

/** Bullet prefixes that indicate a list item */
const LIST_ITEM_PREFIX = /^[・○●◎◯▶▷►→\-\*]\s*/;
/** Numbered list prefix */
const NUMBERED_ITEM_PREFIX = /^[0-9０-９]+[.．、。）)]\s*/;

/** Maximum character length for a text to be considered a list item */
const MAX_LIST_ITEM_LENGTH = 60;

/**
 * Determine if a text line looks like a list item.
 */
function isListItem(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_LIST_ITEM_LENGTH) return false;
  return LIST_ITEM_PREFIX.test(trimmed) || NUMBERED_ITEM_PREFIX.test(trimmed);
}

/**
 * ListFormattingConsistencyRule -- L1 document-level rule.
 *
 * Detects inconsistent use of trailing 。 (period) within a run of
 * list items. Per JTF 3.1.1, all items in a list should either all
 * end with 。 or all omit the trailing period.
 *
 * Detection strategy:
 * 1. Find runs of ≥ 3 consecutive paragraphs that look like list items.
 * 2. Within each run, check whether some items end with 。 and others do not.
 * 3. Flag the minority style items.
 */
export class ListFormattingConsistencyRule extends AbstractDocumentLintRule {
  readonly id = "list-formatting-consistency";
  override engine: CorrectionEngine = "regex";
  readonly name = "Consistent list item punctuation";
  readonly nameJa = "箇条書きの文体・句点の統一";
  readonly description =
    "Detects inconsistent trailing period usage within list items";
  readonly descriptionJa =
    "箇条書き内で句点（。）の有無が混在している場合を検出します";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
    skipDialogue: true,
  };

  lintDocument(
    paragraphs: ReadonlyArray<{ text: string; index: number }>,
    config: LintRuleConfig,
  ): Array<{ paragraphIndex: number; issues: LintIssue[] }> {
    if (!config.enabled || paragraphs.length === 0) return [];

    const results: Array<{ paragraphIndex: number; issues: LintIssue[] }> = [];

    // Find consecutive runs of list items
    let runStart = -1;
    const runs: Array<Array<{ text: string; index: number }>> = [];

    for (let i = 0; i <= paragraphs.length; i++) {
      const para = paragraphs[i];
      const isItem = para !== undefined && isListItem(para.text);

      if (isItem && runStart === -1) {
        runStart = i;
      } else if (!isItem && runStart !== -1) {
        const run = paragraphs.slice(runStart, i);
        if (run.length >= 3) {
          runs.push(Array.from(run));
        }
        runStart = -1;
      }
    }

    // Check each run for consistency
    for (const run of runs) {
      const withPeriod = run.filter((p) => p.text.trim().endsWith("。"));
      const withoutPeriod = run.filter((p) => !p.text.trim().endsWith("。"));

      if (withPeriod.length === 0 || withoutPeriod.length === 0) continue;

      // Flag minority
      const minority =
        withPeriod.length <= withoutPeriod.length ? withPeriod : withoutPeriod;
      const hasMinorityPeriod = withPeriod.length <= withoutPeriod.length;

      for (const item of minority) {
        const trimmed = item.text.trim();
        const from = item.text.lastIndexOf(trimmed.slice(-1));
        const to = from + 1;

        results.push({
          paragraphIndex: item.index,
          issues: [
            {
              ruleId: this.id,
              severity: config.severity,
              message: hasMinorityPeriod
                ? "List item ends with 。 but most items do not — remove for consistency (JTF 3.1.1)"
                : "List item lacks trailing 。 but most items have one — add for consistency (JTF 3.1.1)",
              messageJa: hasMinorityPeriod
                ? "JTF 3.1.1に基づき、他の箇条書き項目と統一するため末尾の句点（。）を削除してください"
                : "JTF 3.1.1に基づき、他の箇条書き項目と統一するため末尾に句点（。）を追加してください",
              from,
              to,
              reference: JTF_REF,
            },
          ],
        });
      }
    }

    return results;
  }
}
