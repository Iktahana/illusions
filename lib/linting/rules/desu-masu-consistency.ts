import type { Token } from "@/lib/nlp-client/types";
import { AbstractMorphologicalDocumentLintRule } from "../base-rule";
import { isInDialogue } from "../helpers/dialogue-mask";
import { splitIntoSentences } from "../helpers/sentence-splitter";
import type { LintIssue, LintRuleConfig, LintReference } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Reference to the official document writing guide */
const STYLE_GUIDE_REF: LintReference = {
  standard: "文化庁「公用文作成の考え方」(2022)",
};

/** Minimum ratio of the majority style to flag minority sentences */
const MAJORITY_THRESHOLD = 0.6;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Writing style classification */
type WritingStyle = "polite" | "plain";

/** A classified sentence with its style and location */
interface ClassifiedSentence {
  paragraphIndex: number;
  style: WritingStyle;
  /** Start offset within the paragraph */
  from: number;
  /** End offset within the paragraph */
  to: number;
  /** Start offset of the style-determining token(s) */
  styleFrom: number;
  /** End offset of the style-determining token(s) */
  styleTo: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract tokens that fall within a given character range.
 */
function getTokensInRange(
  tokens: ReadonlyArray<Token>,
  from: number,
  to: number,
): Token[] {
  return tokens.filter((t) => t.start >= from && t.end <= to);
}

/**
 * Classify a sentence's writing style by examining its tokens.
 *
 * - **Polite (敬体)**: Contains auxiliary verb (助動詞) with basic_form です or ます
 * - **Plain (常体)**: Contains auxiliary verb with basic_form だ, or である,
 *   or ends with verb/adjective in 終止形/連体形 without です/ます
 *
 * Returns null if the style cannot be determined.
 */
function classifySentenceStyle(
  sentenceTokens: ReadonlyArray<Token>,
): { style: WritingStyle; from: number; to: number } | null {
  if (sentenceTokens.length === 0) return null;

  // Scan from the end of the sentence backwards to find the style-determining token
  // Check for polite style first (です/ます)
  for (let i = sentenceTokens.length - 1; i >= 0; i--) {
    const token = sentenceTokens[i];

    // Skip punctuation and particles at the very end
    if (token.pos === "記号" || token.pos === "助詞") continue;

    // Check for です (including でしょう: basic_form です, conjugation_form containing 未然形)
    if (token.pos === "助動詞" && token.basic_form === "です") {
      return { style: "polite", from: token.start, to: token.end };
    }

    // Check for ます (including ました, ません, ましょう)
    if (token.pos === "助動詞" && token.basic_form === "ます") {
      return { style: "polite", from: token.start, to: token.end };
    }

    // Check for だ (plain style auxiliary)
    if (token.pos === "助動詞" && token.basic_form === "だ") {
      // Make sure this isn't part of a です compound
      // Check if the next meaningful token is です
      let isPartOfPolite = false;
      for (let j = i + 1; j < sentenceTokens.length; j++) {
        const nextToken = sentenceTokens[j];
        if (nextToken.pos === "記号") continue;
        if (
          nextToken.pos === "助動詞" &&
          (nextToken.basic_form === "です" || nextToken.basic_form === "ます")
        ) {
          isPartOfPolite = true;
        }
        break;
      }
      if (!isPartOfPolite) {
        return { style: "plain", from: token.start, to: token.end };
      }
    }

    // Check for である
    if (token.basic_form === "ある" && i > 0) {
      const prevToken = sentenceTokens[i - 1];
      if (
        prevToken.pos === "助動詞" &&
        prevToken.basic_form === "だ" &&
        prevToken.surface === "で"
      ) {
        return { style: "plain", from: prevToken.start, to: token.end };
      }
    }

    // Check for verb/adjective ending in 終止形 or 連体形 (plain style)
    if (
      (token.pos === "動詞" || token.pos === "形容詞") &&
      token.conjugation_form &&
      (token.conjugation_form.includes("終止形") ||
        token.conjugation_form.includes("連体形"))
    ) {
      // Verify no polite auxiliary follows
      let hasPoliteAfter = false;
      for (let j = i + 1; j < sentenceTokens.length; j++) {
        const nextToken = sentenceTokens[j];
        if (nextToken.pos === "記号" || nextToken.pos === "助詞") continue;
        if (
          nextToken.pos === "助動詞" &&
          (nextToken.basic_form === "です" || nextToken.basic_form === "ます")
        ) {
          hasPoliteAfter = true;
        }
        break;
      }
      if (!hasPoliteAfter) {
        return { style: "plain", from: token.start, to: token.end };
      }
    }

    // If we've reached a content word without determining style, stop looking
    if (
      token.pos === "動詞" ||
      token.pos === "形容詞" ||
      token.pos === "名詞" ||
      token.pos === "助動詞"
    ) {
      break;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Desu/Masu Consistency Rule (L2, document-level, morphological)
 *
 * Detects mixing of polite style (敬体: です・ます体) and plain style
 * (常体: だ・である体) within a document. Dialogue sentences (inside
 * 「…」 or 『…』) are excluded from analysis since dialogue naturally
 * uses a different register.
 *
 * Detection strategy:
 * 1. Split each paragraph into sentences
 * 2. Skip dialogue sentences
 * 3. Classify each sentence's style using morphological analysis
 * 4. Determine the majority style across all paragraphs
 * 5. Flag minority-style sentences (only if majority >= 60%)
 *
 * Reference: 文化庁「公用文作成の考え方」(2022)
 */
export class DesuMasuConsistencyRule extends AbstractMorphologicalDocumentLintRule {
  readonly id = "desu-masu-consistency";
  readonly name = "Desu/Masu Consistency";
  readonly nameJa = "敬体・常体の混在検出";
  readonly description =
    "Detects mixing of polite and plain writing styles";
  readonly descriptionJa =
    "です・ます体と、だ・である体の混在を検出します";
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
    if (paragraphs.length === 0) return [];

    // Step 1-2: Classify all non-dialogue sentences across the document
    const classifiedSentences: ClassifiedSentence[] = [];

    for (const paragraph of paragraphs) {
      const sentences = splitIntoSentences(paragraph.text);

      for (const sentence of sentences) {
        // Skip dialogue sentences
        if (isInDialogue(sentence.from, paragraph.text)) continue;

        // Get tokens within this sentence's range
        const sentenceTokens = getTokensInRange(
          paragraph.tokens,
          sentence.from,
          sentence.to,
        );

        // Classify the sentence style
        const classification = classifySentenceStyle(sentenceTokens);
        if (classification === null) continue;

        classifiedSentences.push({
          paragraphIndex: paragraph.index,
          style: classification.style,
          from: sentence.from,
          to: sentence.to,
          styleFrom: classification.from,
          styleTo: classification.to,
        });
      }
    }

    // Need at least 2 classified sentences to detect inconsistency
    if (classifiedSentences.length < 2) return [];

    // Step 3: Determine majority style
    let politeCount = 0;
    let plainCount = 0;

    for (const sentence of classifiedSentences) {
      if (sentence.style === "polite") {
        politeCount++;
      } else {
        plainCount++;
      }
    }

    const totalClassified = politeCount + plainCount;
    const politeRatio = politeCount / totalClassified;
    const plainRatio = plainCount / totalClassified;

    // Only flag if majority is >= 60% — otherwise the mix may be intentional
    let majorityStyle: WritingStyle;
    if (politeRatio >= MAJORITY_THRESHOLD) {
      majorityStyle = "polite";
    } else if (plainRatio >= MAJORITY_THRESHOLD) {
      majorityStyle = "plain";
    } else {
      // No clear majority; don't flag anything
      return [];
    }

    // Step 4: Flag minority sentences
    const issuesByParagraph = new Map<number, LintIssue[]>();

    for (const sentence of classifiedSentences) {
      if (sentence.style === majorityStyle) continue;

      const issue = this.createIssue(
        sentence,
        majorityStyle,
        config.severity,
      );

      const existing = issuesByParagraph.get(sentence.paragraphIndex) ?? [];
      existing.push(issue);
      issuesByParagraph.set(sentence.paragraphIndex, existing);
    }

    // Convert map to result array
    const results: Array<{ paragraphIndex: number; issues: LintIssue[] }> = [];
    for (const [paragraphIndex, issues] of issuesByParagraph) {
      results.push({ paragraphIndex, issues });
    }

    return results;
  }

  /**
   * Create a lint issue for a minority-style sentence.
   * The issue highlights the style-determining token(s).
   */
  private createIssue(
    sentence: ClassifiedSentence,
    majorityStyle: WritingStyle,
    severity: LintIssue["severity"],
  ): LintIssue {
    if (sentence.style === "polite") {
      // This sentence is polite, but the document is predominantly plain
      return {
        ruleId: this.id,
        severity,
        message:
          "This sentence uses polite style (です・ます体), but the document predominantly uses plain style (だ・である体)",
        messageJa:
          "文化庁「公用文作成の考え方」に基づき、この文は敬体（です・ます体）ですが、文書全体では常体（だ・である体）が使われています",
        from: sentence.styleFrom,
        to: sentence.styleTo,
        reference: STYLE_GUIDE_REF,
      };
    }

    // This sentence is plain, but the document is predominantly polite
    return {
      ruleId: this.id,
      severity,
      message:
        "This sentence uses plain style (だ・である体), but the document predominantly uses polite style (です・ます体)",
      messageJa:
        "文化庁「公用文作成の考え方」に基づき、この文は常体（だ・である体）ですが、文書全体では敬体（です・ます体）が使われています",
      from: sentence.styleFrom,
      to: sentence.styleTo,
      reference: STYLE_GUIDE_REF,
    };
  }
}
