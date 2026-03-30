import { AbstractL1Rule } from "../../base-rule";
import { getJsonRulesByBook } from "../../rule-loader";
import type { JsonRuleMeta, LintIssue, LintRuleConfig, LintReference } from "../../types";

const BOOK_TITLE = "原稿編集 第2版";

const REFERENCE: LintReference = {
  standard: "日本語表記ルールブック 第2版",
  url: "",
};

const OLD_TO_NEW_KANJI: ReadonlyMap<string, string> = new Map([
  ["榮", "栄"], ["衞", "衛"], ["曉", "暁"], ["嶋", "島"], ["盃", "杯"], ["冨", "富"],
  ["國", "国"], ["學", "学"], ["會", "会"], ["區", "区"], ["廳", "庁"], ["體", "体"],
  ["舊", "旧"], ["號", "号"], ["實", "実"], ["寫", "写"], ["將", "将"], ["專", "専"],
  ["戰", "戦"], ["經", "経"], ["齊", "斉"], ["藝", "芸"], ["勞", "労"], ["靈", "霊"],
  ["聲", "声"], ["寶", "宝"], ["鐵", "鉄"], ["關", "関"], ["驛", "駅"], ["歷", "歴"],
  ["鹽", "塩"], ["藥", "薬"], ["權", "権"], ["齒", "歯"], ["賣", "売"], ["圓", "円"],
  ["點", "点"], ["飮", "飲"], ["佛", "仏"], ["邊", "辺"], ["假", "仮"], ["價", "価"],
  ["單", "単"], ["氣", "気"], ["眞", "真"], ["傳", "伝"], ["豐", "豊"], ["發", "発"],
  ["辯", "弁"], ["瓣", "弁"], ["辨", "弁"], ["辮", "弁"], ["證", "証"], ["顯", "顕"],
  ["樂", "楽"], ["繪", "絵"], ["繩", "縄"], ["讀", "読"], ["萬", "万"], ["變", "変"],
  ["處", "処"], ["獨", "独"], ["惡", "悪"], ["壓", "圧"], ["圍", "囲"], ["穩", "穏"],
  ["殼", "殻"], ["卷", "巻"], ["嚴", "厳"], ["險", "険"], ["檢", "検"], ["獻", "献"],
  ["廣", "広"], ["濟", "済"], ["雜", "雑"], ["殘", "残"], ["絲", "糸"], ["濕", "湿"],
  ["從", "従"], ["縱", "縦"], ["燒", "焼"], ["條", "条"], ["淨", "浄"], ["劍", "剣"],
  ["壯", "壮"], ["爭", "争"], ["藏", "蔵"], ["屬", "属"], ["對", "対"], ["擇", "択"],
  ["擔", "担"], ["斷", "断"], ["遲", "遅"], ["晝", "昼"], ["聽", "聴"], ["遞", "逓"],
  ["轉", "転"], ["當", "当"], ["屆", "届"], ["腦", "脳"], ["廢", "廃"], ["麥", "麦"],
  ["拂", "払"], ["竝", "並"], ["餠", "餅"], ["禮", "礼"], ["爐", "炉"], ["灣", "湾"],
  ["惠", "恵"], ["攝", "摂"], ["增", "増"],
]);

const HIRAGANA_TO_KATAKANA: ReadonlyArray<[string, string]> = [
  ["わんわん", "ワンワン"],
  ["にゃーにゃー", "ニャーニャー"],
  ["がたがた", "ガタガタ"],
  ["ばたばた", "バタバタ"],
  ["ごろごろ", "ゴロゴロ"],
  ["ぴかぴか", "ピカピカ"],
  ["ぎらぎら", "ギラギラ"],
  ["どんどん", "ドンドン"],
  ["ばんばん", "バンバン"],
  ["ぱちぱち", "パチパチ"],
  ["すきゃなー", "スキャナー"],
  ["こんぴゅーたー", "コンピューター"],
  ["ぱそこん", "パソコン"],
  ["てれび", "テレビ"],
  ["らじお", "ラジオ"],
  ["たばこ", "タバコ"],
  ["えねるぎー", "エネルギー"],
  ["あるばいと", "アルバイト"],
];

