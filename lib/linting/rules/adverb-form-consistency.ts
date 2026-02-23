import type { Token } from "@/lib/nlp-client/types";
import { AbstractMorphologicalDocumentLintRule } from "../base-rule";
import {
  ADVERB_VARIANT_GROUPS,
  type AdverbVariantGroup,
} from "../data/adverb-variants";
import { isInDialogue } from "../helpers/dialogue-mask";
import type { LintIssue, LintRuleConfig, LintReference , CorrectionEngine} from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Reference to the official document writing guide */
const STYLE_GUIDE_REF: LintReference = {
  standard: '文化庁「公用文作成の考え方」(2022)',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Location of an adverb occurrence in the document */
interface AdverbOccurrence {
  surface: string;
  paragraphIndex: number;
  from: number;
  to: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a lookup map from katakana reading to variant group.
 * Pre-computed once per lint run for efficient token matching.
 */
function buildReadingMap(): Map<string, AdverbVariantGroup> {
  const map = new Map<string, AdverbVariantGroup>();
  for (const group of ADVERB_VARIANT_GROUPS) {
    map.set(group.reading, group);
  }
  return map;
}

/**
 * Determine the majority surface form from occurrence counts.
 * If there is a tie, prefer the form that appears first in the
 * canonical variant list (the "standard" form per guidelines).
 */
function getMajorityForm(
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

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Adverb Form Consistency Rule (L2, document-level, morphological)
 *
 * Detects inconsistent kanji/kana forms of adverbs within a document.
 * For example, mixing "全く" and "まったく" in the same document.
 *
 * Detection strategy:
 * 1. Build a reading-to-variant-group lookup map
 * 2. Scan all paragraphs for adverb tokens matching known variant groups
 * 3. Group occurrences by reading (variant group)
 * 4. For groups with 2+ distinct surface forms, determine the majority
 * 5. Flag minority occurrences with a fix to replace with majority form
 *
 * Reference: 文化庁「公用文作成の考え方」(2022)
 */
export class AdverbFormConsistencyRule extends AbstractMorphologicalDocumentLintRule {
  readonly id = "adverb-form-consistency";
  override engine: CorrectionEngine = "morphological";
  readonly name = "Adverb Form Consistency";
  readonly nameJa = "副詞の漢字・ひらがな統一";
  readonly description =
    "Detects inconsistent kanji/kana forms of adverbs";
  readonly descriptionJa =
    "副詞の漢字表記とひらがな表記の混在を検出します";
  readonly level = "L2" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "info",
  };

  lintDocumentWithTokens(
    paragraphs: ReadonlyArray<{
      text: string;
      index: number;
      tokens: ReadonlyArray<Token>;
    }>,
    config: LintRuleConfig,
  ): Array<{ paragraphIndex: number; issues: LintIssue[] }> {
    if (paragraphs.length === 0) return [];

    // Step 1: Build reading-to-group lookup map
    const readingToGroup = buildReadingMap();

    // Step 2: Scan all paragraphs for adverb tokens matching variant groups
    const occurrencesByReading = new Map<string, AdverbOccurrence[]>();

    for (const paragraph of paragraphs) {
      for (const token of paragraph.tokens) {
        // Skip tokens inside dialogue
        if (config.skipDialogue && isInDialogue(token.start, paragraph.text)) continue;

        // Filter for adverb POS only
        if (token.pos !== "副詞") continue;
        if (!token.reading) continue;

        const group = readingToGroup.get(token.reading);
        if (!group) continue;

        // Verify the surface form is one of the known variants
        if (!group.variants.includes(token.surface)) continue;

        const occurrences = occurrencesByReading.get(group.reading) ?? [];
        occurrences.push({
          surface: token.surface,
          paragraphIndex: paragraph.index,
          from: token.start,
          to: token.end,
        });
        occurrencesByReading.set(group.reading, occurrences);
      }
    }

    // Step 3-4: For each reading group, check for inconsistency
    const issuesByParagraph = new Map<number, LintIssue[]>();

    for (const [reading, occurrences] of occurrencesByReading) {
      // Count occurrences per surface form
      const surfaceCounts = new Map<string, number>();
      for (const occ of occurrences) {
        surfaceCounts.set(occ.surface, (surfaceCounts.get(occ.surface) ?? 0) + 1);
      }

      // Only flag if 2+ different surface forms exist
      if (surfaceCounts.size < 2) continue;

      // Get the canonical variant order for tie-breaking
      const group = readingToGroup.get(reading);
      if (!group) continue;

      const majoritySurface = getMajorityForm(surfaceCounts, group.variants);

      // Step 5: Flag all minority occurrences
      for (const occurrence of occurrences) {
        if (occurrence.surface === majoritySurface) continue;

        const issue: LintIssue = {
          ruleId: this.id,
          severity: config.severity,
          message: `Inconsistent adverb form: '${occurrence.surface}' used here, but '${majoritySurface}' is more common in this document`,
          messageJa: `文化庁「公用文作成の考え方」に基づき、「${occurrence.surface}」と「${majoritySurface}」が混在しています。多数派の「${majoritySurface}」への統一を検討してください`,
          from: occurrence.from,
          to: occurrence.to,
          reference: STYLE_GUIDE_REF,
          fix: {
            label: `Replace with '${majoritySurface}'`,
            labelJa: `「${majoritySurface}」に置換`,
            replacement: majoritySurface,
          },
        };

        const existing = issuesByParagraph.get(occurrence.paragraphIndex) ?? [];
        existing.push(issue);
        issuesByParagraph.set(occurrence.paragraphIndex, existing);
      }
    }

    // Convert map to result array
    const results: Array<{ paragraphIndex: number; issues: LintIssue[] }> = [];
    for (const [paragraphIndex, issues] of issuesByParagraph) {
      results.push({ paragraphIndex, issues });
    }

    return results;
  }
}
