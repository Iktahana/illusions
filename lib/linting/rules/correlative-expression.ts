import { AbstractLintRule } from "../base-rule";
import { maskDialogue } from "../helpers/dialogue-mask";
import type { SentenceSpan } from "../helpers/sentence-splitter";
import { splitIntoSentences } from "../helpers/sentence-splitter";
import type { LintIssue, LintRuleConfig, LintReference , CorrectionEngine} from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Reference for correlative expression conventions */
const KOYOBUN_REF: LintReference = {
  standard: '文化庁「公用文作成の考え方」(2022)',
};

// ---------------------------------------------------------------------------
// Correlative pattern types
// ---------------------------------------------------------------------------

/**
 * Category of correlative expression (呼応表現).
 * Used for grouping and user-facing descriptions.
 */
type CorrelativeCategory =
  | "negation"     // 否定
  | "conjecture"   // 推測
  | "conditional"  // 条件
  | "hypothetical" // 仮定
  | "concessive"   // 譲歩
  | "interrogative" // 疑問
  | "simile";      // 比況

/** Japanese label for each category */
const CATEGORY_LABELS: Readonly<Record<CorrelativeCategory, string>> = {
  negation: "否定",
  conjecture: "推測",
  conditional: "条件",
  hypothetical: "仮定",
  concessive: "譲歩",
  interrogative: "疑問",
  simile: "比況",
};

/**
 * Defines a correlative adverb and its required sentence-ending pattern.
 */
interface CorrelativePattern {
  /** The adverb to look for in the sentence */
  readonly adverb: string;
  /** Category of the correlative expression */
  readonly category: CorrelativeCategory;
  /** Regex pattern that must match at the end of the sentence */
  readonly endingPattern: RegExp;
  /** Human-readable description of expected endings (Japanese) */
  readonly expectedEndingsJa: string;
}

// ---------------------------------------------------------------------------
// Ending pattern groups (reusable across multiple adverbs)
// ---------------------------------------------------------------------------

/**
 * Negative endings: ない, なかった, ぬ, ず, ません, ませんでした, etc.
 * Also matches compound forms like しない, できない, ありません, etc.
 */
const NEGATIVE_ENDING =
  /(?:ない|なかった|なくて|なければ|ぬ|ず|ません(?:でした)?|まい)$/;

/**
 * Conjecture endings: だろう, でしょう, かもしれない, と思われる,
 * であろう, に違いない, はずだ, etc.
 */
const CONJECTURE_ENDING =
  /(?:だろう|であろう|でしょう|かもしれない|かもしれません|と思われる|に違いない|に違いありません|はずだ|はずです)$/;

/**
 * Conditional endings: ば, たら, なら, と (conditional),
 * including polite forms like ましたら, ますなら, etc.
 */
const CONDITIONAL_ENDING =
  /(?:れば|ければ|たら|ましたら|なら(?:ば)?|ならば|(?:る|い|す|く|つ|ぬ|む|う|ぶ|ぐ)と)$/;

/**
 * Hypothetical endings: ば, たら, なら, としても, にしても, etc.
 * Broader than conditional — includes concessive-like endings.
 */
const HYPOTHETICAL_ENDING =
  /(?:れば|ければ|たら|ましたら|なら(?:ば)?|としても|にしても|としたら|とすれば)$/;

/**
 * Concessive endings: ても, でも, としても, にしても, にせよ, etc.
 */
const CONCESSIVE_ENDING =
  /(?:ても|でも|としても|にしても|にせよ|とはいえ|ものの|けれども|けれど|けど)$/;

/**
 * Interrogative endings: か, のか, だろうか, でしょうか, etc.
 */
const INTERROGATIVE_ENDING =
  /(?:か|のか|だろうか|でしょうか|のだろうか|のでしょうか|であろうか)$/;

/**
 * Simile endings: よう, ようだ, ようです, みたい, みたいだ,
 * ごとく, ごとし, etc.
 */
