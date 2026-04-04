import type { Token } from "@/lib/nlp-client/types";

import { AbstractMorphologicalLintRule } from "../../base-rule";
import { getJsonRulesByBook } from "../../rule-loader";
import type { JsonRuleMeta, LintIssue, LintRuleConfig, LintReference } from "../../types";

const BOOK_TITLE = "現代仮名遣い";

const GK_REFERENCE: LintReference = {
  standard: "現代仮名遣い (1986)",
  url: "",
};

function findRuleMeta(ruleId: string): JsonRuleMeta {
  const entry = getJsonRulesByBook(BOOK_TITLE).find((rule) => rule.Rule_ID === ruleId);
  if (!entry) {
    throw new Error(`Rule ${ruleId} not found in ${BOOK_TITLE}`);
  }

  return {
    ruleId: entry.Rule_ID,
    level: entry.Level,
    description: entry.Description,
    patternLogic: entry["Pattern/Logic"],
    positiveExample: entry.Positive_Example,
    negativeExample: entry.Negative_Example,
    sourceReference: entry.Source_Reference,
    bookTitle: BOOK_TITLE,
  };
}

function createIssue(
  rule: AbstractMorphologicalLintRule & { meta: JsonRuleMeta },
  config: LintRuleConfig,
  from: number,
  wrong: string,
  replacement: string,
  messageJa: string,
): LintIssue {
  return {
    ruleId: rule.id,
    severity: config.severity,
    message: `${wrong} should be written as ${replacement}`,
    messageJa,
    from,
    to: from + wrong.length,
    originalText: wrong,
    reference: {
      ...GK_REFERENCE,
      section: rule.meta.sourceReference,
    },
    fix: {
      label: `Replace with ${replacement}`,
      labelJa: `「${replacement}」に修正`,
      replacement,
    },
  };
}

/** Check if a token is a content word (noun, verb, adjective, adverb). */
function isContentWord(token: Token): boolean {
  return (
    token.pos === "名詞" ||
    token.pos === "動詞" ||
    token.pos === "形容詞" ||
    token.pos === "副詞" ||
    token.pos === "連体詞"
  );
}

/**
 * L2 rule: Detects particle を miswritten as お.
 *
 * Uses kuromoji tokens to distinguish:
 * - Prefix お (お茶, お水) → skip
 * - Part of a word (おおきい, おもしろい) → skip (not a standalone token)
 * - Interjection/filler → skip
 * - Isolated お between content words → flag
 */
class ParticleORule extends AbstractMorphologicalLintRule {
  readonly meta: JsonRuleMeta;
  readonly id = "gk-2-1-particle-o";
  readonly name = "Particle o";
  readonly nameJa = "助詞「を」";
  readonly description = "Detects the particle を written as お";
  readonly descriptionJa = "助詞の「を」を「お」と誤記した箇所を検出します。";
  readonly level = "L2" as const;
  readonly defaultConfig: LintRuleConfig = { enabled: true, severity: "error" };

  constructor() {
    super();
    this.meta = findRuleMeta("rule_GK_2_1_particle_o");
  }

  lintWithTokens(_text: string, tokens: ReadonlyArray<Token>, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled) return [];

    const issues: LintIssue[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.surface !== "お") continue;

      // Prefix お (お茶, お水, お名前) — perfectly valid
      if (token.pos === "接頭詞") continue;

      // Interjection or filler
      if (token.pos === "感動詞" || token.pos === "フィラー") continue;

      // If kuromoji already recognized it as a particle, it's definitely a miswrite
      if (token.pos === "助詞") {
        issues.push(
          createIssue(
            this,
            config,
            token.start,
            "お",
            "を",
            "現代仮名遣いに基づき、助詞は「お」ではなく「を」と書きます。",
          ),
        );
        continue;
      }

      // Heuristic: standalone お between content words likely intended as を
      const prev = i > 0 ? tokens[i - 1] : undefined;
      const next = i < tokens.length - 1 ? tokens[i + 1] : undefined;

      if (prev && next && isContentWord(prev) && isContentWord(next)) {
        issues.push(
          createIssue(
            this,
            config,
            token.start,
            "お",
            "を",
            "現代仮名遣いに基づき、助詞は「お」ではなく「を」と書きます。",
          ),
        );
      }
    }

    return issues;
  }
}

/** Known phrases where わ is a miswritten は */
const HA_EXPLICIT_PATTERNS: Array<{ pattern: RegExp; waOffset: (m: RegExpMatchArray) => number }> =
  [
    { pattern: /こんにちわ/gu, waOffset: (m) => m.index! + 4 },
    { pattern: /こんばんわ/gu, waOffset: (m) => m.index! + 4 },
  ];

/**
 * L2 rule: Detects particle は miswritten as わ.
 *
 * Uses kuromoji tokens to distinguish:
 * - 終助詞 わ (「嫌だわ」「そうだわ」) → valid, skip
 * - Topic marker position (は) written as わ → flag
 * - Known misspellings (こんにちわ, こんばんわ) → flag via text pattern
 */
