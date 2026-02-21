import type { Severity } from "./types";

/** Static metadata for lint rules displayed in settings and inspector */
export interface LintRuleMeta {
  id: string;
  nameJa: string;
  descriptionJa: string;
}

export const LINT_RULES_META: LintRuleMeta[] = [
  { id: "punctuation-rules", nameJa: "記号の作法", descriptionJa: "句読点・記号の使い方をチェック" },
  { id: "number-format", nameJa: "数字表記の統一", descriptionJa: "数字の表記揺れを検出" },
  { id: "joyo-kanji", nameJa: "常用漢字バリデーション", descriptionJa: "常用漢字表外の漢字を検出" },
  { id: "era-year-validator", nameJa: "元号・西暦の一致チェック", descriptionJa: "元号と西暦の対応を検証" },
  { id: "particle-no-repetition", nameJa: "助詞「の」の連続使用", descriptionJa: "1文中の「の」の多用を検出" },
  { id: "conjugation-errors", nameJa: "活用の誤り検出", descriptionJa: "ら抜き・さ入れ・い抜き言葉の検出" },
  { id: "redundant-expression", nameJa: "二重表現の検出", descriptionJa: "意味が重複している冗長な表現を検出" },
  { id: "verbose-expression", nameJa: "冗長表現の簡略化", descriptionJa: "冗長な表現を検出し簡潔な言い換えを提案" },
  { id: "sentence-ending-repetition", nameJa: "文末表現の重複", descriptionJa: "同じ文末表現が連続する箇所を検出" },
  { id: "notation-consistency", nameJa: "表記ゆれの検出", descriptionJa: "文書内の同一語彙の表記ゆれを検出" },
  { id: "correlative-expression", nameJa: "呼応表現の整合性", descriptionJa: "副詞と文末表現の対応をチェック" },
  { id: "sentence-length", nameJa: "長文の検出", descriptionJa: "設定した文字数を超える文を検出します" },
  { id: "dash-format", nameJa: "ダッシュの用法", descriptionJa: "ダッシュの誤用を検出し、正しい表記を提案します" },
  { id: "dialogue-punctuation", nameJa: "台詞の約物チェック", descriptionJa: "台詞のカギ括弧の書式エラーを検出します" },
  { id: "comma-frequency", nameJa: "読点の頻度チェック", descriptionJa: "読点が多すぎる、または少なすぎる文を検出します" },
  { id: "desu-masu-consistency", nameJa: "敬体・常体の混在検出", descriptionJa: "です・ます体と、だ・である体の混在を検出します" },
  { id: "conjunction-overuse", nameJa: "接続詞の多用検出", descriptionJa: "接続詞で始まる文が連続している箇所を検出します" },
  { id: "word-repetition", nameJa: "近接語句の反復検出", descriptionJa: "近接する文で同じ語句が繰り返し使われている箇所を検出します" },
  { id: "taigen-dome-overuse", nameJa: "体言止めの多用検出", descriptionJa: "体言止めが連続している箇所を検出します" },
  { id: "passive-overuse", nameJa: "受動態の多用検出", descriptionJa: "受動態が連続して使われている箇所を検出します" },
  { id: "counter-word-mismatch", nameJa: "助数詞の誤用検出", descriptionJa: "助数詞と数えられる対象の組み合わせの誤りを検出します" },
  { id: "adverb-form-consistency", nameJa: "副詞の漢字・ひらがな統一", descriptionJa: "副詞の漢字表記とひらがな表記の混在を検出します" },
];

/** Category grouping for rule display */
export interface LintRuleCategory {
  id: string;
  nameJa: string;
  rules: string[];
}

export const LINT_RULE_CATEGORIES: LintRuleCategory[] = [
  {
    id: "notation",
    nameJa: "約物・表記",
    rules: ["punctuation-rules", "number-format", "notation-consistency", "dash-format", "dialogue-punctuation", "comma-frequency"],
  },
  {
    id: "kanji",
    nameJa: "漢字・用字",
    rules: ["joyo-kanji", "era-year-validator", "adverb-form-consistency"],
  },
  {
    id: "grammar",
    nameJa: "文法・語法",
    rules: ["particle-no-repetition", "conjugation-errors", "correlative-expression", "counter-word-mismatch", "passive-overuse"],
  },
  {
    id: "style",
    nameJa: "文体",
    rules: ["redundant-expression", "verbose-expression", "sentence-ending-repetition", "sentence-length", "desu-masu-consistency", "conjunction-overuse", "word-repetition", "taigen-dome-overuse"],
  },
];