const SIMILE_ENDING =
  /(?:ようだ|ようです|ような|ように|みたいだ|みたいです|みたいな|みたいに|ごとく|ごとし|ごとき|かのようだ|かのようです)$/;

// ---------------------------------------------------------------------------
// Correlative pattern dictionary
// ---------------------------------------------------------------------------

/**
 * Dictionary of correlative adverbs and their required endings.
 *
 * Each entry specifies:
 * - The adverb (呼応副詞) to detect within a sentence
 * - The category of correlation
 * - A regex that the sentence ending must match
 * - A Japanese description of expected endings for the user
 *
 * Reference: 文化庁「公用文作成の考え方」(2022)
 */
const CORRELATIVE_PATTERNS: ReadonlyArray<CorrelativePattern> = [
  // --- 否定 (Negation) ---
  {
    adverb: "決して",
    category: "negation",
    endingPattern: NEGATIVE_ENDING,
    expectedEndingsJa: "ない・ぬ・ず・ません 等",
  },
  {
    adverb: "全く",
    category: "negation",
    endingPattern: NEGATIVE_ENDING,
    expectedEndingsJa: "ない・ぬ・ず・ません 等",
  },
  {
    adverb: "まったく",
    category: "negation",
    endingPattern: NEGATIVE_ENDING,
    expectedEndingsJa: "ない・ぬ・ず・ません 等",
  },
  {
    adverb: "必ずしも",
    category: "negation",
    endingPattern: NEGATIVE_ENDING,
    expectedEndingsJa: "ない・ぬ・ず・ません 等",
  },
  {
    adverb: "少しも",
    category: "negation",
    endingPattern: NEGATIVE_ENDING,
    expectedEndingsJa: "ない・ぬ・ず・ません 等",
  },
  {
    adverb: "二度と",
    category: "negation",
    endingPattern: NEGATIVE_ENDING,
    expectedEndingsJa: "ない・ぬ・ず・ません 等",
  },
  {
    adverb: "めったに",
    category: "negation",
    endingPattern: NEGATIVE_ENDING,
    expectedEndingsJa: "ない・ぬ・ず・ません 等",
  },
  {
    adverb: "一向に",
    category: "negation",
    endingPattern: NEGATIVE_ENDING,
    expectedEndingsJa: "ない・ぬ・ず・ません 等",
  },
  {
    adverb: "断じて",
    category: "negation",
    endingPattern: NEGATIVE_ENDING,
    expectedEndingsJa: "ない・ぬ・ず・ません 等",
  },
  {
    adverb: "到底",
    category: "negation",
    endingPattern: NEGATIVE_ENDING,
    expectedEndingsJa: "ない・ぬ・ず・ません 等",
  },
  {
    adverb: "とうてい",
    category: "negation",
    endingPattern: NEGATIVE_ENDING,
    expectedEndingsJa: "ない・ぬ・ず・ません 等",
  },
  {
    adverb: "ちっとも",
    category: "negation",
    endingPattern: NEGATIVE_ENDING,
    expectedEndingsJa: "ない・ぬ・ず・ません 等",
  },
  {
    adverb: "一切",
    category: "negation",
    endingPattern: NEGATIVE_ENDING,
    expectedEndingsJa: "ない・ぬ・ず・ません 等",
  },

  // --- 推測 (Conjecture) ---
  {
    adverb: "おそらく",
    category: "conjecture",
    endingPattern: CONJECTURE_ENDING,
    expectedEndingsJa: "だろう・でしょう・かもしれない・と思われる 等",
  },
  {
    adverb: "恐らく",
    category: "conjecture",
    endingPattern: CONJECTURE_ENDING,
    expectedEndingsJa: "だろう・でしょう・かもしれない・と思われる 等",
  },
  {
    adverb: "たぶん",
    category: "conjecture",
    endingPattern: CONJECTURE_ENDING,
    expectedEndingsJa: "だろう・でしょう・かもしれない・と思われる 等",
  },
  {
    adverb: "多分",
    category: "conjecture",
    endingPattern: CONJECTURE_ENDING,
    expectedEndingsJa: "だろう・でしょう・かもしれない・と思われる 等",
  },
  {
    adverb: "さぞ",
    category: "conjecture",
    endingPattern: CONJECTURE_ENDING,
    expectedEndingsJa: "だろう・でしょう・かもしれない・に違いない 等",
  },
  {
    adverb: "さぞかし",
    category: "conjecture",
    endingPattern: CONJECTURE_ENDING,
    expectedEndingsJa: "だろう・でしょう・かもしれない・に違いない 等",
  },

  // --- 条件 (Conditional) ---
  {
    adverb: "もし",
    category: "conditional",
    endingPattern: CONDITIONAL_ENDING,
    expectedEndingsJa: "ば・たら・なら・と 等",
  },
  {
    adverb: "もしも",
    category: "conditional",
    endingPattern: CONDITIONAL_ENDING,
    expectedEndingsJa: "ば・たら・なら・と 等",
  },

  // --- 仮定 (Hypothetical) ---
  {
    adverb: "仮に",
    category: "hypothetical",
    endingPattern: HYPOTHETICAL_ENDING,
    expectedEndingsJa: "ば・たら・なら・としても 等",
  },
  {
    adverb: "万一",
    category: "hypothetical",
    endingPattern: HYPOTHETICAL_ENDING,
    expectedEndingsJa: "ば・たら・なら・としても 等",
  },
  {
    adverb: "万が一",
    category: "hypothetical",
    endingPattern: HYPOTHETICAL_ENDING,
    expectedEndingsJa: "ば・たら・なら・としても 等",
  },

  // --- 譲歩 (Concessive) ---
  {
    adverb: "たとえ",
    category: "concessive",
    endingPattern: CONCESSIVE_ENDING,
    expectedEndingsJa: "ても・でも・としても 等",
  },
  {
    adverb: "仮令",
    category: "concessive",
    endingPattern: CONCESSIVE_ENDING,
    expectedEndingsJa: "ても・でも・としても 等",
  },
  {
    adverb: "いくら",
    category: "concessive",
    endingPattern: CONCESSIVE_ENDING,
    expectedEndingsJa: "ても・でも・としても 等",
  },

  // --- 疑問 (Interrogative) ---
  {
    adverb: "なぜ",
    category: "interrogative",
    endingPattern: INTERROGATIVE_ENDING,
    expectedEndingsJa: "か・のか・だろうか 等",
  },
  {
    adverb: "どうして",
    category: "interrogative",
    endingPattern: INTERROGATIVE_ENDING,
    expectedEndingsJa: "か・のか・だろうか 等",
  },
  {
    adverb: "果たして",
    category: "interrogative",
    endingPattern: INTERROGATIVE_ENDING,
    expectedEndingsJa: "か・のか・だろうか 等",
  },
  {
    adverb: "はたして",
    category: "interrogative",
    endingPattern: INTERROGATIVE_ENDING,
    expectedEndingsJa: "か・のか・だろうか 等",
  },

  // --- 比況 (Simile) ---
  {
    adverb: "まるで",
    category: "simile",
    endingPattern: SIMILE_ENDING,
    expectedEndingsJa: "ようだ・みたいだ・ごとく 等",
  },
  {
    adverb: "あたかも",
    category: "simile",
    endingPattern: SIMILE_ENDING,
    expectedEndingsJa: "ようだ・みたいだ・ごとく 等",
  },
  {
    adverb: "さながら",
    category: "simile",
    endingPattern: SIMILE_ENDING,
    expectedEndingsJa: "ようだ・みたいだ・ごとく 等",
  },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the effective ending of a sentence by stripping trailing
 * whitespace and common sentence-final particles/punctuation.
 *
 * Returns the trimmed sentence text suitable for ending pattern matching.
 */
function getEffectiveEnding(maskedSentence: string): string {
  return maskedSentence.trimEnd();
}

/**
 * Find all non-overlapping occurrences of a literal string in text
 * and return their start indices.
 */
function findAllOccurrences(text: string, needle: string): number[] {
  const indices: number[] = [];
  let pos = 0;
  while (pos <= text.length - needle.length) {
    const idx = text.indexOf(needle, pos);
    if (idx === -1) break;
    indices.push(idx);
    pos = idx + needle.length;
  }
  return indices;
}

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Correlative Expression Consistency Rule (L1)
 *
 * Detects mismatches between Japanese correlative adverbs (呼応副詞)
 * and their required sentence endings.
 *
 * Japanese correlative expressions require specific verb endings to
 * maintain grammatical consistency. For example:
 * - 「決して」 requires a negative ending (ない, ぬ, ず, ません)
 * - 「おそらく」 requires a conjecture ending (だろう, でしょう)
 * - 「もし」 requires a conditional ending (ば, たら, なら)
 *
 * Detection strategy:
 * 1. Split text into sentences (delimited by 。, ！, ？, etc.)
 * 2. For each sentence, mask quoted text (「…」) to avoid false positives
 * 3. Search for correlative adverbs in the unquoted portion
 * 4. Check if the sentence ending matches the required pattern
 * 5. Report mismatches with the adverb position highlighted
 *
 * Reference: 文化庁「公用文作成の考え方」(2022)
 */
export class CorrelativeExpressionRule extends AbstractLintRule {
  readonly id = "correlative-expression";
  override engine: CorrectionEngine = "regex";
  readonly name = "Correlative expression consistency";
  readonly nameJa = "呼応表現の整合性";
  readonly description =
    "Check consistency between correlative adverbs and sentence endings";
  readonly descriptionJa = "副詞と文末表現の対応をチェック";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];

    const sentences = splitIntoSentences(text);
    const issues: LintIssue[] = [];

    for (const sentence of sentences) {
      issues.push(
        ...this.checkSentence(sentence, config),
      );
    }

    return issues;
  }

  /**
   * Check a single sentence for correlative expression mismatches.
   *
   * For each known correlative adverb found in the sentence (outside
   * quoted text), verifies the sentence ending matches the required pattern.
   */
  private checkSentence(
    sentence: SentenceSpan,
    config: LintRuleConfig,
  ): LintIssue[] {
    const issues: LintIssue[] = [];
    const masked = config.skipDialogue ? maskDialogue(sentence.text) : sentence.text;
    const ending = getEffectiveEnding(masked);

    // Skip very short sentences (unlikely to have meaningful correlative pairs)
    if (ending.length < 3) return issues;

    for (const pattern of CORRELATIVE_PATTERNS) {
      // Search for the adverb in the masked (quote-free) text
      const adverbPositions = findAllOccurrences(masked, pattern.adverb);

      if (adverbPositions.length === 0) continue;

      // Check if the sentence ending matches the required pattern
      if (pattern.endingPattern.test(ending)) continue;

      // Mismatch detected: report an issue for each adverb occurrence
      const categoryLabel = CATEGORY_LABELS[pattern.category];

      for (const relativePos of adverbPositions) {
        const absoluteFrom = sentence.from + relativePos;
        const absoluteTo = absoluteFrom + pattern.adverb.length;

        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message:
            `Correlative expression mismatch: "${pattern.adverb}" (${pattern.category}) requires a matching sentence ending (${pattern.expectedEndingsJa})`,
          messageJa:
            `「文化庁「公用文作成の考え方」に基づき、呼応副詞「${pattern.adverb}」（${categoryLabel}）に対応する文末表現（${pattern.expectedEndingsJa}）がありません」`,
          from: absoluteFrom,
          to: absoluteTo,
          reference: KOYOBUN_REF,
        });
      }
    }

    return issues;
  }
}
