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
    rules: ["punctuation-rules", "number-format", "notation-consistency"],
  },
  {
    id: "kanji",
    nameJa: "漢字・用字",
    rules: ["joyo-kanji", "era-year-validator"],
  },
  {
    id: "grammar",
    nameJa: "文法・語法",
    rules: ["particle-no-repetition", "conjugation-errors", "correlative-expression"],
  },
  {
    id: "style",
    nameJa: "文体",
    rules: ["redundant-expression", "verbose-expression", "sentence-ending-repetition"],
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
    },
  },
};