/** Default configs per rule (matching each rule's defaultConfig) */
export const LINT_DEFAULT_CONFIGS: Record<string, { enabled: boolean; severity: Severity }> = {
  "punctuation-rules": { enabled: true, severity: "warning" },
  "number-format": { enabled: true, severity: "warning" },
  "joyo-kanji": { enabled: true, severity: "info" },
  "era-year-validator": { enabled: true, severity: "warning" },
  "particle-no-repetition": { enabled: true, severity: "info" },
  "conjugation-errors": { enabled: true, severity: "warning" },
  "redundant-expression": { enabled: true, severity: "warning" },
  "verbose-expression": { enabled: true, severity: "info" },
  "sentence-ending-repetition": { enabled: true, severity: "info" },
  "notation-consistency": { enabled: true, severity: "warning" },
  "correlative-expression": { enabled: true, severity: "warning" },
  "sentence-length": { enabled: true, severity: "info" },
  "dash-format": { enabled: true, severity: "warning" },
  "dialogue-punctuation": { enabled: true, severity: "warning" },
  "comma-frequency": { enabled: true, severity: "info" },
  "desu-masu-consistency": { enabled: true, severity: "warning" },
  "conjunction-overuse": { enabled: true, severity: "info" },
  "word-repetition": { enabled: true, severity: "info" },
  "taigen-dome-overuse": { enabled: true, severity: "info" },
  "passive-overuse": { enabled: true, severity: "info" },
  "counter-word-mismatch": { enabled: true, severity: "warning" },
  "adverb-form-consistency": { enabled: true, severity: "info" },
};

/** Preset configuration for one-shot application */
export interface LintPreset {
  nameJa: string;
  configs: Record<string, { enabled: boolean; severity: Severity }>;
}

