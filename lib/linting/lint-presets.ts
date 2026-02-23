import type { Severity } from "./types";
import type { GuidelineId } from "./correction-config";

/** Static metadata for lint rules displayed in settings and inspector */
export interface LintRuleMeta {
  id: string;
  nameJa: string;
  descriptionJa: string;
  /** Whether this rule supports the skipDialogue toggle. False = toggle hidden in UI. */
  supportsSkipDialogue?: boolean;
  /** The guideline this rule belongs to. undefined = universal (always runs). */
  guidelineId?: GuidelineId;
}

export const LINT_RULES_META: LintRuleMeta[] = [
  // ---------------------------------------------------------------------------
  // Existing rules (pre-#438)
  // ---------------------------------------------------------------------------
  { id: "punctuation-rules", nameJa: "記号の作法", descriptionJa: "句読点・記号の使い方をチェック", guidelineId: "jis-x-4051" },
  { id: "number-format", nameJa: "数字表記の統一", descriptionJa: "数字の表記揺れを検出", guidelineId: "koyo-bun-2022" },
  { id: "joyo-kanji", nameJa: "常用漢字バリデーション", descriptionJa: "常用漢字表外の漢字を検出", guidelineId: "joyo-kanji-2010" },
  { id: "era-year-validator", nameJa: "元号・西暦の一致チェック", descriptionJa: "元号と西暦の対応を検証", guidelineId: "koyo-bun-2022" },
  { id: "particle-no-repetition", nameJa: "助詞「の」の連続使用", descriptionJa: "1文中の「の」の多用を検出" },
  { id: "conjugation-errors", nameJa: "活用の誤り検出", descriptionJa: "ら抜き・さ入れ・い抜き言葉の検出" },
  { id: "redundant-expression", nameJa: "二重表現の検出", descriptionJa: "意味が重複している冗長な表現を検出" },
  { id: "verbose-expression", nameJa: "冗長表現の簡略化", descriptionJa: "冗長な表現を検出し簡潔な言い換えを提案" },
  { id: "sentence-ending-repetition", nameJa: "文末表現の重複", descriptionJa: "同じ文末表現が連続する箇所を検出" },
  { id: "notation-consistency", nameJa: "表記ゆれの検出", descriptionJa: "文書内の同一語彙の表記ゆれを検出", guidelineId: "novel-manuscript" },
  { id: "correlative-expression", nameJa: "呼応表現の整合性", descriptionJa: "副詞と文末表現の対応をチェック", guidelineId: "koyo-bun-2022" },
  { id: "sentence-length", nameJa: "長文の検出", descriptionJa: "設定した文字数を超える文を検出します" },
  { id: "dash-format", nameJa: "ダッシュの用法", descriptionJa: "ダッシュの誤用を検出し、正しい表記を提案します", guidelineId: "jis-x-4051" },
  { id: "dialogue-punctuation", nameJa: "台詞の約物チェック", descriptionJa: "台詞のカギ括弧の書式エラーを検出します", guidelineId: "jis-x-4051" },
  { id: "comma-frequency", nameJa: "読点の頻度チェック", descriptionJa: "読点が多すぎる、または少なすぎる文を検出します", guidelineId: "novel-manuscript" },
  { id: "desu-masu-consistency", nameJa: "敬体・常体の混在検出", descriptionJa: "です・ます体と、だ・である体の混在を検出します" },
  { id: "conjunction-overuse", nameJa: "接続詞の多用検出", descriptionJa: "接続詞で始まる文が連続している箇所を検出します" },
  { id: "word-repetition", nameJa: "近接語句の反復検出", descriptionJa: "近接する文で同じ語句が繰り返し使われている箇所を検出します" },
  { id: "taigen-dome-overuse", nameJa: "体言止めの多用検出", descriptionJa: "体言止めが連続している箇所を検出します" },
  { id: "passive-overuse", nameJa: "受動態の多用検出", descriptionJa: "受動態が連続して使われている箇所を検出します" },
  { id: "counter-word-mismatch", nameJa: "助数詞の誤用検出", descriptionJa: "助数詞と数えられる対象の組み合わせの誤りを検出します" },
  { id: "adverb-form-consistency", nameJa: "副詞の漢字・ひらがな統一", descriptionJa: "副詞の漢字表記とひらがな表記の混在を検出します", guidelineId: "novel-manuscript" },
  {
    id: "homophone-detection",
    nameJa: "同音異義語の検出",
    descriptionJa: "LLMによる文脈分析で、同音異義語の誤用を検出します",
  },

  // ---------------------------------------------------------------------------
  // #438 rules: okurigana-1973
  // ---------------------------------------------------------------------------
  { id: "verb-okurigana-strict", nameJa: "動詞の送り仮名「本則」", descriptionJa: "送り仮名の付け方（内閣告示、1973）の本則に基づき、動詞の送り仮名の誤りを検出します", guidelineId: "okurigana-1973" },
  { id: "fixed-okurigana-noun", nameJa: "慣用固定名詞の送り仮名省略", descriptionJa: "公用文では慣用が固定した名詞の送り仮名を省略します（送り仮名の付け方 \u00A7許容）", guidelineId: "okurigana-1973" },
  { id: "compound-noun-okurigana-omission", nameJa: "複合名詞の送り仮名省略", descriptionJa: "公用文では複合名詞の後半要素の送り仮名を省略します（公用文における漢字使用等について）", guidelineId: "okurigana-1973" },

  // ---------------------------------------------------------------------------
  // #438 rules: gairai-1991
  // ---------------------------------------------------------------------------
  { id: "katakana-chouon", nameJa: "カタカナ語の長音省略禁止", descriptionJa: "長音記号「ー」の代わりに母音を繰り返しているカタカナ語を検出します", guidelineId: "gairai-1991" },
  { id: "vu-katakana", nameJa: "「ヴ」の使用制限", descriptionJa: "公用文や正式な文書では「ヴ」を避け、バ行の表記を使用してください", guidelineId: "gairai-1991" },
  { id: "gairai-kana-table", nameJa: "外来語仮名の第1表・第2表準拠", descriptionJa: "公用文・学術文書では外来語表記の第2表（拡張仮名）の使用を避け、第1表の表記を推奨します", guidelineId: "gairai-1991" },

  // ---------------------------------------------------------------------------
  // #438 rules: gendai-kanazukai-1986
  // ---------------------------------------------------------------------------
  { id: "ji-zu-kana", nameJa: "じ/ぢ・ず/づの使い分け", descriptionJa: "現代仮名遣いに基づき、じ/ぢ・ず/づの誤った使い方を検出します", guidelineId: "gendai-kanazukai-1986" },
  { id: "historical-kana-detection", nameJa: "歴史的仮名遣いの検出", descriptionJa: "現代では使用されない歴史的仮名遣い（ゐ・ゑ・ヰ・ヱ）を検出します", guidelineId: "gendai-kanazukai-1986" },
  { id: "long-vowel-kana", nameJa: "長音の仮名表記", descriptionJa: "カタカナ語で長音記号「ー」の代わりに母音を繰り返している場合を検出します", guidelineId: "gendai-kanazukai-1986" },

  // ---------------------------------------------------------------------------
  // #438 rules: koyo-bun-2022
  // ---------------------------------------------------------------------------
  { id: "formal-noun-opening", nameJa: "形式名詞のひらがな表記", descriptionJa: "形式名詞（こと・もの・とき・ところ・わけ・ため等）はひらがなで書きます（公用文における漢字使用等について）", guidelineId: "koyo-bun-2022" },
  { id: "auxiliary-verb-opening", nameJa: "補助動詞・補助形容詞のひらがな表記", descriptionJa: "補助動詞・補助形容詞（いる・おく・しまう・みる・いただく・ください等）はひらがなで書きます（公用文における漢字使用等について）", guidelineId: "koyo-bun-2022" },
  { id: "conjunction-opening", nameJa: "接続詞のひらがな表記", descriptionJa: "「ただし」「なお」「かつ」「すなわち」「したがって」等の接続詞はひらがなで書きます（公用文における漢字使用等について）", guidelineId: "koyo-bun-2022" },
  { id: "particle-suffix-modifier-opening", nameJa: "副助詞・接尾語・連体詞のひらがな表記", descriptionJa: "「ほど」「くらい」「まで」「など」「ごろ」等の副助詞・接尾語・連体詞はひらがなで書きます（公用文における漢字使用等について）", guidelineId: "koyo-bun-2022" },
  { id: "pronoun-kanji", nameJa: "代名詞の漢字表記統一", descriptionJa: "公用文では代名詞の表記を統一します（「我々」→「私たち」等）（公用文における漢字使用等について）", guidelineId: "koyo-bun-2022" },
  { id: "official-style-copula", nameJa: "常体における「だ・だった」の禁止", descriptionJa: "公用文・学術文の常体では「だ・だった」を避け「である・であった」を使います（公用文作成の考え方）", guidelineId: "koyo-bun-2022" },
  { id: "literary-style-exclusion", nameJa: "文語調表現の排除", descriptionJa: "「〜せり」「〜なり」「〜べし」「〜にて」等の文語調表現を検出します（公用文作成の考え方）", guidelineId: "koyo-bun-2022" },
  { id: "excessive-honorific", nameJa: "過剰な敬語表現の禁止", descriptionJa: "二重敬語や過剰な丁寧表現（おっしゃられる・拝見させていただく等）を検出します（公用文作成の考え方）", guidelineId: "koyo-bun-2022" },
  { id: "prefix-script-matching", nameJa: "接頭語「御・ご・お」の使い分け", descriptionJa: "和語にはお〜、漢語にはご〜を付けます（公用文における漢字使用等について）", guidelineId: "koyo-bun-2022" },

  // ---------------------------------------------------------------------------
  // #438 rules: jis-x-4051
  // ---------------------------------------------------------------------------
  { id: "bracket-spacing", nameJa: "括弧類と隣接する文字間のスペース禁止", descriptionJa: "日本語括弧類の直内側にあるスペースを検出します", guidelineId: "jis-x-4051" },
  { id: "japanese-punctuation-width", nameJa: "和文中の句読点・記号の全角統一", descriptionJa: "日本語文字に隣接する半角の感嘆符・疑問符を検出します", guidelineId: "jis-x-4051" },
  { id: "bracket-period-placement", nameJa: "文末の注釈括弧と句点の位置関係", descriptionJa: "括弧の閉じる前に句点がある場合を検出します。句点は括弧の外側に置いてください", guidelineId: "jis-x-4051" },
  { id: "wave-dash-unification", nameJa: "波ダッシュの統一", descriptionJa: "波ダッシュ（U+301C: 〜）と全角チルダ（U+FF5E: ～）の混在を検出します", guidelineId: "jis-x-4051" },
  { id: "iteration-mark", nameJa: "繰り返し符号「々」の制限", descriptionJa: "平仮名・片仮名の後に「々」が使われている無効な用法を検出します", guidelineId: "jis-x-4051" },

  // ---------------------------------------------------------------------------
  // #438 rules: jtf-style-3
  // ---------------------------------------------------------------------------
  { id: "mixed-width-spacing", nameJa: "和欧文字間のスペース禁止", descriptionJa: "日本語文字とASCII文字の間にある半角スペースを検出します", guidelineId: "jtf-style-3" },
  { id: "alphanumeric-half-width", nameJa: "算用数字・アルファベットの半角統一", descriptionJa: "全角の数字・アルファベットを検出します。半角で記述してください", guidelineId: "jtf-style-3" },
  { id: "katakana-width", nameJa: "カタカナの全角統一", descriptionJa: "半角カタカナを検出します。カタカナは全角で記述してください", guidelineId: "jtf-style-3" },
  { id: "heading-period", nameJa: "見出し末尾の句点禁止", descriptionJa: "句点（。）で終わっている短い見出しを検出します", guidelineId: "jtf-style-3" },
  { id: "nakaguro-usage", nameJa: "中黒（・）の用法統一", descriptionJa: "中黒（・）が箇条書きと区切り符号の両方に使われている場合を検出します", guidelineId: "jtf-style-3" },
  { id: "large-number-comma", nameJa: "大きな数字の桁区切り", descriptionJa: "4桁以上の数字に桁区切りのカンマがない場合を検出します", guidelineId: "jtf-style-3" },
  { id: "counter-character", nameJa: "助数詞「か」のひらがな表記", descriptionJa: "助数詞に片仮名「ヵ」「ヶ」「ケ」を使っている場合を検出します。平仮名「か」で表記してください", guidelineId: "jtf-style-3" },
  { id: "list-formatting-consistency", nameJa: "箇条書きの文体・句点の統一", descriptionJa: "箇条書き内で句点（。）の有無が混在している場合を検出します", guidelineId: "jtf-style-3" },

  // ---------------------------------------------------------------------------
  // #438 rules: Universal (no guidelineId)
  // ---------------------------------------------------------------------------
  { id: "double-negative", nameJa: "二重否定の禁止", descriptionJa: "二重否定（ないではない・ないことはない等）は公用文では原則として使いません（公用文作成の考え方）" },
  { id: "conjunctive-ga-overuse", nameJa: "接続助詞「が」の多用禁止", descriptionJa: "接続助詞「が」の多用を避け、文を分けてください（公用文作成の考え方）" },
  { id: "consecutive-particle", nameJa: "同一助詞の連続使用制限", descriptionJa: "同一の助詞を連続して使うと読みにくくなります。文の構造を見直してください（公用文作成の考え方）" },
  { id: "tautology-redundancy", nameJa: "重複表現（重言）の禁止", descriptionJa: "「まず最初に」「頭痛が痛い」等の重複表現（重言）を検出します（公用文作成の考え方）" },
  { id: "modifier-length-order", nameJa: "長い修飾節の先行配置", descriptionJa: "15文字以上の長い修飾節が「の」の前に置かれています。文を分割または再構成することを検討してください（公用文作成の考え方）" },
  { id: "kanji-verb-one-char-do", nameJa: "「漢字1字＋する」型の動詞の言い換え", descriptionJa: "「処する」「発する」等の「漢字1字＋する」型動詞をより具体的な表現に言い換えます（公用文作成の考え方）" },
  { id: "particle-kara-yori", nameJa: "起点を示す「より」の誤用", descriptionJa: "起点・出所を表す場合は「より」でなく「から」を使います（公用文作成の考え方）" },
  { id: "suru-beki-conjugation", nameJa: "サ変動詞＋「べき」の活用統一", descriptionJa: "サ変動詞＋「べき」は「すべき」または「するべき」が正しい活用です（公用文作成の考え方）" },
  { id: "conjunction-hierarchy", nameJa: "並列・選択の接続詞の階層ルール", descriptionJa: "「及び」「並びに」「又は」「若しくは」の階層的な使い分けを確認します（公用文作成の考え方）" },
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
    rules: [
      "punctuation-rules", "number-format", "notation-consistency", "dash-format",
      "dialogue-punctuation", "comma-frequency",
      // #438 rules
      "bracket-spacing", "japanese-punctuation-width", "bracket-period-placement",
      "wave-dash-unification", "iteration-mark", "mixed-width-spacing",
      "alphanumeric-half-width", "katakana-width", "heading-period",
      "nakaguro-usage", "large-number-comma", "counter-character",
      "list-formatting-consistency", "katakana-chouon", "vu-katakana",
      "gairai-kana-table",
    ],
  },
  {
    id: "kanji",
    nameJa: "漢字・用字",
    rules: [
      "joyo-kanji", "era-year-validator", "adverb-form-consistency",
      // #438 rules
      "verb-okurigana-strict", "fixed-okurigana-noun", "compound-noun-okurigana-omission",
      "ji-zu-kana", "historical-kana-detection", "long-vowel-kana",
      "formal-noun-opening", "auxiliary-verb-opening", "conjunction-opening",
      "kanji-verb-one-char-do", "pronoun-kanji", "prefix-script-matching",
    ],
  },
  {
    id: "grammar",
    nameJa: "文法・語法",
    rules: [
      "particle-no-repetition", "conjugation-errors", "correlative-expression",
      "counter-word-mismatch", "passive-overuse",
      // #438 rules
      "double-negative", "conjunctive-ga-overuse", "consecutive-particle",
      "tautology-redundancy", "modifier-length-order", "particle-kara-yori",
      "suru-beki-conjugation", "conjunction-hierarchy",
      "particle-suffix-modifier-opening",
    ],
  },
  {
    id: "style",
    nameJa: "文体",
    rules: [
      "redundant-expression", "verbose-expression", "sentence-ending-repetition",
      "sentence-length", "desu-masu-consistency", "conjunction-overuse",
      "word-repetition", "taigen-dome-overuse",
      // #438 rules
      "official-style-copula", "literary-style-exclusion", "excessive-honorific",
    ],
  },
  { id: "ai", nameJa: "AI校正", rules: ["homophone-detection"] },
];

