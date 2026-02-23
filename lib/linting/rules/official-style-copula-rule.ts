import type { Token } from "@/lib/nlp-client/types";
import { AbstractMorphologicalDocumentLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KOYO_REF: LintReference = {
  standard: "公用文作成の考え方（文化審議会、2022）",
};

/**
 * In official and academic plain-style (常体) writing, sentence-ending 「だ」
 * and 「だった」are discouraged. 「である」and「であった」are preferred.
 *
 * This rule detects 助動詞 tokens with basic_form=「だ」at sentence endings.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if a token sequence ends with sentence-final 「だ」or「だった」.
 * Returns the problematic token range if found.
 */
function findSentenceFinalDa(
  tokens: ReadonlyArray<Token>,
): { start: number; end: number; surface: string } | null {
  // Scan from the end backwards
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];

    // Skip punctuation
    if (token.pos === "記号") continue;

    // Look for 助動詞 with basic_form = "だ"
    if (token.pos === "助動詞" && token.basic_form === "だ") {
      // Make sure it's not part of だろう / だって etc.
      const surface = token.surface;
      if (surface === "だ" || surface === "だっ") {
        // Check next non-punctuation token
        let nextSurface = "";
        for (let j = i + 1; j < tokens.length; j++) {
          if (tokens[j].pos !== "記号") {
            nextSurface = tokens[j].surface;
            break;
          }
        }
        // If 「だっ」, the next should be 「た」
        if (surface === "だっ" && nextSurface === "た") {
          return { start: token.start, end: tokens[i + 1]?.end ?? token.end, surface: "だった" };
        }
        if (surface === "だ") {
          return { start: token.start, end: token.end, surface: "だ" };
        }
      }
      break;
    }

    // Stop at content words
    if (
      token.pos === "動詞" ||
      token.pos === "形容詞" ||
      token.pos === "名詞"
    ) {
      break;
    }
  }

  return null;
}

/**
 * Check if a document uses predominantly 「である」style.
 * Detects sentences ending in である/であった.
 */
function countDeAruStyle(tokens: ReadonlyArray<Token>): number {
  let count = 0;
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    const prev = tokens[i - 1];
    if (
      token.basic_form === "ある" &&
      prev.pos === "助動詞" &&
      prev.surface === "で"
    ) {
      count++;
    }
  }
  return count;
}

/**
 * Count sentence-final 「だ」occurrences.
 */
function countSentenceFinalDa(tokens: ReadonlyArray<Token>): number {
  let count = 0;
  for (const token of tokens) {
    if (token.pos === "助動詞" && token.basic_form === "だ" && token.surface === "だ") {
      count++;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Official Style Copula Rule (L2, document-level)
 *
 * In official and academic writing using plain style (常体),
 * sentence-ending 「だ」and「だった」are discouraged.
 * 「である」and「であった」are the preferred forms.
 *
 * Detection strategy:
 * 1. Check document for である style usage (indicates official/academic context)
 * 2. Flag sentence-final 「だ」that appear in documents predominantly using 「である」
 *
 * Reference: 公用文作成の考え方（文化審議会、2022）
 */
export class OfficialStyleCopulaRule extends AbstractMorphologicalDocumentLintRule {
  readonly id = "official-style-copula";
  override engine: CorrectionEngine = "morphological";
  readonly name = "Official Style Copula (だ → である)";
  readonly nameJa = "常体における「だ・だった」の禁止";
  readonly description = "In official plain style, use である/であった instead of だ/だった";
  readonly descriptionJa = "公用文・学術文の常体では「だ・だった」を避け「である・であった」を使います（公用文作成の考え方）";
  readonly level = "L2" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "error",
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

    // Step 1: Determine if the document uses である style
    const allTokens = paragraphs.flatMap((p) => p.tokens);
    const deAruCount = countDeAruStyle(allTokens);
    const daCount = countSentenceFinalDa(allTokens);

    // Only flag in documents that predominantly use である (deAru > da)
    // or in documents with any である usage (official context indicator)
    if (deAruCount === 0 && daCount === 0) return [];

    // If mostly だ style, likely a casual text — don't flag
    if (daCount > 0 && deAruCount === 0) return [];

    const results: Array<{ paragraphIndex: number; issues: LintIssue[] }> = [];

    // Step 2: Flag sentence-final 「だ」in each paragraph
    for (const paragraph of paragraphs) {
      const issues: LintIssue[] = [];
      const paraTokens = paragraph.tokens;

      // Find sentence boundaries by looking for 記号 (。！？)
      let sentenceStart = 0;

      for (let i = 0; i < paraTokens.length; i++) {
        const token = paraTokens[i];
        const isSentenceEnd =
          token.pos === "記号" &&
          (token.surface === "。" || token.surface === "！" || token.surface === "？");

        if (isSentenceEnd || i === paraTokens.length - 1) {
          const sentenceTokens = paraTokens.slice(sentenceStart, i + 1);
          const found = findSentenceFinalDa(sentenceTokens);

          if (found !== null) {
            issues.push({
              ruleId: this.id,
              severity: config.severity,
              message: `Sentence-final "${found.surface}" detected. Use "である" or "であった" in official plain style`,
              messageJa: `文末の「${found.surface}」が検出されました。公用文の常体では「${found.surface === "だった" ? "であった" : "である"}」を使ってください（公用文作成の考え方）`,
              from: found.start,
              to: found.end,
              originalText: found.surface,
              reference: KOYO_REF,
              fix: {
                label: `Replace with "${found.surface === "だった" ? "であった" : "である"}"`,
                labelJa: `「${found.surface === "だった" ? "であった" : "である"}」に置換`,
                replacement: found.surface === "だった" ? "であった" : "である",
              },
            });
          }

          sentenceStart = i + 1;
        }
      }

      if (issues.length > 0) {
        results.push({ paragraphIndex: paragraph.index, issues });
      }
    }

    return results;
  }
}
