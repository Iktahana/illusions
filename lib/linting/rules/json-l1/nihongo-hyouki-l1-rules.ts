import { AbstractL1Rule } from "../../base-rule";
import { getJsonRulesByBook } from "../../rule-loader";
import type { JsonRuleMeta, LintIssue, LintRuleConfig, LintReference } from "../../types";

const BOOK_TITLE = "日本語表記";

const REFERENCE: LintReference = {
  standard: "日本語表記ルールブック 第2版",
  url: "",
};

const DIZU_EXCEPTIONS: ReadonlyArray<{ wrong: string; correct: string; note: string }> = [
  { wrong: "ちじむ", correct: "ちぢむ", note: "縮む" },
  { wrong: "ちじめる", correct: "ちぢめる", note: "縮める" },
  { wrong: "ちじれる", correct: "ちぢれる", note: "縮れる" },
  { wrong: "ちじこまる", correct: "ちぢこまる", note: "縮こまる" },
  { wrong: "つずく", correct: "つづく", note: "続く" },
  { wrong: "つずける", correct: "つづける", note: "続ける" },
  { wrong: "つずり", correct: "つづり", note: "綴り" },
  { wrong: "つずる", correct: "つづる", note: "綴る" },
  { wrong: "はなじ", correct: "はなぢ", note: "鼻血" },
  { wrong: "こずかい", correct: "こづかい", note: "小遣い" },
  { wrong: "みかずき", correct: "みかづき", note: "三日月" },
  { wrong: "もとずく", correct: "もとづく", note: "基づく" },
  { wrong: "うなずく", correct: "うなづく", note: "頷く" },
  { wrong: "ちかずく", correct: "ちかづく", note: "近づく" },
  { wrong: "きずく", correct: "きづく", note: "気づく" },
  { wrong: "かたずく", correct: "かたづく", note: "片付く" },
  { wrong: "てつずき", correct: "てつづき", note: "手続き" },
  { wrong: "こころずかい", correct: "こころづかい", note: "心遣い" },
  { wrong: "こずつみ", correct: "こづつみ", note: "小包" },
  { wrong: "いちぢく", correct: "いちじく", note: "無花果" },
  { wrong: "ぢめん", correct: "じめん", note: "地面" },
  { wrong: "ぢしん", correct: "じしん", note: "地震" },
  { wrong: "ぬのぢ", correct: "ぬのじ", note: "布地" },
];

const COMPOUND_NOUNS: ReadonlyArray<[string, string]> = [
  ["取り締まり役", "取締役"],
  ["事務取り扱い", "事務取扱"],
  ["日付け", "日付"],
  ["受け付け", "受付"],
  ["受付け", "受付"],
  ["物語り", "物語"],
  ["献立て", "献立"],
  ["見積り", "見積"],
  ["見積もり", "見積"],
  ["申し込み", "申込"],
  ["申込み", "申込"],
  ["払い戻し", "払戻"],
  ["払戻し", "払戻"],
  ["差し出し人", "差出人"],
  ["振り替え", "振替"],
  ["振替え", "振替"],
  ["組み合わせ", "組合せ"],
  ["売り上げ", "売上"],
  ["売上げ", "売上"],
  ["切り捨て", "切捨"],
  ["切捨て", "切捨"],
  ["取り消し", "取消"],
  ["取消し", "取消"],
];

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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function issue(
  rule: AbstractL1Rule,
  config: LintRuleConfig,
  from: number,
  to: number,
  originalText: string,
  replacement: string,
  message: string,
  messageJa: string,
): LintIssue {
  return {
    ruleId: rule.id,
    severity: config.severity,
    message,
    messageJa,
    from,
    to,
    originalText,
    reference: {
      ...REFERENCE,
      section: rule.meta.sourceReference,
    },
    fix: {
      label: `Replace with ${replacement}`,
      labelJa: `「${replacement}」に修正`,
      replacement,
    },
  };
}

class UnitsRule extends AbstractL1Rule {
  private readonly unitCaseFixes: ReadonlyArray<[RegExp, string]> = [
    [/[Ａ-Ｚａ-ｚ]+/g, ""],
    [/\d\s+(kg|g|mg|m|cm|mm|km|s|ms|Hz|kHz|MHz|GHz|MB|GB|TB|°C)\b/g, ""],
    [/\d+(?:\.\d+)?Kg\b/g, "kg"],
    [/\d+(?:\.\d+)?KG\b/g, "kg"],
    [/\d+(?:\.\d+)?Mm\b/g, "mm"],
    [/\d+(?:\.\d+)?HZ\b/g, "Hz"],
    [/\d+(?:\.\d+)?Khz\b/g, "kHz"],
    [/\d+(?:\.\d+)?Mhz\b/g, "MHz"],
    [/\d+(?:\.\d+)?Ghz\b/g, "GHz"],
  ];

