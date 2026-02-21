import type { Severity } from "./types";

/** Static metadata for lint rules displayed in settings and inspector */
export interface LintRuleMeta {
  id: string;
  nameJa: string;
  descriptionJa: string;
  /** Whether this rule supports the skipDialogue toggle. False = toggle hidden in UI. */
  supportsSkipDialogue?: boolean;
}

export const LINT_RULES_META: LintRuleMeta[] = [
  { id: "punctuation-rules", nameJa: "記号の作法", descriptionJa: "句読点・記号の使い方をチェック", supportsSkipDialogue: false },
  { id: "number-format", nameJa: "数字表記の統一", descriptionJa: "数字の表記揺れを検出", supportsSkipDialogue: true },
  { id: "joyo-kanji", nameJa: "常用漢字バリデーション", descriptionJa: "常用漢字表外の漢字を検出", supportsSkipDialogue: true },
  { id: "era-year-validator", nameJa: "元号・西暦の一致チェック", descriptionJa: "元号と西暦の対応を検証", supportsSkipDialogue: false },
  { id: "particle-no-repetition", nameJa: "助詞「の」の連続使用", descriptionJa: "1文中の「の」の多用を検出", supportsSkipDialogue: true },
  { id: "conjugation-errors", nameJa: "活用の誤り検出", descriptionJa: "ら抜き・さ入れ・い抜き言葉の検出", supportsSkipDialogue: true },
  { id: "redundant-expression", nameJa: "二重表現の検出", descriptionJa: "意味が重複している冗長な表現を検出", supportsSkipDialogue: true },
  { id: "verbose-expression", nameJa: "冗長表現の簡略化", descriptionJa: "冗長な表現を検出し簡潔な言い換えを提案", supportsSkipDialogue: true },
  { id: "sentence-ending-repetition", nameJa: "文末表現の重複", descriptionJa: "同じ文末表現が連続する箇所を検出", supportsSkipDialogue: true },
  { id: "notation-consistency", nameJa: "表記ゆれの検出", descriptionJa: "文書内の同一語彙の表記ゆれを検出", supportsSkipDialogue: true },
  { id: "correlative-expression", nameJa: "呼応表現の整合性", descriptionJa: "副詞と文末表現の対応をチェック", supportsSkipDialogue: true },
  { id: "sentence-length", nameJa: "長文の検出", descriptionJa: "設定した文字数を超える文を検出します", supportsSkipDialogue: true },
  { id: "dash-format", nameJa: "ダッシュの用法", descriptionJa: "ダッシュの誤用を検出し、正しい表記を提案します", supportsSkipDialogue: false },
  { id: "dialogue-punctuation", nameJa: "台詞の約物チェック", descriptionJa: "台詞のカギ括弧の書式エラーを検出します", supportsSkipDialogue: false },
  { id: "comma-frequency", nameJa: "読点の頻度チェック", descriptionJa: "読点が多すぎる、または少なすぎる文を検出します", supportsSkipDialogue: true },
  { id: "desu-masu-consistency", nameJa: "敬体・常体の混在検出", descriptionJa: "です・ます体と、だ・である体の混在を検出します", supportsSkipDialogue: true },
  { id: "conjunction-overuse", nameJa: "接続詞の多用検出", descriptionJa: "接続詞で始まる文が連続している箇所を検出します", supportsSkipDialogue: true },
  { id: "word-repetition", nameJa: "近接語句の反復検出", descriptionJa: "近接する文で同じ語句が繰り返し使われている箇所を検出します", supportsSkipDialogue: true },
  { id: "taigen-dome-overuse", nameJa: "体言止めの多用検出", descriptionJa: "体言止めが連続している箇所を検出します", supportsSkipDialogue: true },
  { id: "passive-overuse", nameJa: "受動態の多用検出", descriptionJa: "受動態が連続して使われている箇所を検出します", supportsSkipDialogue: true },
  { id: "counter-word-mismatch", nameJa: "助数詞の誤用検出", descriptionJa: "助数詞と数えられる対象の組み合わせの誤りを検出します", supportsSkipDialogue: true },
  { id: "adverb-form-consistency", nameJa: "副詞の漢字・ひらがな統一", descriptionJa: "副詞の漢字表記とひらがな表記の混在を検出します", supportsSkipDialogue: true },
  {
    id: "homophone-detection",
    nameJa: "同音異義語の検出",
    descriptionJa: "LLMによる文脈分析で、同音異義語の誤用を検出します",
    supportsSkipDialogue: false,
  },
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
  { id: "ai", nameJa: "AI機能", rules: ["homophone-detection"] },
];

