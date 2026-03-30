import { AbstractL1Rule } from "../../base-rule";
import { getJsonRulesByBook } from "../../rule-loader";
import type { JsonRuleMeta, LintIssue, LintRuleConfig, LintReference } from "../../types";

const BOOK_TITLE = "現代仮名遣い";

const GK_REFERENCE: LintReference = {
  standard: "現代仮名遣い (1986)",
  url: "",
};

const JAPANESE_WORD = "\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Han}";

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
  rule: AbstractL1Rule,
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

class ParticleORule extends AbstractL1Rule {
  constructor() {
    super(findRuleMeta("rule_GK_2_1_particle_o"), {
      id: "gk-2-1-particle-o",
      name: "Particle o",
      nameJa: "助詞「を」",
      description: "Detects the particle を written as お",
      descriptionJa: "助詞の「を」を「お」と誤記した箇所を検出します。",
      defaultConfig: { enabled: true, severity: "error" },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) {
      return [];
    }

    const issues: LintIssue[] = [];
    const pattern = new RegExp(`([${JAPANESE_WORD}])お(?=[${JAPANESE_WORD}])`, "gu");

    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) {
        continue;
      }

      const from = match.index + match[1].length;
      issues.push(
        createIssue(
          this,
          config,
          from,
          "お",
          "を",
          "現代仮名遣いに基づき、助詞は「お」ではなく「を」と書きます。",
        ),
      );
    }

    return issues;
  }
}

class ParticleHaRule extends AbstractL1Rule {
  private readonly explicitPatterns = [
    /こんにちわ/gu,
    /こんばんわ/gu,
    /(?:私|わたし|わたくし|僕|ぼく|俺|おれ|君|きみ)わ(?=[^\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]|$)/gu,
    /(?:これ|それ|あれ|どれ|ここ|そこ|あそこ|どこ)わ(?=[^\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]|$)/gu,
  ];

  constructor() {
    super(findRuleMeta("rule_GK_2_2_particle_ha"), {
      id: "gk-2-2-particle-ha",
      name: "Particle ha",
      nameJa: "助詞「は」",
      description: "Detects the particle は written as わ",
      descriptionJa: "助詞の「は」を「わ」と誤記した箇所を検出します。",
      defaultConfig: { enabled: true, severity: "error" },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) {
      return [];
    }

    const issues: LintIssue[] = [];

    for (const pattern of this.explicitPatterns) {
      for (const match of text.matchAll(pattern)) {
        if (match.index === undefined) {
          continue;
        }

        const from = match.index + match[0].length - 1;
        issues.push(
          createIssue(
            this,
            config,
            from,
            "わ",
            "は",
            "現代仮名遣いに基づき、助詞は「わ」ではなく「は」と書きます。",
          ),
        );
      }
    }

    const pattern = new RegExp(`([${JAPANESE_WORD}])わ(?=[、。！？\\s]|$)`, "gu");
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) {
        continue;
      }

      const from = match.index + match[1].length;
      issues.push(
        createIssue(
          this,
          config,
          from,
          "わ",
          "は",
          "現代仮名遣いに基づき、助詞は「わ」ではなく「は」と書きます。",
        ),
      );
    }

    return issues;
  }
}

class ParticleHeRule extends AbstractL1Rule {
  constructor() {
    super(findRuleMeta("rule_GK_2_3_particle_he"), {
      id: "gk-2-3-particle-he",
      name: "Particle he",
      nameJa: "助詞「へ」",
      description: "Detects the particle へ written as え",
      descriptionJa: "助詞の「へ」を「え」と誤記した箇所を検出します。",
      defaultConfig: { enabled: true, severity: "error" },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) {
      return [];
    }

    const issues: LintIssue[] = [];
    const pattern = new RegExp(
      `([${JAPANESE_WORD}])え(?=(行|来|帰|向|出|入|進|移|戻|通|送|届|向か|帰っ|行っ))`,
      "gu",
    );

    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) {
        continue;
      }

      const from = match.index + match[1].length;
      issues.push(
        createIssue(
          this,
          config,
          from,
          "え",
          "へ",
          "現代仮名遣いに基づき、助詞は「え」ではなく「へ」と書きます。",
        ),
      );
    }

    return issues;
  }
}

export function createGendaiKanazukaiL1Rules(): AbstractL1Rule[] {
  return [new ParticleORule(), new ParticleHaRule(), new ParticleHeRule()];
}
