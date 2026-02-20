import { AbstractDocumentLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, Severity } from "../types";
import {
  VARIANT_GROUPS,
  VARIANT_CATEGORY_LABELS,
} from "../data/notation-variants";
import type { VariantGroup, VariantCategory } from "../data/notation-variants";

/** Reference standards for each variant category */
const CATEGORY_REFERENCES: Readonly<Record<VariantCategory, LintReference>> = {
  okurigana: {
    standard: '文化庁「送り仮名の付け方」(1973, 内閣告示第二号)',
  },
  "kanji-kana": {
    standard: '文化庁「公用文作成の考え方」(2022)',
  },
  "katakana-chouon": {
    standard: '文化庁「外来語の表記」(1991, 内閣告示第二号)',
  },
};

/** Location of a variant occurrence in the document */
interface VariantLocation {
  paragraphIndex: number;
  from: number;
  to: number;
}

/**
 * NotationConsistencyRule -- L1 document-level rule for detecting
 * inconsistent notation variants across the entire document.
 *
 * Scans all paragraphs for known variant forms (okurigana, kanji/kana,
 * katakana long vowel). When 2+ different forms of the same word appear
 * in the document, the minority form(s) are flagged with a suggestion
 * to use the majority form for consistency.
 */
export class NotationConsistencyRule extends AbstractDocumentLintRule {
  readonly id = "notation-consistency";
  readonly name = "Notation consistency";
  readonly nameJa = "表記ゆれの検出";
  readonly description = "Detect inconsistent notation variants across the document";
  readonly descriptionJa = "文書内の表記ゆれを検出";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
  };

  lintDocument(
    paragraphs: ReadonlyArray<{ text: string; index: number }>,
    config: LintRuleConfig,
  ): Array<{ paragraphIndex: number; issues: LintIssue[] }> {
    if (paragraphs.length === 0) return [];

    const issuesByParagraph = new Map<number, LintIssue[]>();

    for (const group of VARIANT_GROUPS) {
      this.checkVariantGroup(group, paragraphs, config.severity, issuesByParagraph);
    }

    // Convert map to array format
    const results: Array<{ paragraphIndex: number; issues: LintIssue[] }> = [];
    for (const [paragraphIndex, issues] of issuesByParagraph) {
      results.push({ paragraphIndex, issues });
    }

    return results;
  }

  /**
   * Check a single variant group across all paragraphs.
   *
   * 1. Find all occurrences of each variant form
   * 2. If 2+ different forms exist, determine the majority
   * 3. Flag all minority occurrences with a fix suggestion
   */
  private checkVariantGroup(
    group: VariantGroup,
    paragraphs: ReadonlyArray<{ text: string; index: number }>,
    severity: Severity,
    issuesByParagraph: Map<number, LintIssue[]>,
  ): void {
    // Count occurrences and record locations for each variant
    const variantCounts = new Map<string, number>();
    const variantLocations = new Map<string, VariantLocation[]>();

    for (const paragraph of paragraphs) {
      for (const variant of group.variants) {
        const locations = this.findAllOccurrences(paragraph.text, variant);
        if (locations.length === 0) continue;

        const currentCount = variantCounts.get(variant) ?? 0;
        variantCounts.set(variant, currentCount + locations.length);

        const currentLocations = variantLocations.get(variant) ?? [];
        for (const loc of locations) {
          currentLocations.push({
            paragraphIndex: paragraph.index,
            from: loc.from,
            to: loc.to,
          });
        }
        variantLocations.set(variant, currentLocations);
      }
    }

    // Only flag if 2+ different variants are found in the document
    if (variantCounts.size < 2) return;

    // Determine the majority variant (highest count wins; tie-break by first in list)
    const majorityVariant = this.getMajorityVariant(variantCounts, group.variants);
    const reference = CATEGORY_REFERENCES[group.category];
    const categoryLabel = VARIANT_CATEGORY_LABELS[group.category];

    // Flag all non-majority variant occurrences
    for (const [variant, locations] of variantLocations) {
      if (variant === majorityVariant) continue;

      for (const loc of locations) {
        const issue: LintIssue = {
          ruleId: this.id,
          severity,
          message: `Inconsistent notation: "${variant}" vs "${majorityVariant}" (${group.category})`,
          messageJa: `「${reference.standard}に基づき、${categoryLabel}「${variant}」と「${majorityVariant}」の表記が混在しています。「${majorityVariant}」への統一を推奨します」`,
          from: loc.from,
          to: loc.to,
          reference,
          fix: {
            label: `Replace with "${majorityVariant}"`,
            labelJa: `「${majorityVariant}」に統一`,
            replacement: majorityVariant,
          },
        };

        const existing = issuesByParagraph.get(loc.paragraphIndex) ?? [];
        existing.push(issue);
        issuesByParagraph.set(loc.paragraphIndex, existing);
      }
    }
  }

  /**
   * Find all occurrences of a search string in text.
   * Returns character offset ranges.
   */
  private findAllOccurrences(
    text: string,
    search: string,
  ): Array<{ from: number; to: number }> {
    const results: Array<{ from: number; to: number }> = [];
    let pos = 0;

    while (pos <= text.length - search.length) {
      const index = text.indexOf(search, pos);
      if (index === -1) break;

      results.push({ from: index, to: index + search.length });
      pos = index + search.length;
    }

    return results;
  }

  /**
   * Determine the majority variant from counts.
   * If there is a tie, prefer the variant that appears first in the
   * canonical variant list (which is the "standard" form per government guidelines).
   */
  private getMajorityVariant(
    counts: Map<string, number>,
    canonicalOrder: readonly string[],
  ): string {
    let maxCount = 0;
    let majority = canonicalOrder[0];

    for (const variant of canonicalOrder) {
      const count = counts.get(variant) ?? 0;
      if (count > maxCount) {
        maxCount = count;
        majority = variant;
      }
    }

    return majority;
  }
}