/** Per-rule config shape used in presets and settings */
export interface LintRulePresetConfig {
  enabled: boolean;
  severity: Severity;
  skipDialogue?: boolean;
}

/** Default configs per rule (matching each rule's defaultConfig) — used as 標準モード */
export const LINT_DEFAULT_CONFIGS: Record<string, LintRulePresetConfig> = {
  "punctuation-rules": { enabled: true, severity: "warning" },
  "number-format": { enabled: true, severity: "warning", skipDialogue: true },
  "joyo-kanji": { enabled: true, severity: "info", skipDialogue: true },
  "era-year-validator": { enabled: true, severity: "warning" },
  "particle-no-repetition": { enabled: true, severity: "info", skipDialogue: true },
  "conjugation-errors": { enabled: true, severity: "warning", skipDialogue: true },
  "redundant-expression": { enabled: true, severity: "warning", skipDialogue: true },
  "verbose-expression": { enabled: true, severity: "info", skipDialogue: true },
  "sentence-ending-repetition": { enabled: true, severity: "info", skipDialogue: true },
  "notation-consistency": { enabled: true, severity: "warning", skipDialogue: true },
  "correlative-expression": { enabled: true, severity: "warning", skipDialogue: true },
  "sentence-length": { enabled: true, severity: "info", skipDialogue: true },
  "dash-format": { enabled: true, severity: "warning" },
  "dialogue-punctuation": { enabled: true, severity: "warning" },
  "comma-frequency": { enabled: true, severity: "info", skipDialogue: true },
  "desu-masu-consistency": { enabled: true, severity: "warning", skipDialogue: true },
  "conjunction-overuse": { enabled: true, severity: "info", skipDialogue: true },
  "word-repetition": { enabled: true, severity: "info", skipDialogue: true },
  "taigen-dome-overuse": { enabled: true, severity: "info", skipDialogue: true },
  "passive-overuse": { enabled: true, severity: "info", skipDialogue: true },
  "counter-word-mismatch": { enabled: true, severity: "warning" },
  "adverb-form-consistency": { enabled: true, severity: "info", skipDialogue: true },
  "homophone-detection": { enabled: true, severity: "warning" },
};

/** Preset configuration for one-shot application */
export interface LintPreset {
  nameJa: string;
  configs: Record<string, LintRulePresetConfig>;
}

