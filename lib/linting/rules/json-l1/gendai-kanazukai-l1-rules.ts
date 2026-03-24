/**
 * 現代仮名遣い L1 Rules
 *
 * Implements particle usage rules from 文部科学省「現代仮名遣い」(1986).
 * These L1 rules use heuristic regex patterns to detect common
 * particle misuse without morphological analysis.
 */

import { AbstractL1Rule } from "../../base-rule";
import type { JsonRuleMeta, LintIssue, LintRuleConfig, LintReference } from "../../types";
import { getJsonRulesByBook } from "../../rule-loader";

/** Standard reference for 現代仮名遣い */
const GK_REF: LintReference = {
  standard: "現代仮名遣い (1986)",
  url: "",
};

/**
 * Helper to find a rule entry from rules.json by Rule_ID.
 * Returns a JsonRuleMeta built from the JSON data.
 */
function findRuleMeta(ruleId: string): JsonRuleMeta {
  const rules = getJsonRulesByBook("現代仮名遣い");
  const entry = rules.find((r) => r.Rule_ID === ruleId);
  if (!entry) {
    throw new Error(`Rule ${ruleId} not found in rules.json`);
  }
  return {
    ruleId: entry.Rule_ID,
    level: entry.Level as "L1",
    description: entry.Description,
    patternLogic: entry["Pattern/Logic"],
    positiveExample: entry.Positive_Example,
    negativeExample: entry.Negative_Example,
    sourceReference: entry.Source_Reference,
    bookTitle: "現代仮名遣い",
  };
}

// ─── Common character class patterns for regex ─────────────────────
/** Katakana Unicode range for regex character classes */
const KATAKANA = "\\u30A1-\\u30F6";
/** CJK Unified Ideographs (common kanji range) for regex character classes */
const KANJI = "\\u4E00-\\u9FFF\\u3400-\\u4DBF";

// ─── Rule: Particle を ─────────────────────────────────────────────

/**
 * ParticleORule — Detects mistaken use of お instead of particle を.
 *
 * Strategy: Very conservative regex — only flag [kanji]お[common verb kanji].
 * This avoids false positives with words that naturally contain お.
 * A more comprehensive check requires morphological analysis (L2).
 */
