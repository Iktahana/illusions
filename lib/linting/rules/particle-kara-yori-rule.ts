import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KOYO_REF: LintReference = {
  standard: "公用文作成の考え方（文化審議会、2022）",
};

/**
 * Patterns indicating 「より」used as a source/starting-point marker
 * (= 「から」) rather than as a comparative marker.
 *
 * Heuristic: 「より」preceded by a place or time noun followed by
 * a movement/origin verb suggests misuse as 「から」.
 *
 * Flag patterns:
 * - 「〜よりも」when not comparing two items explicitly
 * - 「〜より参りました」「〜より届いた」— origin/source usage
 * - Sentence-initial 「より〜」(formal but potentially ambiguous)
 */
const YORI_MISUSE_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  note: string;
}> = [
  {
    pattern: /より参り/g,
    note: "「より参り」は「から参り」（起点）の意味で使われています。起点を示す場合は「から」を使ってください",
  },
  {
    pattern: /より届い/g,
    note: "「より届い」は「から届い」（起点）の意味で使われています。起点を示す場合は「から」を使ってください",
  },
  {
    pattern: /より送付/g,
    note: "「より送付」は「から送付」（起点）の意味の可能性があります。起点を示す場合は「から」を使ってください",
  },
  {
    pattern: /より発送/g,
    note: "「より発送」は「から発送」（起点）の意味の可能性があります。起点を示す場合は「から」を使ってください",
  },
  {
    pattern: /より着信/g,
    note: "「より着信」は「から着信」（起点）の意味で使われています。「から」を使ってください",
  },
  {
    pattern: /より来た/g,
    note: "「より来た」は「から来た」（起点）の意味で使われています。「から」を使ってください",
  },
  {
    pattern: /より受信/g,
    note: "「より受信」は「から受信」（起点）の意味で使われています。「から」を使ってください",
  },
];

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Particle Kara/Yori Rule (L1)
 *
 * 「より」is primarily a comparative particle meaning "than/more than".
 * Using it to indicate a source or starting point (= 「から」) is a misuse
 * common in formal writing but discouraged in modern 公用文.
 * e.g., 「東京より参りました」→「東京から参りました」
 *
 * This rule uses heuristic regex patterns to detect likely misuse.
 * For ambiguous cases, manual review is recommended.
 *
 * Reference: 公用文作成の考え方（文化審議会、2022）
 */
export class ParticleKaraYoriRule extends AbstractLintRule {
  readonly id = "particle-kara-yori";
  override engine: CorrectionEngine = "regex";
  readonly name = "Misuse of より as Starting-Point Particle";
  readonly nameJa = "起点を示す「より」の誤用";
  readonly description = "「より」should not be used as a starting-point marker; use 「から」instead";
  readonly descriptionJa = "起点・出所を表す場合は「より」でなく「から」を使います（公用文作成の考え方）";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];
    const issues: LintIssue[] = [];

    for (const { pattern, note } of YORI_MISUSE_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(text)) !== null) {
        const from = match.index;
        const to = from + match[0].length;
        const replacement = match[0].replace("より", "から");
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Possible misuse of "より" as starting-point marker. ${note}`,
          messageJa: note,
          from,
          to,
          originalText: match[0],
          reference: KOYO_REF,
          fix: {
            label: `Replace "より" with "から"`,
            labelJa: `「より」を「から」に置換`,
            replacement,
          },
        });
      }
    }

    return issues;
  }
}