export const LINT_PRESETS: Record<string, LintPreset> = {
  relaxed: {
    nameJa: "寛容モード",
    configs: {
      "punctuation-rules": { enabled: true, severity: "info" },
      "number-format": { enabled: false, severity: "info", skipDialogue: true },
      "joyo-kanji": { enabled: false, severity: "info", skipDialogue: true },
      "era-year-validator": { enabled: false, severity: "info" },
      "particle-no-repetition": { enabled: false, severity: "info", skipDialogue: true },
      "conjugation-errors": { enabled: true, severity: "warning", skipDialogue: true },
      "redundant-expression": { enabled: true, severity: "info", skipDialogue: true },
      "verbose-expression": { enabled: false, severity: "info", skipDialogue: true },
      "sentence-ending-repetition": { enabled: false, severity: "info", skipDialogue: true },
      "notation-consistency": { enabled: false, severity: "info", skipDialogue: true },
      "correlative-expression": { enabled: true, severity: "info", skipDialogue: true },
      "sentence-length": { enabled: false, severity: "info", skipDialogue: true },
      "dash-format": { enabled: false, severity: "info" },
      "dialogue-punctuation": { enabled: true, severity: "warning" },
      "comma-frequency": { enabled: false, severity: "info", skipDialogue: true },
      "desu-masu-consistency": { enabled: false, severity: "info", skipDialogue: true },
      "conjunction-overuse": { enabled: false, severity: "info", skipDialogue: true },
      "word-repetition": { enabled: false, severity: "info", skipDialogue: true },
      "taigen-dome-overuse": { enabled: false, severity: "info", skipDialogue: true },
      "passive-overuse": { enabled: false, severity: "info", skipDialogue: true },
      "counter-word-mismatch": { enabled: false, severity: "info", skipDialogue: true },
      "adverb-form-consistency": { enabled: false, severity: "info", skipDialogue: true },
      "homophone-detection": { enabled: false, severity: "info" },
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
      "sentence-ending-repetition": { enabled: true, severity: "warning", skipDialogue: true },
      "notation-consistency": { enabled: true, severity: "error" },
      "correlative-expression": { enabled: true, severity: "error" },
      "sentence-length": { enabled: true, severity: "warning" },
      "dash-format": { enabled: true, severity: "error" },
      "dialogue-punctuation": { enabled: true, severity: "error" },
      "comma-frequency": { enabled: true, severity: "warning" },
      "desu-masu-consistency": { enabled: true, severity: "error", skipDialogue: true },
      "conjunction-overuse": { enabled: true, severity: "warning", skipDialogue: true },
      "word-repetition": { enabled: true, severity: "warning" },
      "taigen-dome-overuse": { enabled: true, severity: "warning", skipDialogue: true },
      "passive-overuse": { enabled: true, severity: "warning", skipDialogue: true },
      "counter-word-mismatch": { enabled: true, severity: "error" },
      "adverb-form-consistency": { enabled: true, severity: "warning" },
      "homophone-detection": { enabled: true, severity: "error" },
    },
  },
  novel: {
    nameJa: "小説モード",
    configs: {
      "punctuation-rules": { enabled: true, severity: "warning" },
      "number-format": { enabled: false, severity: "info", skipDialogue: true },
      "joyo-kanji": { enabled: false, severity: "info", skipDialogue: true },
      "era-year-validator": { enabled: true, severity: "info" },
      "particle-no-repetition": { enabled: true, severity: "info", skipDialogue: true },
      "conjugation-errors": { enabled: true, severity: "warning", skipDialogue: true },
      "redundant-expression": { enabled: true, severity: "warning", skipDialogue: true },
      "verbose-expression": { enabled: true, severity: "info", skipDialogue: true },
      "sentence-ending-repetition": { enabled: true, severity: "warning", skipDialogue: true },
      "notation-consistency": { enabled: true, severity: "warning", skipDialogue: true },
      "correlative-expression": { enabled: true, severity: "warning", skipDialogue: true },
      "sentence-length": { enabled: true, severity: "info", skipDialogue: true },
      "dash-format": { enabled: true, severity: "warning" },
      "dialogue-punctuation": { enabled: true, severity: "warning" },
      "comma-frequency": { enabled: true, severity: "info", skipDialogue: true },
      "desu-masu-consistency": { enabled: false, severity: "info", skipDialogue: true },
      "conjunction-overuse": { enabled: true, severity: "info", skipDialogue: true },
      "word-repetition": { enabled: true, severity: "info", skipDialogue: true },
      "taigen-dome-overuse": { enabled: true, severity: "info", skipDialogue: true },
      "passive-overuse": { enabled: true, severity: "info", skipDialogue: true },
      "counter-word-mismatch": { enabled: true, severity: "warning", skipDialogue: true },
      "adverb-form-consistency": { enabled: true, severity: "info", skipDialogue: true },
      "homophone-detection": { enabled: true, severity: "warning" },
    },
  },
  // The official preset intentionally omits skipDialogue on most rules because
  // government documents rarely contain dialogue; adding the toggle would be
  // misleading for users of this preset.
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
      "homophone-detection": { enabled: true, severity: "warning" },
    },
  },
};