  constructor() {
    super(findRuleMeta("nihongo_hyouki_10"), {
      id: "nh-10-units",
      name: "Units",
      nameJa: "単位",
      description: "Detects unit notation issues",
      descriptionJa: "単位の英字表記や数字との間隔の問題を検出します。",
      defaultConfig: { enabled: true, severity: "warning" },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) {
      return [];
    }

    const issues: LintIssue[] = [];

    for (const match of text.matchAll(/[Ａ-Ｚａ-ｚ]+/g)) {
      if (match.index === undefined) {
        continue;
      }

      const replacement = match[0].replace(/[Ａ-Ｚａ-ｚ]/g, (char) =>
        String.fromCharCode(char.charCodeAt(0) - 0xfee0),
      );
      issues.push(
        issue(
          this,
          config,
          match.index,
          match.index + match[0].length,
          match[0],
          replacement,
          "Use half-width Latin letters for unit symbols",
          "日本語表記ルールブック 第2版に基づき、単位記号は半角英字で表記します。",
        ),
      );
    }

    for (const match of text.matchAll(
      /\d\s+(kg|g|mg|m|cm|mm|km|s|ms|Hz|kHz|MHz|GHz|MB|GB|TB|°C)\b/g,
    )) {
      if (match.index === undefined) {
        continue;
      }

      const from = match.index + match[0].search(/\s/);
      issues.push(
        issue(
          this,
          config,
          from,
          from + 1,
          " ",
          "",
          "Remove the space between the number and the unit",
          "日本語表記ルールブック 第2版に基づき、数値と単位記号の間にスペースを入れません。",
        ),
      );
    }

    for (const [pattern, replacement] of this.unitCaseFixes.slice(2)) {
      for (const match of text.matchAll(pattern)) {
        if (match.index === undefined) {
          continue;
        }

        const wrong = match[0].match(/[A-Za-z]+$/)?.[0];
        if (!wrong) {
          continue;
        }

        const from = match.index + match[0].length - wrong.length;
        issues.push(
          issue(
            this,
            config,
            from,
            match.index + match[0].length,
            wrong,
            replacement,
            "Use the correct SI unit casing",
            "日本語表記ルールブック 第2版に基づき、SI接頭辞と単位記号の大文字・小文字を正確に使い分けます。",
          ),
        );
      }
    }

    return issues;
  }
}

class SymbolsRule extends AbstractL1Rule {
  constructor() {
    super(findRuleMeta("nihongo_hyouki_11"), {
      id: "nh-11-symbols",
      name: "Symbols",
      nameJa: "記述記号",
      description: "Detects symbol notation issues in Japanese prose",
      descriptionJa: "日本語文中の記述記号の使い方の崩れを検出します。",
      defaultConfig: { enabled: true, severity: "warning" },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) {
      return [];
    }

    const issues: LintIssue[] = [];

    for (const match of text.matchAll(/"[^"\n]+"/g)) {
      if (match.index === undefined) {
        continue;
      }

      issues.push(
        issue(
          this,
          config,
          match.index,
          match.index + match[0].length,
          match[0],
          `「${match[0].slice(1, -1)}」`,
          "Use Japanese quotation marks in Japanese prose",
          "日本語表記ルールブック 第2版に基づき、日本語文中では欧文のダブルクォートではなく「」を使います。",
        ),
      );
    }

    for (const match of text.matchAll(/\.{3}|．．．/g)) {
      if (match.index === undefined) {
        continue;
      }

      issues.push(
        issue(
          this,
          config,
          match.index,
          match.index + match[0].length,
          match[0],
          "……",
          "Use a double ellipsis leader",
          "日本語表記ルールブック 第2版に基づき、省略記号は三点リーダを二つ続けて「……」とします。",
        ),
      );
    }

    for (const match of text.matchAll(/(?<!…)…(?!…)/g)) {
      if (match.index === undefined) {
        continue;
      }

      issues.push(
        issue(
          this,
          config,
          match.index,
          match.index + 1,
          "…",
          "……",
          "Use a double ellipsis leader",
          "日本語表記ルールブック 第2版に基づき、省略記号は「……」とします。",
        ),
      );
    }

    for (const match of text.matchAll(/--|(?<!-)-(?!-)/g)) {
      if (match.index === undefined) {
        continue;
      }

      issues.push(
        issue(
          this,
          config,
          match.index,
          match.index + match[0].length,
          match[0],
          "——",
          "Use a full-width double dash",
          "日本語表記ルールブック 第2版に基づき、ダッシュは全角ダッシュを二つ続けて用います。",
        ),
      );
    }

    for (const match of text.matchAll(/[ \u3000](?=[（])|(?<=[）])[ \u3000]/g)) {
      if (match.index === undefined) {
        continue;
      }

      issues.push(
        issue(
          this,
          config,
          match.index,
          match.index + 1,
          match[0],
          "",
          "Remove spaces around full-width parentheses",
          "日本語表記ルールブック 第2版に基づき、括弧の前後にスペースを入れません。",
        ),
      );
    }

    return issues;
  }
}

class JiZuDiDuExceptionsRule extends AbstractL1Rule {
  constructor() {
    super(findRuleMeta("nihongo_hyouki_6_ji_zu_di_du_exceptions"), {
      id: "nh-6-ji-zu-di-du-exceptions",
      name: "Ji/zu exceptions",
      nameJa: "じ・ず / ぢ・づの例外",
      description: "Detects exception words that require じ・ず or ぢ・づ",
      descriptionJa: "じ・ず / ぢ・づの例外語を検出します。",
      defaultConfig: { enabled: true, severity: "error" },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) {
      return [];
    }

    const issues: LintIssue[] = [];

    for (const item of DIZU_EXCEPTIONS) {
      const pattern = new RegExp(escapeRegex(item.wrong), "g");
      for (const match of text.matchAll(pattern)) {
        if (match.index === undefined) {
          continue;
        }

        issues.push(
          issue(
            this,
            config,
            match.index,
            match.index + item.wrong.length,
            item.wrong,
            item.correct,
            `Use ${item.correct} for this exception word`,
            `日本語表記ルールブック 第2版に基づき、「${item.note}」は「${item.correct}」と表記します。`,
          ),
        );
      }
    }

    return issues;
  }
}

class CompoundNounsRule extends AbstractL1Rule {
  constructor() {
    super(findRuleMeta("nihongo_hyouki_7_compound_nouns_no_okurigana"), {
      id: "nh-7-compound-nouns-no-okurigana",
      name: "Compound nouns",
      nameJa: "複合名詞の送り仮名",
      description: "Detects compound nouns whose okurigana should be omitted",
      descriptionJa: "送り仮名を付けない慣用複合名詞を検出します。",
      defaultConfig: { enabled: true, severity: "warning" },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) {
      return [];
    }

    const issues: LintIssue[] = [];

    for (const [wrong, replacement] of COMPOUND_NOUNS) {
      const pattern = new RegExp(escapeRegex(wrong), "g");
      for (const match of text.matchAll(pattern)) {
        if (match.index === undefined) {
          continue;
        }

        issues.push(
          issue(
            this,
            config,
            match.index,
            match.index + wrong.length,
            wrong,
            replacement,
            `Use the conventional compound noun form ${replacement}`,
            "日本語表記ルールブック 第2版に基づき、この複合名詞は送り仮名を省いた形で表記します。",
          ),
        );
      }
    }

    return issues;
  }
}

class NumbersRule extends AbstractL1Rule {
  constructor() {
    super(findRuleMeta("nihongo_hyouki_9"), {
      id: "nh-9-numbers",
      name: "Numbers",
      nameJa: "数字表記",
      description: "Detects full-width numeric notation in horizontal writing",
      descriptionJa: "横組みでの全角数字や全角区切り記号を検出します。",
      defaultConfig: { enabled: true, severity: "warning" },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) {
      return [];
    }

    const issues: LintIssue[] = [];

    for (const match of text.matchAll(/[０-９]+/g)) {
      if (match.index === undefined) {
        continue;
      }

      const replacement = match[0].replace(/[０-９]/g, (char) =>
        String.fromCharCode(char.charCodeAt(0) - 0xfee0),
      );
      issues.push(
        issue(
          this,
          config,
          match.index,
          match.index + match[0].length,
          match[0],
          replacement,
          "Use half-width Arabic numerals",
          "日本語表記ルールブック 第2版に基づき、横組みでは算用数字を半角で表記します。",
        ),
      );
    }

    for (const match of text.matchAll(/\d[，．]\d/g)) {
      if (match.index === undefined) {
        continue;
      }

      const symbol = match[0][1];
      const replacement = symbol === "，" ? "," : ".";
      const from = match.index + 1;
      issues.push(
        issue(
          this,
          config,
          from,
          from + 1,
          symbol,
          replacement,
          "Use half-width punctuation in numeric notation",
          "日本語表記ルールブック 第2版に基づき、数値の区切り記号は半角で表記します。",
        ),
      );
    }

    return issues;
  }
}

export function createNihongoHyoukiL1Rules(): AbstractL1Rule[] {
  return [
    new UnitsRule(),
    new SymbolsRule(),
    new JiZuDiDuExceptionsRule(),
    new CompoundNounsRule(),
    new NumbersRule(),
  ];
}
