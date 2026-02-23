import type { Token } from "@/lib/nlp-client/types";
import { AbstractMorphologicalLintRule } from "../base-rule";
import { COUNTER_MISMATCHES } from "../data/counter-words";
import { isInDialogue } from "../helpers/dialogue-mask";
import type { LintIssue, LintRuleConfig, LintReference , CorrectionEngine} from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Reference to the official government style guide */
const STYLE_GUIDE_REF: LintReference = {
  standard: "文化庁「公用文作成の考え方」(2022)",
};

/**
 * POS detail_1 values to exclude when searching for a nearby noun context.
 * These are functional/grammatical sub-types that do not represent a
 * countable object.
 */
const EXCLUDED_NOUN_DETAIL = new Set([
  "非自立",  // non-independent
  "接尾",    // suffix (includes counters themselves)
  "数",      // number
  "代名詞",  // pronoun
]);

/**
 * Maximum token distance to search for a noun context around a
 * number + counter pair.
 */
const NOUN_SEARCH_WINDOW = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if a token is a number token.
 * Kuromoji tags Arabic digits and kanji numerals as 名詞 + 数.
 */
function isNumberToken(token: Token): boolean {
  return token.pos === "名詞" && token.pos_detail_1 === "数";
}

/**
 * Check if a token is a counter word (助数詞) suffix.
 * Kuromoji tags counters as 名詞 + 接尾 + 助数詞.
 */
function isCounterToken(token: Token): boolean {
  return (
    token.pos === "名詞" &&
    token.pos_detail_1 === "接尾" &&
    token.pos_detail_2 === "助数詞"
  );
}

/**
 * Check if a token is a content noun suitable as a counted object.
 * Excludes functional sub-types (non-independent, suffix, number, pronoun).
 */
function isContentNoun(token: Token): boolean {
  if (token.pos !== "名詞") return false;
  if (token.pos_detail_1 && EXCLUDED_NOUN_DETAIL.has(token.pos_detail_1)) {
    return false;
  }
  return true;
}

/**
 * Search for the nearest content noun within a window around the
 * number + counter pair.
 *
 * Scans up to `NOUN_SEARCH_WINDOW` tokens before the number token
 * and after the counter token, returning the closest match.
 */
function findNearbyNoun(
  tokens: ReadonlyArray<Token>,
  numberIndex: number,
  counterIndex: number,
): Token | undefined {
  // Search backward from the number token
  for (
    let i = numberIndex - 1;
    i >= 0 && i >= numberIndex - NOUN_SEARCH_WINDOW;
    i--
  ) {
    if (isContentNoun(tokens[i])) {
      return tokens[i];
    }
  }

  // Search forward from the counter token
  for (
    let i = counterIndex + 1;
    i < tokens.length && i <= counterIndex + NOUN_SEARCH_WINDOW;
    i++
  ) {
    if (isContentNoun(tokens[i])) {
      return tokens[i];
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Counter Word Mismatch Rule (L2)
 *
 * Detects incorrect counter word (助数詞) and noun combinations.
 * Uses morphological analysis to identify number + counter patterns
 * and checks the nearby noun against a dictionary of known mismatches.
 *
 * Detection strategy:
 * 1. Scan tokens for number tokens (名詞 + 数)
 * 2. Find the adjacent counter token (名詞 + 接尾 + 助数詞)
 * 3. Locate a nearby content noun within a search window
 * 4. Check the counter-noun pair against COUNTER_MISMATCHES
 * 5. Flag with a fix suggestion if a mismatch is found
 *
 * Reference: 文化庁「公用文作成の考え方」(2022)
 */
export class CounterWordMismatchRule extends AbstractMorphologicalLintRule {
  readonly id = "counter-word-mismatch";
  override engine: CorrectionEngine = "morphological";
  readonly name = "Counter Word Mismatch";
  readonly nameJa = "助数詞の誤用検出";
  readonly description = "Validates number + counter word combinations";
  readonly descriptionJa =
    "助数詞と数えられる対象の組み合わせの誤りを検出します";
  readonly level = "L2" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
  };

  lintWithTokens(
    text: string,
    tokens: ReadonlyArray<Token>,
    config: LintRuleConfig,
  ): LintIssue[] {
    if (!text || tokens.length === 0) return [];

    const issues: LintIssue[] = [];

    for (let i = 0; i < tokens.length; i++) {
      // Skip tokens inside dialogue
      if (config.skipDialogue && isInDialogue(tokens[i].start, text)) continue;

      // Step 1: Find a number token
      if (!isNumberToken(tokens[i])) continue;

      // Step 2: Look for a counter within 2 tokens after the number
      let counterIndex = -1;
      for (
        let j = i + 1;
        j < tokens.length && j <= i + 2;
        j++
      ) {
        if (isCounterToken(tokens[j])) {
          counterIndex = j;
          break;
        }
      }

      if (counterIndex === -1) continue;

      const counterToken = tokens[counterIndex];
      const counterSurface = counterToken.surface;

      // Step 3: Find a nearby noun context
      const nounToken = findNearbyNoun(tokens, i, counterIndex);
      if (!nounToken) continue;

      const nounSurface = nounToken.surface;
      const nounBasicForm =
        nounToken.basic_form && nounToken.basic_form !== "*"
          ? nounToken.basic_form
          : nounToken.surface;

      // Step 4: Check against known mismatches
      for (const mismatch of COUNTER_MISMATCHES) {
        if (counterSurface !== mismatch.counter) continue;

        const isInvalid = mismatch.invalidNouns.some(
          (noun) => nounSurface === noun || nounBasicForm === noun,
        );

        if (!isInvalid) continue;

        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Counter '${counterSurface}' may be incorrect for '${nounSurface}'; consider '${mismatch.suggestion}'`,
          messageJa: `文化庁「公用文作成の考え方」に基づき、「${nounSurface}」に対して助数詞「${counterSurface}」は不適切です。${mismatch.descriptionJa}`,
          from: counterToken.start,
          to: counterToken.end,
          reference: STYLE_GUIDE_REF,
          fix: {
            label: `Replace with '${mismatch.suggestion}'`,
            labelJa: `「${mismatch.suggestion}」に置換`,
            replacement: mismatch.suggestion,
          },
        });

        // Only report the first matching mismatch per counter
        break;
      }
    }

    return issues;
  }
}