class ParticleHaRule extends AbstractMorphologicalLintRule {
  readonly meta: JsonRuleMeta;
  readonly id = "gk-2-2-particle-ha";
  readonly name = "Particle ha";
  readonly nameJa = "助詞「は」";
  readonly description = "Detects the particle は written as わ";
  readonly descriptionJa = "助詞の「は」を「わ」と誤記した箇所を検出します。";
  readonly level = "L2" as const;
  readonly defaultConfig: LintRuleConfig = { enabled: true, severity: "error" };

  constructor() {
    super();
    this.meta = findRuleMeta("rule_GK_2_2_particle_ha");
  }

  lintWithTokens(text: string, tokens: ReadonlyArray<Token>, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled) return [];

    const issues: LintIssue[] = [];
    const flaggedPositions = new Set<number>();

    // Phase 1: Check explicit misspelling patterns in raw text
    for (const { pattern, waOffset } of HA_EXPLICIT_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of text.matchAll(pattern)) {
        const pos = waOffset(match);
        flaggedPositions.add(pos);
        issues.push(
          createIssue(
            this,
            config,
            pos,
            "わ",
            "は",
            "現代仮名遣いに基づき、助詞は「わ」ではなく「は」と書きます。",
          ),
        );
      }
    }

    // Phase 2: Token-based detection
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.surface !== "わ") continue;
      if (flaggedPositions.has(token.start)) continue;

      // 終助詞 わ (「嫌だわ」「行くわよ」) is valid
      if (token.pos === "助詞" && token.pos_detail_1 === "終助詞") continue;

      // If kuromoji recognized it as a non-終助詞 particle, it's a miswrite
      if (token.pos === "助詞") {
        issues.push(
          createIssue(
            this,
            config,
            token.start,
            "わ",
            "は",
            "現代仮名遣いに基づき、助詞は「わ」ではなく「は」と書きます。",
          ),
        );
        continue;
      }

      // Heuristic: standalone わ after content word, followed by content word or predicate
      // (topic marker position: Xわ... → Xは...)
      const prev = i > 0 ? tokens[i - 1] : undefined;
      const next = i < tokens.length - 1 ? tokens[i + 1] : undefined;

      if (prev && next && isContentWord(prev) && isContentWord(next)) {
        issues.push(
          createIssue(
            this,
            config,
            token.start,
            "わ",
            "は",
            "現代仮名遣いに基づき、助詞は「わ」ではなく「は」と書きます。",
          ),
        );
      }
    }

    return issues;
  }
}

/**
 * L2 rule: Detects particle へ miswritten as え.
 *
 * Uses kuromoji tokens to distinguish:
 * - Interjection え (「え？」「えっ」) → skip
 * - Part of a word (答え, 声) → skip (not standalone え token)
 * - Direction particle position → flag
 */
class ParticleHeRule extends AbstractMorphologicalLintRule {
  readonly meta: JsonRuleMeta;
  readonly id = "gk-2-3-particle-he";
  readonly name = "Particle he";
  readonly nameJa = "助詞「へ」";
  readonly description = "Detects the particle へ written as え";
  readonly descriptionJa = "助詞の「へ」を「え」と誤記した箇所を検出します。";
  readonly level = "L2" as const;
  readonly defaultConfig: LintRuleConfig = { enabled: true, severity: "error" };

  constructor() {
    super();
    this.meta = findRuleMeta("rule_GK_2_3_particle_he");
  }

  lintWithTokens(_text: string, tokens: ReadonlyArray<Token>, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled) return [];

    const issues: LintIssue[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.surface !== "え") continue;

      // Interjection え (「え？」「ええ」)
      if (token.pos === "感動詞" || token.pos === "フィラー") continue;

      // If kuromoji recognized it as a particle, it's a miswrite
      if (token.pos === "助詞") {
        issues.push(
          createIssue(
            this,
            config,
            token.start,
            "え",
            "へ",
            "現代仮名遣いに基づき、助詞は「え」ではなく「へ」と書きます。",
          ),
        );
        continue;
      }

      // Heuristic: standalone え after location/noun, followed by movement verb
      const prev = i > 0 ? tokens[i - 1] : undefined;
      const next = i < tokens.length - 1 ? tokens[i + 1] : undefined;

      if (prev && next && isContentWord(prev) && next.pos === "動詞") {
        issues.push(
          createIssue(
            this,
            config,
            token.start,
            "え",
            "へ",
            "現代仮名遣いに基づき、助詞は「え」ではなく「へ」と書きます。",
          ),
        );
      }
    }

    return issues;
  }
}

export function createGendaiKanazukaiL2Rules(): AbstractMorphologicalLintRule[] {
  return [new ParticleORule(), new ParticleHaRule(), new ParticleHeRule()];
}