const MISSING_LONG_VOWELS: ReadonlyArray<[string, string]> = [
  ["スキャナ", "スキャナー"],
  ["コンピュータ", "コンピューター"],
  ["フォルダ", "フォルダー"],
  ["プリンタ", "プリンター"],
  ["サーバ", "サーバー"],
  ["ブラウザ", "ブラウザー"],
  ["ドライバ", "ドライバー"],
  ["マネージャ", "マネージャー"],
  ["プレーヤ", "プレーヤー"],
  ["メモリ", "メモリー"],
  ["カテゴリ", "カテゴリー"],
  ["エネルギ", "エネルギー"],
  ["タイマ", "タイマー"],
  ["モニタ", "モニター"],
  ["パラメタ", "パラメーター"],
  ["ユーザ", "ユーザー"],
  ["センサ", "センサー"],
  ["ルータ", "ルーター"],
];

const KANJI_NUMBERS: ReadonlyArray<[string, string]> = [
  ["一", "1"],
  ["二", "2"],
  ["三", "3"],
  ["四", "4"],
  ["五", "5"],
  ["六", "6"],
  ["七", "7"],
  ["八", "8"],
  ["九", "9"],
  ["〇", "0"],
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

function createIssue(
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

class VerticalNumbersRule extends AbstractL1Rule {
  constructor() {
    super(findRuleMeta("rule_ME2_11_vertical_numbers"), {
      id: "me2-11-vertical-numbers",
      name: "Vertical numbers",
      nameJa: "縦組の数字",
      description: "Detects Arabic numerals that should be written with kanji in vertical layout",
      descriptionJa: "縦組で漢数字に寄せるべき算用数字を検出します。",
      defaultConfig: { enabled: true, severity: "info" },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) {
      return [];
    }

    const issues: LintIssue[] = [];
    const pattern = /\b[0-9]{1,2}\b/g;

    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) {
        continue;
      }

      const replacement = match[0]
        .split("")
        .map((digit) => KANJI_NUMBERS.find(([_, arabic]) => arabic === digit)?.[0] ?? digit)
        .join("");
      issues.push(
        createIssue(
          this,
          config,
          match.index,
          match.index + match[0].length,
          match[0],
          replacement,
          "Arabic numerals are unusual in vertical layout",
          "原稿編集 第2版に基づき、縦組では原則として漢数字を用います。",
        ),
      );
    }

    return issues;
  }
}

class HorizontalNumbersRule extends AbstractL1Rule {
  constructor() {
    super(findRuleMeta("rule_ME2_12_horizontal_numbers"), {
      id: "me2-12-horizontal-numbers",
      name: "Horizontal numbers",
      nameJa: "横組の数字",
      description: "Detects full-width digits or simple kanji numerals in horizontal layout",
      descriptionJa: "横組で算用数字に寄せるべき数字表記を検出します。",
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
        createIssue(
          this,
          config,
          match.index,
          match.index + match[0].length,
          match[0],
          replacement,
          "Use half-width Arabic numerals in horizontal layout",
          "原稿編集 第2版に基づき、横組では原則として算用数字を用います。",
        ),
      );
    }

    for (const [kanji, arabic] of KANJI_NUMBERS) {
      const pattern = new RegExp(`${escapeRegex(kanji)}(?=(年|月|日|人|円|個|冊|台|件))`, "g");
      for (const match of text.matchAll(pattern)) {
        if (match.index === undefined) {
          continue;
        }

        issues.push(
          createIssue(
            this,
            config,
            match.index,
            match.index + kanji.length,
            kanji,
            arabic,
            "Use Arabic numerals in horizontal layout",
            "原稿編集 第2版に基づき、横組では原則として算用数字を用います。",
          ),
        );
      }
    }

    return issues;
  }
}

class UnitSymbolsRule extends AbstractL1Rule {
  private readonly katakanaUnits = new Map([
    ["km", "キロメートル"],
    ["m", "メートル"],
    ["cm", "センチメートル"],
    ["mm", "ミリメートル"],
    ["kg", "キログラム"],
    ["g", "グラム"],
    ["L", "リットル"],
  ]);

  constructor() {
    super(findRuleMeta("rule_ME2_13_unit_symbols"), {
      id: "me2-13-unit-symbols",
      name: "Unit symbols",
      nameJa: "単位記号",
      description: "Detects unit notation issues for manuscript layout",
      descriptionJa: "単位表記と数字の組み方の崩れを検出します。",
      defaultConfig: { enabled: true, severity: "warning" },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) {
      return [];
    }

    const issues: LintIssue[] = [];

    for (const match of text.matchAll(/\d+(?:\.\d+)?(?:km|cm|mm|kg|mg|g|mL|L|m|Hz)\b/g)) {
      if (match.index === undefined) {
        continue;
      }

      const unitMatch = match[0].match(/(?:km|cm|mm|kg|mg|g|mL|L|m|Hz)$/);
      if (!unitMatch) {
        continue;
      }

      const from = match.index + match[0].length - unitMatch[0].length;
      issues.push(
        createIssue(
          this,
          config,
          from,
          match.index + match[0].length,
          unitMatch[0],
          ` ${unitMatch[0]}`,
          "Insert spacing before Latin unit symbols",
          "原稿編集 第2版に基づき、欧字の単位記号を使う場合は数値との間を密着させずに組みます。",
        ),
      );
    }

    for (const [unit, katakana] of this.katakanaUnits) {
      const pattern = new RegExp(`\\d+(?:\\.\\d+)? ${escapeRegex(unit)}\\b`, "g");
      for (const match of text.matchAll(pattern)) {
        if (match.index === undefined) {
          continue;
        }

        const from = match.index + match[0].length - unit.length;
        issues.push(
          createIssue(
            this,
            config,
            from,
            match.index + match[0].length,
            unit,
            katakana,
            "Use katakana unit names for vertical layout",
            "原稿編集 第2版に基づき、縦組では単位を片仮名で表すのが原則です。",
          ),
        );
      }
    }

    return issues;
  }
}

class PrePostSymbolsRule extends AbstractL1Rule {
  constructor() {
    super(findRuleMeta("rule_ME2_14_pre_post_symbols"), {
      id: "me2-14-pre-post-symbols",
      name: "Pre/post symbols",
      nameJa: "前置・後置記号",
      description: "Detects spaces around currency and percentage symbols",
      descriptionJa: "通貨記号や百分率記号の前後に入った不要なスペースを検出します。",
      defaultConfig: { enabled: true, severity: "warning" },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) {
      return [];
    }

    const issues: LintIssue[] = [];

    for (const match of text.matchAll(/[¥$]\s+\d/g)) {
      if (match.index === undefined) {
        continue;
      }

      const from = match.index + 1;
      issues.push(
        createIssue(
          this,
          config,
          from,
          from + match[0].length - 2,
          match[0].slice(1, -1),
          "",
          "Remove spaces after currency symbols",
          "原稿編集 第2版に基づき、前置記号と数字の間にスペースを入れません。",
        ),
      );
    }

    for (const match of text.matchAll(/\d\s+(?:%|‰)/g)) {
      if (match.index === undefined) {
        continue;
      }

      const from = match.index + match[0].length - 2;
      issues.push(
        createIssue(
          this,
          config,
          from,
          from + 1,
          " ",
          "",
          "Remove spaces before trailing symbols",
          "原稿編集 第2版に基づき、後置記号と数字の間にスペースを入れません。",
        ),
      );
    }

    return issues;
  }
}

class PunctuationRule extends AbstractL1Rule {
  constructor() {
    super(findRuleMeta("rule_ME2_15_punctuation"), {
      id: "me2-15-punctuation",
      name: "Punctuation",
      nameJa: "句読点",
      description: "Detects clearly inconsistent punctuation marks",
      descriptionJa: "全角コンマ・全角ピリオドなど、本文で使いにくい句読点を検出します。",
      defaultConfig: { enabled: true, severity: "warning" },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) {
      return [];
    }

    const issues: LintIssue[] = [];
    const replacements = new Map([
      ["，", ","],
      ["．", "."],
    ]);

    for (const [wrong, replacement] of replacements) {
      const pattern = new RegExp(escapeRegex(wrong), "g");
      for (const match of text.matchAll(pattern)) {
        if (match.index === undefined) {
          continue;
        }

        issues.push(
          createIssue(
            this,
            config,
            match.index,
            match.index + wrong.length,
            wrong,
            replacement,
            "Avoid full-width comma and period forms in running text",
            "原稿編集 第2版に基づき、句読点セットは本文全体で統一します。",
          ),
        );
      }
    }

    return issues;
  }
}

class RepetitionSymbolsRule extends AbstractL1Rule {
  constructor() {
    super(findRuleMeta("rule_ME2_17_repetition_symbols"), {
      id: "me2-17-repetition-symbols",
      name: "Repetition symbols",
      nameJa: "くり返し符号",
      description: "Detects avoidable repetition patterns and kana iteration marks",
      descriptionJa: "くり返し符号の使い方が不自然な箇所を検出します。",
      defaultConfig: { enabled: true, severity: "info" },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) {
      return [];
    }

    const issues: LintIssue[] = [];

    for (const match of text.matchAll(/([\p{Script=Han}])\1/gu)) {
      if (match.index === undefined) {
        continue;
      }

      issues.push(
        createIssue(
          this,
          config,
          match.index,
          match.index + match[0].length,
          match[0],
          `${match[1]}々`,
          "Use the repetition mark 々 for repeated kanji",
          "原稿編集 第2版に基づき、同じ漢字が続くときは「々」を使うのが一般的です。",
        ),
      );
    }

    for (const match of text.matchAll(/[ゝゞヽヾ]/g)) {
      if (match.index === undefined) {
        continue;
      }

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: "Avoid kana iteration marks in general prose",
        messageJa: "原稿編集 第2版に基づき、かなのくり返し符号は一般書では原則として避けます。",
        from: match.index,
        to: match.index + 1,
        originalText: match[0],
        reference: {
          ...REFERENCE,
          section: this.meta.sourceReference,
        },
      });
    }

    return issues;
  }
}

class KanjiFontRule extends AbstractL1Rule {
  constructor() {
    super(findRuleMeta("rule_ME2_4_kanji_font"), {
      id: "me2-4-kanji-font",
      name: "Kanji font",
      nameJa: "通用字体",
      description: "Detects old-style kanji forms",
      descriptionJa: "旧字体を検出して通用字体を提案します。",
      defaultConfig: { enabled: true, severity: "warning" },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) {
      return [];
    }

    const issues: LintIssue[] = [];
    const pattern = new RegExp(`[${[...OLD_TO_NEW_KANJI.keys()].join("")}]`, "g");

    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) {
        continue;
      }

      const replacement = OLD_TO_NEW_KANJI.get(match[0]);
      if (!replacement) {
        continue;
      }

      issues.push(
        createIssue(
          this,
          config,
          match.index,
          match.index + 1,
          match[0],
          replacement,
          "Use the standard kanji form",
          "原稿編集 第2版に基づき、旧字体ではなく通用字体を使用します。",
        ),
      );
    }

    return issues;
  }
}

class KatakanaRule extends AbstractL1Rule {
  constructor() {
    super(findRuleMeta("rule_ME2_8_katakana"), {
      id: "me2-8-katakana",
      name: "Katakana notation",
      nameJa: "片仮名表記",
      description: "Detects loanwords and onomatopoeia written in hiragana",
      descriptionJa: "外来語や擬音語のひらがな表記を検出します。",
      defaultConfig: { enabled: true, severity: "info" },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) {
      return [];
    }

    const issues: LintIssue[] = [];

    for (const [wrong, replacement] of HIRAGANA_TO_KATAKANA) {
      const pattern = new RegExp(escapeRegex(wrong), "g");
      for (const match of text.matchAll(pattern)) {
        if (match.index === undefined) {
          continue;
        }

        issues.push(
          createIssue(
            this,
            config,
            match.index,
            match.index + wrong.length,
            wrong,
            replacement,
            "Use katakana for this word",
            "原稿編集 第2版に基づき、この語は片仮名で表記します。",
          ),
        );
      }
    }

    return issues;
  }
}

class ForeignWordsRule extends AbstractL1Rule {
  constructor() {
    super(findRuleMeta("rule_ME2_9_foreign_words"), {
      id: "me2-9-foreign-words",
      name: "Foreign word long vowels",
      nameJa: "外来語の長音",
      description: "Detects missing trailing long-vowel marks in common loanwords",
      descriptionJa: "外来語の語末長音の脱落を検出します。",
      defaultConfig: { enabled: true, severity: "warning" },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) {
      return [];
    }

    const issues: LintIssue[] = [];

    for (const [wrong, replacement] of MISSING_LONG_VOWELS) {
      const pattern = new RegExp(`${escapeRegex(wrong)}(?!ー)`, "g");
      for (const match of text.matchAll(pattern)) {
        if (match.index === undefined) {
          continue;
        }

        issues.push(
          createIssue(
            this,
            config,
            match.index,
            match.index + wrong.length,
            wrong,
            replacement,
            "Keep the trailing long-vowel mark in this loanword",
            "原稿編集 第2版に基づき、この外来語は語末の長音符号を省略しません。",
          ),
        );
      }
    }

    return issues;
  }
}

export function createManuscriptL1Rules(): AbstractL1Rule[] {
  return [
    new VerticalNumbersRule(),
    new HorizontalNumbersRule(),
    new UnitSymbolsRule(),
    new PrePostSymbolsRule(),
    new PunctuationRule(),
    new RepetitionSymbolsRule(),
    new KanjiFontRule(),
    new KatakanaRule(),
    new ForeignWordsRule(),
  ];
}
