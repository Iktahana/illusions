import { AbstractLintRule } from "../base-rule";
import { maskDialogue } from "../helpers/dialogue-mask";
import type { LintIssue, LintRuleConfig, LintReference , CorrectionEngine} from "../types";

/** Reference for verbose expression checks */
const STYLE_GUIDE_REF: LintReference = {
  standard: "日本語スタイルガイド",
};

/**
 * Verbose pattern definition: maps a wordy expression to its concise alternative.
 */
interface VerbosePattern {
  /** The verbose expression to detect */
  pattern: string;
  /** The concise alternative to suggest */
  suggestion: string;
  /** Japanese description of why this is verbose */
  descriptionJa: string;
}

/**
 * Dictionary of verbose Japanese expressions and their concise replacements.
 *
 * Patterns are ordered so that longer, more specific patterns come before
 * shorter, more general ones to avoid partial matches shadowing full matches.
 */
const VERBOSE_PATTERNS: ReadonlyArray<VerbosePattern> = [
  // することができる pattern
  { pattern: "することができる", suggestion: "できる", descriptionJa: "「することができる」は「できる」で十分です" },
  { pattern: "することが可能", suggestion: "できる", descriptionJa: "「することが可能」は「できる」で十分です" },
  { pattern: "することが出来る", suggestion: "できる", descriptionJa: "「することが出来る」は「できる」で十分です" },

  // というふう pattern
  { pattern: "というふうに", suggestion: "と", descriptionJa: "「というふうに」は「と」で十分です" },
  { pattern: "という風に", suggestion: "と", descriptionJa: "「という風に」は「と」で十分です" },

  // ということ pattern
  { pattern: "ということができる", suggestion: "と言える", descriptionJa: "より簡潔に表現できます" },
  { pattern: "というものは", suggestion: "は", descriptionJa: "「というものは」は冗長です" },

  // ないわけではない (double negative)
  { pattern: "できないわけではない", suggestion: "できる", descriptionJa: "二重否定は分かりにくいため、肯定表現が推奨されます" },
  { pattern: "ないわけではない", suggestion: "ある", descriptionJa: "二重否定は分かりにくいため、肯定表現が推奨されます" },
  { pattern: "なくはない", suggestion: "ある", descriptionJa: "二重否定は分かりにくいため、肯定表現が推奨されます" },
  { pattern: "ないことはない", suggestion: "ある", descriptionJa: "二重否定は分かりにくいため、肯定表現が推奨されます" },
  { pattern: "しないでもない", suggestion: "することもある", descriptionJa: "二重否定は分かりにくいため、肯定表現が推奨されます" },

  // と言っても過言ではない pattern
  { pattern: "と言っても過言ではない", suggestion: "と言える", descriptionJa: "より簡潔に表現できます" },
  { pattern: "といっても過言ではない", suggestion: "といえる", descriptionJa: "より簡潔に表現できます" },

  // において/における pattern
  { pattern: "において", suggestion: "で", descriptionJa: "「において」は「で」で十分な場合が多いです" },
  { pattern: "における", suggestion: "の", descriptionJa: "「における」は「の」で十分な場合が多いです" },

  // Other verbose patterns
  { pattern: "についてですが", suggestion: "について", descriptionJa: "「ですが」は不要です" },
  { pattern: "の方が", suggestion: "が", descriptionJa: "「の方」は不要な場合があります" },
  { pattern: "行うことにする", suggestion: "行う", descriptionJa: "より簡潔に表現できます" },
  { pattern: "であるということ", suggestion: "であること", descriptionJa: "「という」は冗長です" },
  { pattern: "かどうかということ", suggestion: "かどうか", descriptionJa: "「ということ」は冗長です" },
  { pattern: "ようにする", suggestion: "する", descriptionJa: "「ようにする」は冗長な場合があります" },
  { pattern: "的に言えば", suggestion: "的には", descriptionJa: "より簡潔に表現できます" },
] as const;

/**
 * VerboseExpressionRule -- L1 string-matching rule for verbose Japanese expressions.
 *
 * Scans text for wordy expressions and suggests concise alternatives.
 * Uses "info" severity by default since suggestions may not always be
 * appropriate depending on context (e.g., creative writing, dialogue).
 */
export class VerboseExpressionRule extends AbstractLintRule {
  readonly id = "verbose-expression";
  override engine: CorrectionEngine = "regex";
  readonly name = "Verbose expression simplification";
  readonly nameJa = "冗長表現の簡略化";
  readonly description = "Detect verbose expressions and suggest concise alternatives";
  readonly descriptionJa = "冗長な表現を検出し、簡潔な言い換えを提案";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "info",
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];

    const maskedText = config.skipDialogue ? maskDialogue(text) : text;
    const issues: LintIssue[] = [];

    for (const entry of VERBOSE_PATTERNS) {
      this.findPatternOccurrences(maskedText, entry, config.severity, issues);
    }

    // Sort issues by position for consistent output
    issues.sort((a, b) => a.from - b.from);

    return issues;
  }

  /**
   * Find all occurrences of a verbose pattern in the text and create issues.
   * Uses indexOf in a while loop to find every match position.
   */
  private findPatternOccurrences(
    text: string,
    entry: VerbosePattern,
    severity: LintIssue["severity"],
    issues: LintIssue[],
  ): void {
    let searchFrom = 0;

    while (searchFrom < text.length) {
      const index = text.indexOf(entry.pattern, searchFrom);
      if (index === -1) break;

      issues.push({
        ruleId: this.id,
        severity,
        message: `Verbose expression "${entry.pattern}" can be simplified to "${entry.suggestion}"`,
        messageJa: `「日本語スタイルガイドに基づき、「${entry.pattern}」は冗長表現です。${entry.descriptionJa}」`,
        from: index,
        to: index + entry.pattern.length,
        reference: STYLE_GUIDE_REF,
        fix: {
          label: `Replace with "${entry.suggestion}"`,
          labelJa: `「${entry.suggestion}」に置換`,
          replacement: entry.suggestion,
        },
      });

      // Move past this match to find subsequent occurrences
      searchFrom = index + entry.pattern.length;
    }
  }
}
