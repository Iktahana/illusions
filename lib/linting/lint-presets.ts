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
  // JTF日本語標準スタイルガイド (21 implemented rules)
  // ---------------------------------------------------------------------------
  {
    id: "jtf-1-2-1",
    nameJa: "句読点の統一",
    descriptionJa:
      "句点（。）と読点（、）について、JTFスタイルガイドの基準に従って表記を統一します",
    guidelineId: "jtf-style-3",
  },
  {
    id: "jtf-1-2-1-punctuation",
    nameJa: "句読点の全角統一",
    descriptionJa:
      "句読点には全角の「、」と「。」を使います。ピリオド（.）とカンマ（,）は使用しません",
    guidelineId: "jtf-style-3",
  },
  {
    id: "jtf-3-1-1",
    nameJa: "句点（。）の用法",
    descriptionJa: "句点（。）について、JTFスタイルガイドの基準に従って表記を統一します",
    guidelineId: "jtf-style-3",
  },
  {
    id: "jtf-3-1-1-kuten-brackets",
    nameJa: "閉じかっこ前の句点禁止",
    descriptionJa: "閉じかっこの前に句点（。）を打ちません",
    guidelineId: "jtf-style-3",
  },
  {
    id: "jtf-3-1-3",
    nameJa: "ピリオド・カンマの用法",
    descriptionJa:
      "ピリオド（.）、カンマ（,）について、JTFスタイルガイドの基準に従って表記を統一します",
    guidelineId: "jtf-style-3",
  },
  {
    id: "jtf-2-1-5-fullwidth-kana",
    nameJa: "カタカナの全角表記",
    descriptionJa: "漢字、ひらがな、カタカナは全角で表記します。半角カタカナは使用しません",
    guidelineId: "jtf-style-3",
  },
  {
    id: "jtf-2-1-8",
    nameJa: "算用数字の表記",
    descriptionJa: "算用数字について、JTFスタイルガイドの基準に従って表記を統一します",
    guidelineId: "jtf-style-3",
  },
  {
    id: "jtf-2-1-8-halfwidth-alnum",
    nameJa: "英数字の半角統一",
    descriptionJa: "算用数字とアルファベットは半角で表記します。全角の英数字は使用しません",
    guidelineId: "jtf-style-3",
  },
  {
    id: "jtf-2-1-10-digit-comma",
    nameJa: "算用数字の位取り",
    descriptionJa: "桁区切りには半角カンマ、小数点には半角ピリオドを使います",
    guidelineId: "jtf-style-3",
  },
  {
    id: "jtf-2-2-1-kanji",
    nameJa: "漢字表記の推奨",
    descriptionJa: "特定の副詞などは、ひらがなではなく漢字で表記します",
    guidelineId: "jtf-style-3",
  },
  {
    id: "jtf-2-3-no-space",
    nameJa: "半角・全角間のスペース禁止",
    descriptionJa: "半角文字と全角文字の間に半角スペースを入れません",
    guidelineId: "jtf-style-3",
  },
  {
    id: "jtf-3-3-1-parentheses-space",
    nameJa: "かっこ内外のスペース禁止",
    descriptionJa: "かっこの外側、内側ともにスペースを入れません",
    guidelineId: "jtf-style-3",
  },
  {
    id: "jtf-3-3-brackets-fullwidth",
    nameJa: "かっこの全角表記",
    descriptionJa: "丸かっこ、大かっこ、かぎかっこなどは原則として全角で表記します",
    guidelineId: "jtf-style-3",
  },
  {
    id: "jtf-4-3-2",
    nameJa: "長さの単位表記",
    descriptionJa: "長さについて、SI単位（m、cm、mm、km）を正しく表記します",
    guidelineId: "jtf-style-3",
  },
  {
    id: "jtf-4-3-3",
    nameJa: "質量の単位表記",
    descriptionJa: "質量について、SI単位（g、kg、t）を正しく表記します",
    guidelineId: "jtf-style-3",
  },
  {
    id: "jtf-4-3-4",
    nameJa: "面積・体積の単位表記",
    descriptionJa: "面積、体積について、SI単位（m²、m³、L）を正しく表記します",
    guidelineId: "jtf-style-3",
  },
  {
    id: "jtf-4-3-5",
    nameJa: "電気の単位表記",
    descriptionJa: "電気について、SI単位（V、A、W、Ω、Hz）を正しく表記します",
    guidelineId: "jtf-style-3",
  },
  {
    id: "jtf-4-3-6",
    nameJa: "温度の単位表記",
    descriptionJa: "温度について、摂氏（℃）を正しく表記します",
    guidelineId: "jtf-style-3",
  },
  {
    id: "jtf-4-3-7",
    nameJa: "周波数の単位表記",
    descriptionJa: "周波数について、SI単位（Hz、kHz、MHz、GHz）を正しく表記します",
    guidelineId: "jtf-style-3",
  },
  {
    id: "jtf-4-3-8",
    nameJa: "速度の単位表記",
    descriptionJa: "速度について、SI単位（m/s、km/h）を正しく表記します",
    guidelineId: "jtf-style-3",
  },
  {
    id: "jtf-4-3-9",
    nameJa: "伝送速度の単位表記",
    descriptionJa: "伝送速度について、単位（bps、kbps、Mbps、Gbps）を正しく表記します",
    guidelineId: "jtf-style-3",
  },

  // ---------------------------------------------------------------------------
  // 原稿編集 第2版 (9 rules)
  // ---------------------------------------------------------------------------
  {
    id: "me2-4-kanji-font",
    nameJa: "旧字体検出",
    descriptionJa: "常用漢字表の通用字体を使用し、旧字体を検出します",
    guidelineId: "editors-rulebook",
  },
  {
    id: "me2-8-katakana",
    nameJa: "外来語・擬音語の片仮名表記",
    descriptionJa: "外来語・擬声語・擬音語は片仮名で表記します",
    guidelineId: "editors-rulebook",
  },
  {
    id: "me2-9-foreign-words",
    nameJa: "外来語末尾の長音符号",
    descriptionJa: "3音以上の外来語の末尾の長音符号「ー」を省略しません",
    guidelineId: "editors-rulebook",
  },
  {
    id: "me2-11-vertical-numbers",
    nameJa: "縦組の漢数字使用",
    descriptionJa: "縦組では漢数字を使用します",
    guidelineId: "editors-rulebook",
  },
  {
    id: "me2-12-horizontal-numbers",
    nameJa: "横組のアラビア数字使用",
    descriptionJa: "横組ではアラビア数字を使用します",
    guidelineId: "editors-rulebook",
  },
  {
    id: "me2-13-unit-symbols",
    nameJa: "単位記号の表記",
    descriptionJa: "横組では数値と欧字単位記号の間にスペースを入れます",
    guidelineId: "editors-rulebook",
  },
  {
    id: "me2-14-pre-post-symbols",
    nameJa: "通貨・百分率記号の密着",
    descriptionJa: "通貨記号・百分率記号は数字に密着させます",
    guidelineId: "editors-rulebook",
  },
  {
    id: "me2-15-punctuation",
    nameJa: "句読点セットの統一",
    descriptionJa: "句読点セットが統一されているか確認します",
    guidelineId: "editors-rulebook",
  },
  {
    id: "me2-17-repetition-symbols",
    nameJa: "くり返し符号の用法",
    descriptionJa: "くり返し符号（々、ゝ、ゞ）の適切な使用をチェックします",
    guidelineId: "editors-rulebook",
  },

  // ---------------------------------------------------------------------------
  // 現代仮名遣い (3 rules)
  // ---------------------------------------------------------------------------
  {
    id: "gk-2-1-particle-o",
    nameJa: "助詞「を」の表記",
    descriptionJa: "助詞の「を」を「お」と書いている箇所を検出します",
    guidelineId: "gendai-kanazukai-1986",
  },
  {
    id: "gk-2-2-particle-ha",
    nameJa: "助詞「は」の表記",
    descriptionJa: "助詞の「は」を「わ」と書いている箇所を検出します",
    guidelineId: "gendai-kanazukai-1986",
  },
  {
    id: "gk-2-3-particle-he",
    nameJa: "助詞「へ」の表記",
    descriptionJa: "助詞の「へ」を「え」と書いている箇所を検出します",
    guidelineId: "gendai-kanazukai-1986",
  },

  // ---------------------------------------------------------------------------
  // 日本語表記ルールブック (5 rules)
  // ---------------------------------------------------------------------------
  {
    id: "nh-6-ji-zu-di-du-exceptions",
    nameJa: "「じ・ず」と「ぢ・づ」の例外",
    descriptionJa: "現代仮名遣いにおける「じ・ず」と「ぢ・づ」の例外的な語彙をチェックします",
    guidelineId: "editors-rulebook",
  },
  {
    id: "nh-7-compound-nouns-no-okurigana",
    nameJa: "複合名詞の送り仮名省略",
    descriptionJa: "慣用が固定しているため送り仮名を付けない複合名詞をチェックします",
    guidelineId: "editors-rulebook",
  },
  {
    id: "nh-9-numbers",
    nameJa: "数字の表記（半角アラビア数字）",
    descriptionJa: "全角数字を検出し、半角アラビア数字への修正を提案します",
    guidelineId: "editors-rulebook",
  },
  {
    id: "nh-10-units",
    nameJa: "単位記号の表記（半角英字）",
    descriptionJa: "全角の単位記号を検出し、半角英字への修正を提案します",
    guidelineId: "editors-rulebook",
  },
  {
    id: "nh-11-symbols",
    nameJa: "記述記号（引用符・省略記号・ダッシュ）",
    descriptionJa: "日本語文中の引用符・省略記号・ダッシュの誤用を検出します",
    guidelineId: "editors-rulebook",
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
    id: "jtf",
    nameJa: "JTF日本語標準スタイルガイド",
    rules: [
      "jtf-1-2-1",
      "jtf-1-2-1-punctuation",
      "jtf-3-1-1",
      "jtf-3-1-1-kuten-brackets",
      "jtf-3-1-3",
      "jtf-2-1-5-fullwidth-kana",
      "jtf-2-1-8",
      "jtf-2-1-8-halfwidth-alnum",
      "jtf-2-1-10-digit-comma",
      "jtf-2-2-1-kanji",
      "jtf-2-3-no-space",
      "jtf-3-3-1-parentheses-space",
      "jtf-3-3-brackets-fullwidth",
      "jtf-4-3-2",
      "jtf-4-3-3",
      "jtf-4-3-4",
      "jtf-4-3-5",
      "jtf-4-3-6",
      "jtf-4-3-7",
      "jtf-4-3-8",
      "jtf-4-3-9",
    ],
  },
  {
    id: "manuscript",
    nameJa: "原稿編集 第2版",
    rules: [
      "me2-4-kanji-font",
      "me2-8-katakana",
      "me2-9-foreign-words",
      "me2-11-vertical-numbers",
      "me2-12-horizontal-numbers",
      "me2-13-unit-symbols",
      "me2-14-pre-post-symbols",
      "me2-15-punctuation",
      "me2-17-repetition-symbols",
    ],
  },
  {
    id: "gendai-kanazukai",
    nameJa: "現代仮名遣い",
    rules: ["gk-2-1-particle-o", "gk-2-2-particle-ha", "gk-2-3-particle-he"],
  },
  {
    id: "nihongo-hyouki",
    nameJa: "日本語表記ルールブック",
    rules: [
      "nh-6-ji-zu-di-du-exceptions",
      "nh-7-compound-nouns-no-okurigana",
      "nh-9-numbers",
      "nh-10-units",
      "nh-11-symbols",
    ],
  },
];