/** Per-rule config shape used in presets and settings */
export interface LintRulePresetConfig {
  enabled: boolean;
  severity: Severity;
  skipDialogue?: boolean;
  skipLlmValidation?: boolean;
}

/** Default configs per rule (matching each rule's defaultConfig) -- used as standard mode */
export const LINT_DEFAULT_CONFIGS: Record<string, LintRulePresetConfig> = {
  // --- Existing rules ---
  "punctuation-rules": { enabled: true, severity: "warning", skipLlmValidation: true },
  "number-format": { enabled: true, severity: "warning", skipDialogue: true, skipLlmValidation: true },
  "joyo-kanji": { enabled: true, severity: "info", skipDialogue: true, skipLlmValidation: true },
  "era-year-validator": { enabled: true, severity: "warning", skipLlmValidation: true },
  "particle-no-repetition": { enabled: true, severity: "info", skipDialogue: true },
  "conjugation-errors": { enabled: true, severity: "warning", skipDialogue: true },
  "redundant-expression": { enabled: true, severity: "warning", skipDialogue: true, skipLlmValidation: true },
  "verbose-expression": { enabled: true, severity: "info", skipDialogue: true },
  "sentence-ending-repetition": { enabled: true, severity: "info", skipDialogue: true },
  "notation-consistency": { enabled: true, severity: "warning", skipDialogue: true },
  "correlative-expression": { enabled: true, severity: "warning", skipDialogue: true },
  "sentence-length": { enabled: true, severity: "info", skipDialogue: true },
  "dash-format": { enabled: true, severity: "warning", skipLlmValidation: true },
  "dialogue-punctuation": { enabled: true, severity: "warning", skipLlmValidation: true },
  "comma-frequency": { enabled: true, severity: "info", skipDialogue: true },
  "desu-masu-consistency": { enabled: true, severity: "warning", skipDialogue: true },
  "conjunction-overuse": { enabled: true, severity: "info", skipDialogue: true },
  "word-repetition": { enabled: true, severity: "info", skipDialogue: true },
  "taigen-dome-overuse": { enabled: true, severity: "info", skipDialogue: true },
  "passive-overuse": { enabled: true, severity: "info", skipDialogue: true },
  "counter-word-mismatch": { enabled: true, severity: "warning" },
  "adverb-form-consistency": { enabled: true, severity: "info" },
  "homophone-detection": { enabled: true, severity: "warning" },

  // --- #438 rules: okurigana-1973 ---
  "verb-okurigana-strict": { enabled: true, severity: "warning" },
  "fixed-okurigana-noun": { enabled: true, severity: "info" },
  "compound-noun-okurigana-omission": { enabled: true, severity: "info" },

  // --- #438 rules: gairai-1991 ---
  "katakana-chouon": { enabled: true, severity: "info" },
  "vu-katakana": { enabled: true, severity: "info" },
  "gairai-kana-table": { enabled: true, severity: "info" },

  // --- #438 rules: gendai-kanazukai-1986 ---
  "ji-zu-kana": { enabled: true, severity: "warning" },
  "historical-kana-detection": { enabled: true, severity: "info" },
  "long-vowel-kana": { enabled: true, severity: "info" },

  // --- #438 rules: koyo-bun-2022 ---
  "formal-noun-opening": { enabled: true, severity: "info" },
  "auxiliary-verb-opening": { enabled: true, severity: "info" },
  "conjunction-opening": { enabled: true, severity: "info" },
  "particle-suffix-modifier-opening": { enabled: true, severity: "info" },
  "pronoun-kanji": { enabled: true, severity: "info" },
  "official-style-copula": { enabled: true, severity: "info" },
  "literary-style-exclusion": { enabled: true, severity: "info" },
  "excessive-honorific": { enabled: true, severity: "warning" },
  "prefix-script-matching": { enabled: true, severity: "info" },

  // --- #438 rules: jis-x-4051 ---
  "bracket-spacing": { enabled: true, severity: "warning" },
  "japanese-punctuation-width": { enabled: true, severity: "warning" },
  "bracket-period-placement": { enabled: true, severity: "warning" },
  "wave-dash-unification": { enabled: true, severity: "info" },
  "iteration-mark": { enabled: true, severity: "warning" },

  // --- #438 rules: jtf-style-3 ---
  "mixed-width-spacing": { enabled: true, severity: "info" },
  "alphanumeric-half-width": { enabled: true, severity: "info" },
  "katakana-width": { enabled: true, severity: "warning" },
  "heading-period": { enabled: true, severity: "info" },
  "nakaguro-usage": { enabled: true, severity: "info" },
  "large-number-comma": { enabled: true, severity: "info" },
  "counter-character": { enabled: true, severity: "info" },
  "list-formatting-consistency": { enabled: true, severity: "info" },

  // --- #438 rules: Universal ---
  "double-negative": { enabled: true, severity: "warning" },
  "conjunctive-ga-overuse": { enabled: true, severity: "info" },
  "consecutive-particle": { enabled: true, severity: "warning" },
  "tautology-redundancy": { enabled: true, severity: "warning" },
  "modifier-length-order": { enabled: true, severity: "info" },
  "kanji-verb-one-char-do": { enabled: true, severity: "info" },
  "particle-kara-yori": { enabled: true, severity: "info" },
  "suru-beki-conjugation": { enabled: true, severity: "warning" },
  "conjunction-hierarchy": { enabled: true, severity: "info" },
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
      // --- Existing rules ---
      "punctuation-rules": { enabled: true, severity: "info", skipLlmValidation: true },
      "number-format": { enabled: false, severity: "info", skipDialogue: true, skipLlmValidation: true },
      "joyo-kanji": { enabled: false, severity: "info", skipDialogue: true, skipLlmValidation: true },
      "era-year-validator": { enabled: false, severity: "info", skipLlmValidation: true },
      "particle-no-repetition": { enabled: false, severity: "info", skipDialogue: true },
      "conjugation-errors": { enabled: true, severity: "warning", skipDialogue: true },
      "redundant-expression": { enabled: true, severity: "info", skipDialogue: true, skipLlmValidation: true },
      "verbose-expression": { enabled: false, severity: "info", skipDialogue: true },
      "sentence-ending-repetition": { enabled: false, severity: "info", skipDialogue: true },
      "notation-consistency": { enabled: false, severity: "info", skipDialogue: true },
      "correlative-expression": { enabled: true, severity: "info", skipDialogue: true },
      "sentence-length": { enabled: false, severity: "info", skipDialogue: true },
      "dash-format": { enabled: false, severity: "info", skipLlmValidation: true },
      "dialogue-punctuation": { enabled: true, severity: "warning", skipLlmValidation: true },
      "comma-frequency": { enabled: false, severity: "info" },
      "desu-masu-consistency": { enabled: false, severity: "info" },
      "conjunction-overuse": { enabled: false, severity: "info" },
      "word-repetition": { enabled: false, severity: "info" },
      "taigen-dome-overuse": { enabled: false, severity: "info" },
      "passive-overuse": { enabled: false, severity: "info" },
      "counter-word-mismatch": { enabled: false, severity: "info" },
      "adverb-form-consistency": { enabled: false, severity: "info" },
      "homophone-detection": { enabled: false, severity: "info" },
      // --- #438 rules ---
      "verb-okurigana-strict": { enabled: false, severity: "info" },
      "fixed-okurigana-noun": { enabled: false, severity: "info" },
      "compound-noun-okurigana-omission": { enabled: false, severity: "info" },
      "katakana-chouon": { enabled: false, severity: "info" },
      "vu-katakana": { enabled: false, severity: "info" },
      "gairai-kana-table": { enabled: false, severity: "info" },
      "ji-zu-kana": { enabled: true, severity: "info" },
      "historical-kana-detection": { enabled: false, severity: "info" },
      "long-vowel-kana": { enabled: false, severity: "info" },
      "formal-noun-opening": { enabled: false, severity: "info" },
      "auxiliary-verb-opening": { enabled: false, severity: "info" },
      "conjunction-opening": { enabled: false, severity: "info" },
      "particle-suffix-modifier-opening": { enabled: false, severity: "info" },
      "pronoun-kanji": { enabled: false, severity: "info" },
      "official-style-copula": { enabled: false, severity: "info" },
      "literary-style-exclusion": { enabled: false, severity: "info" },
      "excessive-honorific": { enabled: false, severity: "info" },
      "prefix-script-matching": { enabled: false, severity: "info" },
      "bracket-spacing": { enabled: false, severity: "info" },
      "japanese-punctuation-width": { enabled: false, severity: "info" },
      "bracket-period-placement": { enabled: false, severity: "info" },
      "wave-dash-unification": { enabled: false, severity: "info" },
      "iteration-mark": { enabled: false, severity: "info" },
      "mixed-width-spacing": { enabled: false, severity: "info" },
      "alphanumeric-half-width": { enabled: false, severity: "info" },
      "katakana-width": { enabled: false, severity: "info" },
      "heading-period": { enabled: false, severity: "info" },
      "nakaguro-usage": { enabled: false, severity: "info" },
      "large-number-comma": { enabled: false, severity: "info" },
      "counter-character": { enabled: false, severity: "info" },
      "list-formatting-consistency": { enabled: false, severity: "info" },
      "double-negative": { enabled: true, severity: "info" },
      "conjunctive-ga-overuse": { enabled: false, severity: "info" },
      "consecutive-particle": { enabled: false, severity: "info" },
      "tautology-redundancy": { enabled: true, severity: "info" },
      "modifier-length-order": { enabled: false, severity: "info" },
      "kanji-verb-one-char-do": { enabled: false, severity: "info" },
      "particle-kara-yori": { enabled: false, severity: "info" },
      "suru-beki-conjugation": { enabled: true, severity: "info" },
      "conjunction-hierarchy": { enabled: false, severity: "info" },
    },
  },
  standard: {
    nameJa: "標準モード",
    configs: { ...LINT_DEFAULT_CONFIGS },
  },
  strict: {
    nameJa: "厳格モード",
    configs: {
      // --- Existing rules ---
      "punctuation-rules": { enabled: true, severity: "error", skipLlmValidation: true },
      "number-format": { enabled: true, severity: "error", skipLlmValidation: true },
      "joyo-kanji": { enabled: true, severity: "warning", skipLlmValidation: true },
      "era-year-validator": { enabled: true, severity: "error", skipLlmValidation: true },
      "particle-no-repetition": { enabled: true, severity: "warning" },
      "conjugation-errors": { enabled: true, severity: "error" },
      "redundant-expression": { enabled: true, severity: "error", skipLlmValidation: true },
      "verbose-expression": { enabled: true, severity: "warning" },
      "sentence-ending-repetition": { enabled: true, severity: "warning", skipDialogue: true },
      "notation-consistency": { enabled: true, severity: "error" },
      "correlative-expression": { enabled: true, severity: "error" },
      "sentence-length": { enabled: true, severity: "warning" },
      "dash-format": { enabled: true, severity: "error", skipLlmValidation: true },
      "dialogue-punctuation": { enabled: true, severity: "error", skipLlmValidation: true },
      "comma-frequency": { enabled: true, severity: "warning" },
      "desu-masu-consistency": { enabled: true, severity: "error", skipDialogue: true },
      "conjunction-overuse": { enabled: true, severity: "warning", skipDialogue: true },
      "word-repetition": { enabled: true, severity: "warning" },
      "taigen-dome-overuse": { enabled: true, severity: "warning", skipDialogue: true },
      "passive-overuse": { enabled: true, severity: "warning", skipDialogue: true },
      "counter-word-mismatch": { enabled: true, severity: "error" },
      "adverb-form-consistency": { enabled: true, severity: "warning" },
      "homophone-detection": { enabled: true, severity: "error" },
      // --- #438 rules ---
      "verb-okurigana-strict": { enabled: true, severity: "error" },
      "fixed-okurigana-noun": { enabled: true, severity: "warning" },
      "compound-noun-okurigana-omission": { enabled: true, severity: "warning" },
      "katakana-chouon": { enabled: true, severity: "warning" },
      "vu-katakana": { enabled: true, severity: "warning" },
      "gairai-kana-table": { enabled: true, severity: "warning" },
      "ji-zu-kana": { enabled: true, severity: "error" },
      "historical-kana-detection": { enabled: true, severity: "warning" },
      "long-vowel-kana": { enabled: true, severity: "warning" },
      "formal-noun-opening": { enabled: true, severity: "warning" },
      "auxiliary-verb-opening": { enabled: true, severity: "warning" },
      "conjunction-opening": { enabled: true, severity: "warning" },
      "particle-suffix-modifier-opening": { enabled: true, severity: "warning" },
      "pronoun-kanji": { enabled: true, severity: "warning" },
      "official-style-copula": { enabled: true, severity: "warning" },
      "literary-style-exclusion": { enabled: true, severity: "warning" },
      "excessive-honorific": { enabled: true, severity: "error" },
      "prefix-script-matching": { enabled: true, severity: "warning" },
      "bracket-spacing": { enabled: true, severity: "error" },
      "japanese-punctuation-width": { enabled: true, severity: "error" },
      "bracket-period-placement": { enabled: true, severity: "error" },
      "wave-dash-unification": { enabled: true, severity: "warning" },
      "iteration-mark": { enabled: true, severity: "error" },
      "mixed-width-spacing": { enabled: true, severity: "warning" },
      "alphanumeric-half-width": { enabled: true, severity: "warning" },
      "katakana-width": { enabled: true, severity: "error" },
      "heading-period": { enabled: true, severity: "warning" },
      "nakaguro-usage": { enabled: true, severity: "warning" },
      "large-number-comma": { enabled: true, severity: "warning" },
      "counter-character": { enabled: true, severity: "warning" },
      "list-formatting-consistency": { enabled: true, severity: "warning" },
      "double-negative": { enabled: true, severity: "error" },
      "conjunctive-ga-overuse": { enabled: true, severity: "warning" },
      "consecutive-particle": { enabled: true, severity: "error" },
      "tautology-redundancy": { enabled: true, severity: "error" },
      "modifier-length-order": { enabled: true, severity: "warning" },
      "kanji-verb-one-char-do": { enabled: true, severity: "warning" },
      "particle-kara-yori": { enabled: true, severity: "warning" },
      "suru-beki-conjugation": { enabled: true, severity: "error" },
      "conjunction-hierarchy": { enabled: true, severity: "warning" },
    },
  },
  novel: {
    nameJa: "小説モード",
    configs: {
      // --- Existing rules ---
      "punctuation-rules": { enabled: true, severity: "warning", skipLlmValidation: true },
      "number-format": { enabled: false, severity: "info", skipDialogue: true, skipLlmValidation: true },
      "joyo-kanji": { enabled: false, severity: "info", skipDialogue: true, skipLlmValidation: true },
      "era-year-validator": { enabled: false, severity: "info", skipLlmValidation: true },
      "particle-no-repetition": { enabled: true, severity: "info", skipDialogue: true },
      "conjugation-errors": { enabled: true, severity: "warning", skipDialogue: true },
      "redundant-expression": { enabled: true, severity: "warning", skipDialogue: true, skipLlmValidation: true },
      "verbose-expression": { enabled: true, severity: "info", skipDialogue: true },
      "sentence-ending-repetition": { enabled: true, severity: "warning", skipDialogue: true },
      "notation-consistency": { enabled: true, severity: "warning", skipDialogue: true },
      "correlative-expression": { enabled: true, severity: "warning", skipDialogue: true },
      "sentence-length": { enabled: true, severity: "info", skipDialogue: true },
      "dash-format": { enabled: true, severity: "warning", skipLlmValidation: true },
      "dialogue-punctuation": { enabled: true, severity: "warning", skipLlmValidation: true },
      "comma-frequency": { enabled: false, severity: "info" },
      "desu-masu-consistency": { enabled: false, severity: "info" },
      "conjunction-overuse": { enabled: true, severity: "info" },
      "word-repetition": { enabled: true, severity: "info" },
      "taigen-dome-overuse": { enabled: true, severity: "info" },
      "passive-overuse": { enabled: true, severity: "info" },
      "counter-word-mismatch": { enabled: false, severity: "warning" },
      "adverb-form-consistency": { enabled: true, severity: "info" },
      "homophone-detection": { enabled: true, severity: "warning" },
      // --- #438 rules: creative writing = disable official/formal rules ---
      "verb-okurigana-strict": { enabled: false, severity: "info" },
      "fixed-okurigana-noun": { enabled: false, severity: "info" },
      "compound-noun-okurigana-omission": { enabled: false, severity: "info" },
      "katakana-chouon": { enabled: true, severity: "info" },
      "vu-katakana": { enabled: false, severity: "info" },
      "gairai-kana-table": { enabled: false, severity: "info" },
      "ji-zu-kana": { enabled: true, severity: "warning" },
      "historical-kana-detection": { enabled: false, severity: "info" },
      "long-vowel-kana": { enabled: true, severity: "info" },
      "formal-noun-opening": { enabled: false, severity: "info" },
      "auxiliary-verb-opening": { enabled: false, severity: "info" },
      "conjunction-opening": { enabled: false, severity: "info" },
      "particle-suffix-modifier-opening": { enabled: false, severity: "info" },
      "pronoun-kanji": { enabled: false, severity: "info" },
      "official-style-copula": { enabled: false, severity: "info" },
      "literary-style-exclusion": { enabled: false, severity: "info" },
      "excessive-honorific": { enabled: false, severity: "info" },
      "prefix-script-matching": { enabled: false, severity: "info" },
      "bracket-spacing": { enabled: true, severity: "info" },
      "japanese-punctuation-width": { enabled: true, severity: "info" },
      "bracket-period-placement": { enabled: false, severity: "info" },
      "wave-dash-unification": { enabled: true, severity: "info" },
      "iteration-mark": { enabled: true, severity: "info" },
      "mixed-width-spacing": { enabled: false, severity: "info" },
      "alphanumeric-half-width": { enabled: false, severity: "info" },
      "katakana-width": { enabled: true, severity: "info" },
      "heading-period": { enabled: false, severity: "info" },
      "nakaguro-usage": { enabled: false, severity: "info" },
      "large-number-comma": { enabled: false, severity: "info" },
      "counter-character": { enabled: false, severity: "info" },
      "list-formatting-consistency": { enabled: false, severity: "info" },
      "double-negative": { enabled: true, severity: "info" },
      "conjunctive-ga-overuse": { enabled: true, severity: "info" },
      "consecutive-particle": { enabled: true, severity: "info" },
      "tautology-redundancy": { enabled: true, severity: "warning" },
      "modifier-length-order": { enabled: false, severity: "info" },
      "kanji-verb-one-char-do": { enabled: false, severity: "info" },
      "particle-kara-yori": { enabled: false, severity: "info" },
      "suru-beki-conjugation": { enabled: true, severity: "info" },
      "conjunction-hierarchy": { enabled: false, severity: "info" },
    },
  },
  // The official preset intentionally omits skipDialogue on most rules because
  // government documents rarely contain dialogue; adding the toggle would be
  // misleading for users of this preset.
  official: {
    nameJa: "公用文モード",
    configs: {
      // --- Existing rules ---
      "punctuation-rules": { enabled: true, severity: "error", skipLlmValidation: true },
      "number-format": { enabled: true, severity: "error", skipLlmValidation: true },
      "joyo-kanji": { enabled: true, severity: "warning", skipLlmValidation: true },
      "era-year-validator": { enabled: true, severity: "error", skipLlmValidation: true },
      "particle-no-repetition": { enabled: true, severity: "warning" },
      "conjugation-errors": { enabled: true, severity: "error" },
      "redundant-expression": { enabled: true, severity: "error", skipLlmValidation: true },
      "verbose-expression": { enabled: true, severity: "warning" },
      "sentence-ending-repetition": { enabled: true, severity: "info" },
      "notation-consistency": { enabled: true, severity: "error" },
      "correlative-expression": { enabled: true, severity: "error" },
      "sentence-length": { enabled: true, severity: "warning" },
      "dash-format": { enabled: true, severity: "error", skipLlmValidation: true },
      "dialogue-punctuation": { enabled: true, severity: "warning", skipLlmValidation: true },
      "comma-frequency": { enabled: true, severity: "warning" },
      "desu-masu-consistency": { enabled: true, severity: "error" },
      "conjunction-overuse": { enabled: true, severity: "warning" },
      "word-repetition": { enabled: true, severity: "info" },
      "taigen-dome-overuse": { enabled: true, severity: "info" },
      "passive-overuse": { enabled: true, severity: "warning" },
      "counter-word-mismatch": { enabled: true, severity: "error" },
      "adverb-form-consistency": { enabled: true, severity: "warning" },
      "homophone-detection": { enabled: true, severity: "warning" },
      // --- #438 rules: official/formal = enable all formal rules ---
      "verb-okurigana-strict": { enabled: true, severity: "error" },
      "fixed-okurigana-noun": { enabled: true, severity: "warning" },
      "compound-noun-okurigana-omission": { enabled: true, severity: "warning" },
      "katakana-chouon": { enabled: true, severity: "warning" },
      "vu-katakana": { enabled: true, severity: "warning" },
      "gairai-kana-table": { enabled: true, severity: "warning" },
      "ji-zu-kana": { enabled: true, severity: "error" },
      "historical-kana-detection": { enabled: true, severity: "warning" },
      "long-vowel-kana": { enabled: true, severity: "warning" },
      "formal-noun-opening": { enabled: true, severity: "warning" },
      "auxiliary-verb-opening": { enabled: true, severity: "warning" },
      "conjunction-opening": { enabled: true, severity: "warning" },
      "particle-suffix-modifier-opening": { enabled: true, severity: "warning" },
      "pronoun-kanji": { enabled: true, severity: "warning" },
      "official-style-copula": { enabled: true, severity: "warning" },
      "literary-style-exclusion": { enabled: true, severity: "error" },
      "excessive-honorific": { enabled: true, severity: "error" },
      "prefix-script-matching": { enabled: true, severity: "warning" },
      "bracket-spacing": { enabled: true, severity: "error" },
      "japanese-punctuation-width": { enabled: true, severity: "error" },
      "bracket-period-placement": { enabled: true, severity: "error" },
      "wave-dash-unification": { enabled: true, severity: "warning" },
      "iteration-mark": { enabled: true, severity: "error" },
      "mixed-width-spacing": { enabled: true, severity: "warning" },
      "alphanumeric-half-width": { enabled: true, severity: "warning" },
      "katakana-width": { enabled: true, severity: "error" },
      "heading-period": { enabled: true, severity: "warning" },
      "nakaguro-usage": { enabled: true, severity: "warning" },
      "large-number-comma": { enabled: true, severity: "warning" },
      "counter-character": { enabled: true, severity: "warning" },
      "list-formatting-consistency": { enabled: true, severity: "warning" },
      "double-negative": { enabled: true, severity: "error" },
      "conjunctive-ga-overuse": { enabled: true, severity: "warning" },
      "consecutive-particle": { enabled: true, severity: "error" },
      "tautology-redundancy": { enabled: true, severity: "error" },
      "modifier-length-order": { enabled: true, severity: "warning" },
      "kanji-verb-one-char-do": { enabled: true, severity: "warning" },
      "particle-kara-yori": { enabled: true, severity: "warning" },
      "suru-beki-conjugation": { enabled: true, severity: "error" },
      "conjunction-hierarchy": { enabled: true, severity: "warning" },
    },
  },
};