export const LINT_PRESETS: Record<string, LintPreset> = {
  relaxed: {
    nameJa: "寛容モード",
    configs: {
      "punctuation-rules": { enabled: true, severity: "info" },
      "number-format": { enabled: false, severity: "info" },
      "joyo-kanji": { enabled: false, severity: "info" },
      "era-year-validator": { enabled: false, severity: "info" },
      "particle-no-repetition": { enabled: false, severity: "info" },
      "conjugation-errors": { enabled: true, severity: "warning" },
      "redundant-expression": { enabled: true, severity: "info" },
      "verbose-expression": { enabled: false, severity: "info" },
      "sentence-ending-repetition": { enabled: false, severity: "info" },
      "notation-consistency": { enabled: false, severity: "info" },
      "correlative-expression": { enabled: true, severity: "info" },
      "sentence-length": { enabled: false, severity: "info" },
      "dash-format": { enabled: false, severity: "info" },
      "dialogue-punctuation": { enabled: true, severity: "warning" },
      "comma-frequency": { enabled: false, severity: "info" },
      "desu-masu-consistency": { enabled: false, severity: "info" },
      "conjunction-overuse": { enabled: false, severity: "info" },
      "word-repetition": { enabled: false, severity: "info" },
      "taigen-dome-overuse": { enabled: false, severity: "info" },
      "passive-overuse": { enabled: false, severity: "info" },
      "counter-word-mismatch": { enabled: false, severity: "info" },
      "adverb-form-consistency": { enabled: false, severity: "info" },
    },
  },
  standard: {
    nameJa: "標準モード",
    configs: { ...LINT_DEFAULT_CONFIGS },
  },
  strict: {
    nameJa: "厳格モード",
    configs: {
      "punctuation-rules": { enabled: true, severity: "error" },
      "number-format": { enabled: true, severity: "error" },
      "joyo-kanji": { enabled: true, severity: "warning" },
      "era-year-validator": { enabled: true, severity: "error" },
      "particle-no-repetition": { enabled: true, severity: "warning" },
      "conjugation-errors": { enabled: true, severity: "error" },
      "redundant-expression": { enabled: true, severity: "error" },
      "verbose-expression": { enabled: true, severity: "warning" },
      "sentence-ending-repetition": { enabled: true, severity: "warning" },
      "notation-consistency": { enabled: true, severity: "error" },
      "correlative-expression": { enabled: true, severity: "error" },
      "sentence-length": { enabled: true, severity: "warning" },
      "dash-format": { enabled: true, severity: "error" },
      "dialogue-punctuation": { enabled: true, severity: "error" },
      "comma-frequency": { enabled: true, severity: "warning" },
      "desu-masu-consistency": { enabled: true, severity: "error" },
      "conjunction-overuse": { enabled: true, severity: "warning" },
      "word-repetition": { enabled: true, severity: "warning" },
      "taigen-dome-overuse": { enabled: true, severity: "warning" },
      "passive-overuse": { enabled: true, severity: "warning" },
      "counter-word-mismatch": { enabled: true, severity: "error" },
      "adverb-form-consistency": { enabled: true, severity: "warning" },
    },
  },
  novel: {
    nameJa: "小説モード",
    configs: {
      "punctuation-rules": { enabled: true, severity: "warning" },
      "number-format": { enabled: false, severity: "info" },
      "joyo-kanji": { enabled: false, severity: "info" },
      "era-year-validator": { enabled: true, severity: "info" },
      "particle-no-repetition": { enabled: true, severity: "info" },
      "conjugation-errors": { enabled: true, severity: "warning" },
      "redundant-expression": { enabled: true, severity: "warning" },
      "verbose-expression": { enabled: true, severity: "info" },
      "sentence-ending-repetition": { enabled: true, severity: "warning" },
      "notation-consistency": { enabled: true, severity: "warning" },
      "correlative-expression": { enabled: true, severity: "warning" },
      "sentence-length": { enabled: true, severity: "info" },
      "dash-format": { enabled: true, severity: "warning" },
      "dialogue-punctuation": { enabled: true, severity: "warning" },
      "comma-frequency": { enabled: true, severity: "info" },
      "desu-masu-consistency": { enabled: false, severity: "info" },
      "conjunction-overuse": { enabled: true, severity: "info" },
      "word-repetition": { enabled: true, severity: "info" },
      "taigen-dome-overuse": { enabled: true, severity: "info" },
      "passive-overuse": { enabled: true, severity: "info" },
      "counter-word-mismatch": { enabled: true, severity: "warning" },
      "adverb-form-consistency": { enabled: true, severity: "info" },
    },
  },
  official: {
    nameJa: "公用文モード",
    configs: {
      "punctuation-rules": { enabled: true, severity: "error" },
      "number-format": { enabled: true, severity: "error" },
      "joyo-kanji": { enabled: true, severity: "warning" },
      "era-year-validator": { enabled: true, severity: "error" },
      "particle-no-repetition": { enabled: true, severity: "warning" },
      "conjugation-errors": { enabled: true, severity: "error" },
      "redundant-expression": { enabled: true, severity: "error" },
      "verbose-expression": { enabled: true, severity: "warning" },
      "sentence-ending-repetition": { enabled: true, severity: "info" },
      "notation-consistency": { enabled: true, severity: "error" },
      "correlative-expression": { enabled: true, severity: "error" },
      "sentence-length": { enabled: true, severity: "warning" },
      "dash-format": { enabled: true, severity: "error" },
      "dialogue-punctuation": { enabled: true, severity: "warning" },
      "comma-frequency": { enabled: true, severity: "warning" },
      "desu-masu-consistency": { enabled: true, severity: "error" },
      "conjunction-overuse": { enabled: true, severity: "warning" },
      "word-repetition": { enabled: true, severity: "info" },
      "taigen-dome-overuse": { enabled: true, severity: "info" },
      "passive-overuse": { enabled: true, severity: "warning" },
      "counter-word-mismatch": { enabled: true, severity: "error" },
      "adverb-form-consistency": { enabled: true, severity: "warning" },
    },
  },
};