/** Per-rule config shape used in presets and settings */
export interface LintRulePresetConfig {
  enabled: boolean;
  severity: Severity;
  skipDialogue?: boolean;
}

/** Default configs per rule -- used as standard mode */
export const LINT_DEFAULT_CONFIGS: Record<string, LintRulePresetConfig> = {
  // --- JTF rules ---
  "jtf-1-2-1": { enabled: true, severity: "warning" },
  "jtf-1-2-1-punctuation": { enabled: true, severity: "warning" },
  "jtf-3-1-1": { enabled: true, severity: "warning" },
  "jtf-3-1-1-kuten-brackets": { enabled: true, severity: "warning" },
  "jtf-3-1-3": { enabled: true, severity: "warning" },
  "jtf-2-1-5-fullwidth-kana": { enabled: true, severity: "warning" },
  "jtf-2-1-8": { enabled: true, severity: "warning" },
  "jtf-2-1-8-halfwidth-alnum": { enabled: true, severity: "warning" },
  "jtf-2-1-10-digit-comma": { enabled: true, severity: "warning" },
  "jtf-2-2-1-kanji": { enabled: true, severity: "info" },
  "jtf-2-3-no-space": { enabled: true, severity: "info" },
  "jtf-3-3-1-parentheses-space": { enabled: true, severity: "warning" },
  "jtf-3-3-brackets-fullwidth": { enabled: true, severity: "warning" },
  "jtf-4-3-2": { enabled: true, severity: "warning" },
  "jtf-4-3-3": { enabled: true, severity: "warning" },
  "jtf-4-3-4": { enabled: true, severity: "warning" },
  "jtf-4-3-5": { enabled: true, severity: "warning" },
  "jtf-4-3-6": { enabled: true, severity: "warning" },
  "jtf-4-3-7": { enabled: true, severity: "warning" },
  "jtf-4-3-8": { enabled: true, severity: "warning" },
  "jtf-4-3-9": { enabled: true, severity: "warning" },
  // --- 原稿編集 第2版 ---
  "me2-4-kanji-font": { enabled: true, severity: "warning" },
  "me2-8-katakana": { enabled: true, severity: "info" },
  "me2-9-foreign-words": { enabled: true, severity: "warning" },
  "me2-11-vertical-numbers": { enabled: false, severity: "info" },
  "me2-12-horizontal-numbers": { enabled: false, severity: "info" },
  "me2-13-unit-symbols": { enabled: false, severity: "info" },
  "me2-14-pre-post-symbols": { enabled: true, severity: "warning" },
  "me2-15-punctuation": { enabled: true, severity: "warning" },
  "me2-17-repetition-symbols": { enabled: true, severity: "info" },
  // --- 現代仮名遣い ---
  "gk-2-1-particle-o": { enabled: true, severity: "error" },
  "gk-2-2-particle-ha": { enabled: true, severity: "error" },
  "gk-2-3-particle-he": { enabled: true, severity: "error" },
  // --- 日本語表記ルールブック ---
  "nh-6-ji-zu-di-du-exceptions": { enabled: true, severity: "error" },
  "nh-7-compound-nouns-no-okurigana": { enabled: true, severity: "warning" },
  "nh-9-numbers": { enabled: true, severity: "warning" },
  "nh-10-units": { enabled: true, severity: "warning" },
  "nh-11-symbols": { enabled: true, severity: "warning" },
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
      "jtf-1-2-1": { enabled: false, severity: "info" },
      "jtf-1-2-1-punctuation": { enabled: true, severity: "info" },
      "jtf-3-1-1": { enabled: false, severity: "info" },
      "jtf-3-1-1-kuten-brackets": { enabled: true, severity: "info" },
      "jtf-3-1-3": { enabled: false, severity: "info" },
      "jtf-2-1-5-fullwidth-kana": { enabled: true, severity: "info" },
      "jtf-2-1-8": { enabled: false, severity: "info" },
      "jtf-2-1-8-halfwidth-alnum": { enabled: false, severity: "info" },
      "jtf-2-1-10-digit-comma": { enabled: false, severity: "info" },
      "jtf-2-2-1-kanji": { enabled: false, severity: "info" },
      "jtf-2-3-no-space": { enabled: false, severity: "info" },
      "jtf-3-3-1-parentheses-space": { enabled: false, severity: "info" },
      "jtf-3-3-brackets-fullwidth": { enabled: false, severity: "info" },
      "jtf-4-3-2": { enabled: false, severity: "info" },
      "jtf-4-3-3": { enabled: false, severity: "info" },
      "jtf-4-3-4": { enabled: false, severity: "info" },
      "jtf-4-3-5": { enabled: false, severity: "info" },
      "jtf-4-3-6": { enabled: false, severity: "info" },
      "jtf-4-3-7": { enabled: false, severity: "info" },
      "jtf-4-3-8": { enabled: false, severity: "info" },
      "jtf-4-3-9": { enabled: false, severity: "info" },
      "me2-4-kanji-font": { enabled: false, severity: "info" },
      "me2-8-katakana": { enabled: false, severity: "info" },
      "me2-9-foreign-words": { enabled: false, severity: "info" },
      "me2-11-vertical-numbers": { enabled: false, severity: "info" },
      "me2-12-horizontal-numbers": { enabled: false, severity: "info" },
      "me2-13-unit-symbols": { enabled: false, severity: "info" },
      "me2-14-pre-post-symbols": { enabled: false, severity: "info" },
      "me2-15-punctuation": { enabled: false, severity: "info" },
      "me2-17-repetition-symbols": { enabled: false, severity: "info" },
      "gk-2-1-particle-o": { enabled: true, severity: "warning" },
      "gk-2-2-particle-ha": { enabled: true, severity: "warning" },
      "gk-2-3-particle-he": { enabled: true, severity: "warning" },
      "nh-6-ji-zu-di-du-exceptions": { enabled: true, severity: "info" },
      "nh-7-compound-nouns-no-okurigana": { enabled: false, severity: "info" },
      "nh-9-numbers": { enabled: false, severity: "info" },
      "nh-10-units": { enabled: false, severity: "info" },
      "nh-11-symbols": { enabled: false, severity: "info" },
    },
  },
  standard: {
    nameJa: "標準モード",
    configs: { ...LINT_DEFAULT_CONFIGS },
  },
  strict: {
    nameJa: "厳密モード",
    configs: {
      "jtf-1-2-1": { enabled: true, severity: "error" },
      "jtf-1-2-1-punctuation": { enabled: true, severity: "error" },
      "jtf-3-1-1": { enabled: true, severity: "error" },
      "jtf-3-1-1-kuten-brackets": { enabled: true, severity: "error" },
      "jtf-3-1-3": { enabled: true, severity: "error" },
      "jtf-2-1-5-fullwidth-kana": { enabled: true, severity: "error" },
      "jtf-2-1-8": { enabled: true, severity: "error" },
      "jtf-2-1-8-halfwidth-alnum": { enabled: true, severity: "error" },
      "jtf-2-1-10-digit-comma": { enabled: true, severity: "error" },
      "jtf-2-2-1-kanji": { enabled: true, severity: "warning" },
      "jtf-2-3-no-space": { enabled: true, severity: "warning" },
      "jtf-3-3-1-parentheses-space": { enabled: true, severity: "error" },
      "jtf-3-3-brackets-fullwidth": { enabled: true, severity: "error" },
      "jtf-4-3-2": { enabled: true, severity: "error" },
      "jtf-4-3-3": { enabled: true, severity: "error" },
      "jtf-4-3-4": { enabled: true, severity: "error" },
      "jtf-4-3-5": { enabled: true, severity: "error" },
      "jtf-4-3-6": { enabled: true, severity: "error" },
      "jtf-4-3-7": { enabled: true, severity: "error" },
      "jtf-4-3-8": { enabled: true, severity: "error" },
      "jtf-4-3-9": { enabled: true, severity: "error" },
      "me2-4-kanji-font": { enabled: true, severity: "error" },
      "me2-8-katakana": { enabled: true, severity: "warning" },
      "me2-9-foreign-words": { enabled: true, severity: "error" },
      "me2-11-vertical-numbers": { enabled: true, severity: "warning" },
      "me2-12-horizontal-numbers": { enabled: true, severity: "warning" },
      "me2-13-unit-symbols": { enabled: true, severity: "warning" },
      "me2-14-pre-post-symbols": { enabled: true, severity: "error" },
      "me2-15-punctuation": { enabled: true, severity: "error" },
      "me2-17-repetition-symbols": { enabled: true, severity: "warning" },
      "gk-2-1-particle-o": { enabled: true, severity: "error" },
      "gk-2-2-particle-ha": { enabled: true, severity: "error" },
      "gk-2-3-particle-he": { enabled: true, severity: "error" },
      "nh-6-ji-zu-di-du-exceptions": { enabled: true, severity: "error" },
      "nh-7-compound-nouns-no-okurigana": { enabled: true, severity: "warning" },
      "nh-9-numbers": { enabled: true, severity: "error" },
      "nh-10-units": { enabled: true, severity: "error" },
      "nh-11-symbols": { enabled: true, severity: "error" },
    },
  },
  novel: {
    nameJa: "小説モード",
    configs: {
      "jtf-1-2-1": { enabled: true, severity: "warning" },
      "jtf-1-2-1-punctuation": { enabled: true, severity: "warning" },
      "jtf-3-1-1": { enabled: true, severity: "info" },
      "jtf-3-1-1-kuten-brackets": { enabled: true, severity: "warning" },
      "jtf-3-1-3": { enabled: false, severity: "info" },
      "jtf-2-1-5-fullwidth-kana": { enabled: true, severity: "warning" },
      "jtf-2-1-8": { enabled: false, severity: "info" },
      "jtf-2-1-8-halfwidth-alnum": { enabled: false, severity: "info" },
      "jtf-2-1-10-digit-comma": { enabled: false, severity: "info" },
      "jtf-2-2-1-kanji": { enabled: false, severity: "info" },
      "jtf-2-3-no-space": { enabled: false, severity: "info" },
      "jtf-3-3-1-parentheses-space": { enabled: true, severity: "info" },
      "jtf-3-3-brackets-fullwidth": { enabled: true, severity: "info" },
      "jtf-4-3-2": { enabled: false, severity: "info" },
      "jtf-4-3-3": { enabled: false, severity: "info" },
      "jtf-4-3-4": { enabled: false, severity: "info" },
      "jtf-4-3-5": { enabled: false, severity: "info" },
      "jtf-4-3-6": { enabled: false, severity: "info" },
      "jtf-4-3-7": { enabled: false, severity: "info" },
      "jtf-4-3-8": { enabled: false, severity: "info" },
      "jtf-4-3-9": { enabled: false, severity: "info" },
      "me2-4-kanji-font": { enabled: true, severity: "warning" },
      "me2-8-katakana": { enabled: false, severity: "info" },
      "me2-9-foreign-words": { enabled: false, severity: "info" },
      "me2-11-vertical-numbers": { enabled: false, severity: "info" },
      "me2-12-horizontal-numbers": { enabled: false, severity: "info" },
      "me2-13-unit-symbols": { enabled: false, severity: "info" },
      "me2-14-pre-post-symbols": { enabled: false, severity: "info" },
      "me2-15-punctuation": { enabled: true, severity: "warning" },
      "me2-17-repetition-symbols": { enabled: true, severity: "info" },
      "gk-2-1-particle-o": { enabled: true, severity: "error" },
      "gk-2-2-particle-ha": { enabled: true, severity: "error" },
      "gk-2-3-particle-he": { enabled: true, severity: "error" },
      "nh-6-ji-zu-di-du-exceptions": { enabled: true, severity: "error" },
      "nh-7-compound-nouns-no-okurigana": { enabled: false, severity: "info" },
      "nh-9-numbers": { enabled: false, severity: "info" },
      "nh-10-units": { enabled: false, severity: "info" },
      "nh-11-symbols": { enabled: true, severity: "warning" },
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
  LINT_RULES_META.map((rule) => [rule.id, rule.guidelineId]),
);