// ---------------------------------------------------------------------------
// Mode-based preset generation
// ---------------------------------------------------------------------------

import type { CorrectionModeId } from "./correction-config";
import { CORRECTION_MODES } from "./correction-modes";

/**
 * Generate a LintPreset from a correction mode by merging the mode's
 * ruleOverrides on top of the standard (default) preset configs.
 *
 * @param modeId - The correction mode to generate a preset for
 * @returns A LintPreset with the mode's overrides applied
 */
export function getPresetForMode(modeId: CorrectionModeId): LintPreset {
  const mode = CORRECTION_MODES[modeId];
  const base = { ...LINT_DEFAULT_CONFIGS };

  const merged: Record<string, LintRulePresetConfig> = { ...base };
  for (const [ruleId, override] of Object.entries(mode.ruleOverrides)) {
    const existing = merged[ruleId] ?? { enabled: true, severity: "warning" as const };
    merged[ruleId] = { ...existing, ...override } as LintRulePresetConfig;
  }

  return {
    nameJa: mode.nameJa,
    configs: merged,
  };
}

// ---------------------------------------------------------------------------
// Guideline map export
// ---------------------------------------------------------------------------

/**
 * Map from rule ID to its GuidelineId (or undefined for universal rules).
 * Used by RuleRunner for guideline-based filtering.
 */
export const RULE_GUIDELINE_MAP: Map<string, GuidelineId | undefined> = new Map(
  LINT_RULES_META.map(rule => [rule.id, rule.guidelineId])
);