class ParticleORule extends AbstractL1Rule {
  constructor() {
    super(findRuleMeta("rule_GK_2_1_particle_o"), {
      id: "gk-particle-o",
      name: "Particle を usage",
      nameJa: "助詞「を」の表記",
      description: "Detects incorrect use of お instead of particle を",
      descriptionJa: "助詞の「を」を「お」と書いている箇所を検出します",
      defaultConfig: {
        enabled: true,
        severity: "error",
      },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];
    const issues: LintIssue[] = [];

    // Pattern: [kanji]お[common verb kanji]
    // Very conservative: only flag when preceded by kanji and followed by
    // common verb-starting kanji characters
    const verbStarters = "読|書|食|飲|見|聞|買|売|作|持|取|送|置|待|使|話|歩|走|泳";
    const re = new RegExp(
      `([${KANJI}])お(${verbStarters})`,
      "g",
    );

    for (const match of text.matchAll(re)) {
      if (match.index === undefined) continue;
      const from = match.index + match[1].length; // position of お

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Particle を should be written as を, not お`,
        messageJa: `現代仮名遣いに基づき、助詞の「を」は「を」と書きます（「お」は使いません）`,
        from,
        to: from + 1,
        originalText: "お",
        reference: GK_REF,
        fix: {
          label: "Replace お with を",
          labelJa: "「お」を「を」に修正",
          replacement: "を",
        },
      });
    }

    return issues;
  }
}

// ─── Rule: Particle は ─────────────────────────────────────────────

/**
 * ParticleHaRule — Detects mistaken use of わ instead of particle は.
 *
 * Strategy: Look for known pronoun/demonstrative + わ patterns,
 * common greeting misspellings, and [kanji]わ[punctuation].
 */
class ParticleHaRule extends AbstractL1Rule {
  constructor() {
    super(findRuleMeta("rule_GK_2_2_particle_ha"), {
      id: "gk-particle-ha",
      name: "Particle は usage",
      nameJa: "助詞「は」の表記",
      description: "Detects incorrect use of わ instead of particle は",
      descriptionJa: "助詞の「は」を「わ」と書いている箇所を検出します",
      defaultConfig: {
        enabled: true,
        severity: "error",
      },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];
    const issues: LintIssue[] = [];

    // Check pronoun/demonstrative + わ patterns and greeting misspellings
    const pronounPatterns = [
      /(?:わたし|わたくし|あたし|あたくし)わ/g,
      /(?:これ|それ|あれ|どれ|ここ|そこ|あそこ|どこ)わ/g,
      /こんにちわ/g,
      /こんばんわ/g,
    ];

    for (const re of pronounPatterns) {
      for (const match of text.matchAll(re)) {
        if (match.index === undefined) continue;
        const fullMatch = match[0];
        // The わ is the last character
        const from = match.index + fullMatch.length - 1;
        const correctForm = fullMatch.slice(0, -1) + "は";

        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Particle は should be written as は, not わ: "${fullMatch}" → "${correctForm}"`,
          messageJa: `現代仮名遣いに基づき、「${fullMatch}」は「${correctForm}」と書きます`,
          from,
          to: from + 1,
          originalText: "わ",
          reference: GK_REF,
          fix: {
            label: "Replace わ with は",
            labelJa: "「わ」を「は」に修正",
            replacement: "は",
          },
        });
      }
    }

    // Check [kanji]わ[punctuation] pattern
    const kanjiWaRe = new RegExp(`([${KANJI}])わ([、。？！])`, "g");
    for (const match of text.matchAll(kanjiWaRe)) {
      if (match.index === undefined) continue;
      const from = match.index + match[1].length;
      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Particle は should be written as は, not わ`,
        messageJa: `現代仮名遣いに基づき、助詞の「は」は「は」と書きます（「わ」は使いません）`,
        from,
        to: from + 1,
        originalText: "わ",
        reference: GK_REF,
        fix: {
          label: "Replace わ with は",
          labelJa: "「わ」を「は」に修正",
          replacement: "は",
        },
      });
    }

    return issues;
  }
}

// ─── Rule: Particle へ ─────────────────────────────────────────────

/**
 * ParticleHeRule — Detects mistaken use of え instead of particle へ.
 *
 * Strategy: Look for [kanji/katakana]え[directional verb kanji] patterns.
 * E.g., 故郷え帰る → 故郷へ帰る, 東京え行く → 東京へ行く.
 */
class ParticleHeRule extends AbstractL1Rule {
  constructor() {
    super(findRuleMeta("rule_GK_2_3_particle_he"), {
      id: "gk-particle-he",
      name: "Particle へ usage",
      nameJa: "助詞「へ」の表記",
      description: "Detects incorrect use of え instead of particle へ",
      descriptionJa: "助詞の「へ」を「え」と書いている箇所を検出します",
      defaultConfig: {
        enabled: true,
        severity: "error",
      },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];
    const issues: LintIssue[] = [];

    // Pattern: [kanji or katakana]え[directional verb kanji]
    const dirVerbs = "行|帰|向|来|戻|送|届|進|走|飛|渡|通|逃|移";
    const re = new RegExp(`([${KANJI}${KATAKANA}])え(${dirVerbs})`, "g");

    for (const match of text.matchAll(re)) {
      if (match.index === undefined) continue;
      const from = match.index + match[1].length; // position of え

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Particle へ should be written as へ, not え`,
        messageJa: `現代仮名遣いに基づき、助詞の「へ」は「へ」と書きます（「え」は使いません）`,
        from,
        to: from + 1,
        originalText: "え",
        reference: GK_REF,
        fix: {
          label: "Replace え with へ",
          labelJa: "「え」を「へ」に修正",
          replacement: "へ",
        },
      });
    }

    return issues;
  }
}

// ─── Factory function ──────────────────────────────────────────────

/**
 * Create all 現代仮名遣い L1 rules.
 * Returns 3 rules for particle usage: を, は, へ.
 */
export function createGendaiKanazukaiL1Rules(): AbstractL1Rule[] {
  return [
    new ParticleORule(),
    new ParticleHaRule(),
    new ParticleHeRule(),
  ];
}
