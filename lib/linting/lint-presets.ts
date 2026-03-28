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
  // #777 rules: editors-rulebook (原稿編集 第2版)
  // ---------------------------------------------------------------------------
  { id: "me2-kanji-font", nameJa: "旧字体検出", descriptionJa: "常用漢字表の通用字体を使用し、旧字体を検出します", guidelineId: "editors-rulebook" },
  { id: "me2-katakana-foreign", nameJa: "外来語・擬音語の片仮名表記", descriptionJa: "外来語・擬声語・擬音語は片仮名で表記します", guidelineId: "editors-rulebook" },
  { id: "me2-foreign-long-vowel", nameJa: "外来語末尾の長音符号", descriptionJa: "3音以上の外来語の末尾の長音符号「ー」を省略しません", guidelineId: "editors-rulebook" },
  { id: "me2-vertical-numbers", nameJa: "縦組の漢数字使用", descriptionJa: "縦組では漢数字を使用します", guidelineId: "editors-rulebook" },
  { id: "me2-horizontal-numbers", nameJa: "横組のアラビア数字使用", descriptionJa: "横組ではアラビア数字を使用します", guidelineId: "editors-rulebook" },
  { id: "me2-unit-symbols", nameJa: "単位記号の表記", descriptionJa: "横組では数値と欧字単位記号の間にスペースを入れます", guidelineId: "editors-rulebook" },
  { id: "me2-currency-percent", nameJa: "通貨・百分率記号の密着", descriptionJa: "通貨記号・百分率記号は数字に密着させます", guidelineId: "editors-rulebook" },
  { id: "me2-punctuation-consistency", nameJa: "句読点セットの統一", descriptionJa: "句読点セットが統一されているか確認します", guidelineId: "editors-rulebook" },
  { id: "me2-repetition-marks", nameJa: "くり返し符号の用法", descriptionJa: "くり返し符号（々、ゝ、ゞ）の適切な使用をチェックします", guidelineId: "editors-rulebook" },

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

  // ---------------------------------------------------------------------------
  // #782 rules: JTF日本語標準スタイルガイド (43 rules)
  // ---------------------------------------------------------------------------
  // Implemented JTF rules (21)
  { id: "JTF_1_2_1", nameJa: "句読点の統一", descriptionJa: "句点（。）と読点（、）について、JTFスタイルガイドの基準に従って表記を統一します", guidelineId: "jtf-style-3" },
  { id: "JTF_1_2_1_punctuation", nameJa: "句読点の全角統一", descriptionJa: "句読点には全角の「、」と「。」を使います。ピリオド（.）とカンマ（,）は使用しません", guidelineId: "jtf-style-3" },
  { id: "JTF_3_1_1", nameJa: "句点（。）の用法", descriptionJa: "句点（。）について、JTFスタイルガイドの基準に従って表記を統一します", guidelineId: "jtf-style-3" },
  { id: "JTF_3_1_1_kuten_brackets", nameJa: "閉じかっこ前の句点禁止", descriptionJa: "閉じかっこの前に句点（。）を打ちません", guidelineId: "jtf-style-3" },
  { id: "JTF_3_1_3", nameJa: "ピリオド・カンマの用法", descriptionJa: "ピリオド（.）、カンマ（,）について、JTFスタイルガイドの基準に従って表記を統一します", guidelineId: "jtf-style-3" },
  { id: "JTF_2_1_5_fullwidth_kana", nameJa: "カタカナの全角表記", descriptionJa: "漢字、ひらがな、カタカナは全角で表記します。半角カタカナは使用しません", guidelineId: "jtf-style-3" },
  { id: "JTF_2_1_8", nameJa: "算用数字の表記", descriptionJa: "算用数字について、JTFスタイルガイドの基準に従って表記を統一します", guidelineId: "jtf-style-3" },
  { id: "JTF_2_1_8_halfwidth_alnum", nameJa: "英数字の半角統一", descriptionJa: "算用数字とアルファベットは半角で表記します。全角の英数字は使用しません", guidelineId: "jtf-style-3" },
  { id: "JTF_2_1_10_digit_comma", nameJa: "算用数字の位取り", descriptionJa: "桁区切りには半角カンマ、小数点には半角ピリオドを使います", guidelineId: "jtf-style-3" },
  { id: "JTF_2_2_1_kanji", nameJa: "漢字表記の推奨", descriptionJa: "特定の副詞などは、ひらがなではなく漢字で表記します", guidelineId: "jtf-style-3" },
  { id: "JTF_2_3_no_space", nameJa: "半角・全角間のスペース禁止", descriptionJa: "半角文字と全角文字の間に半角スペースを入れません", guidelineId: "jtf-style-3" },
  { id: "JTF_3_3_1_parentheses_space", nameJa: "かっこ内外のスペース禁止", descriptionJa: "かっこの外側、内側ともにスペースを入れません", guidelineId: "jtf-style-3" },
  { id: "JTF_3_3_brackets_fullwidth", nameJa: "かっこの全角表記", descriptionJa: "丸かっこ、大かっこ、かぎかっこなどは原則として全角で表記します", guidelineId: "jtf-style-3" },
  { id: "JTF_4_3_2", nameJa: "長さの単位表記", descriptionJa: "長さについて、SI単位（m、cm、mm、km）を正しく表記します", guidelineId: "jtf-style-3" },
  { id: "JTF_4_3_3", nameJa: "質量の単位表記", descriptionJa: "質量について、SI単位（g、kg、t）を正しく表記します", guidelineId: "jtf-style-3" },
  { id: "JTF_4_3_4", nameJa: "面積・体積の単位表記", descriptionJa: "面積、体積について、SI単位（m²、m³、L）を正しく表記します", guidelineId: "jtf-style-3" },
  { id: "JTF_4_3_5", nameJa: "電気の単位表記", descriptionJa: "電気について、SI単位（V、A、W、Ω、Hz）を正しく表記します", guidelineId: "jtf-style-3" },
  { id: "JTF_4_3_6", nameJa: "温度の単位表記", descriptionJa: "温度について、摂氏（℃）を正しく表記します", guidelineId: "jtf-style-3" },
  { id: "JTF_4_3_7", nameJa: "周波数の単位表記", descriptionJa: "周波数について、SI単位（Hz、kHz、MHz、GHz）を正しく表記します", guidelineId: "jtf-style-3" },
  { id: "JTF_4_3_8", nameJa: "速度の単位表記", descriptionJa: "速度について、SI単位（m/s、km/h）を正しく表記します", guidelineId: "jtf-style-3" },
  { id: "JTF_4_3_9", nameJa: "伝送速度の単位表記", descriptionJa: "伝送速度について、単位（bps、kbps、Mbps、Gbps）を正しく表記します", guidelineId: "jtf-style-3" },
  // TODO stub JTF rules (22)
  { id: "JTF_1_2_2", nameJa: "ピリオド・カンマの表記統一", descriptionJa: "ピリオド（.）とカンマ（,）の表記を統一します（未実装）", guidelineId: "jtf-style-3" },
  { id: "JTF_2_1_10", nameJa: "算用数字の位取り（概要）", descriptionJa: "算用数字の位取りの表記を統一します（未実装）", guidelineId: "jtf-style-3" },
  { id: "JTF_2_1_9", nameJa: "アルファベットの表記統一", descriptionJa: "アルファベットの表記を統一します（未実装）", guidelineId: "jtf-style-3" },
  { id: "JTF_2_3_1_1", nameJa: "全角・半角文字間のスペース", descriptionJa: "全角文字と半角文字の間のスペースを統一します（未実装）", guidelineId: "jtf-style-3" },
  { id: "JTF_2_3_1_2", nameJa: "全角文字間のスペース", descriptionJa: "全角文字どうしの間のスペースを統一します（未実装）", guidelineId: "jtf-style-3" },
  { id: "JTF_2_3_1_3", nameJa: "半角文字間のスペース", descriptionJa: "半角文字どうしの間のスペースを統一します（未実装）", guidelineId: "jtf-style-3" },
  { id: "JTF_2_3_2", nameJa: "かっこ類と隣接文字のスペース", descriptionJa: "かっこ類と隣接する文字の間のスペースの有無を統一します（未実装）", guidelineId: "jtf-style-3" },
  { id: "JTF_3_2_3", nameJa: "スラッシュの全角表記", descriptionJa: "和文中のスラッシュは全角（／）を使用します（未実装）", guidelineId: "jtf-style-3" },
  { id: "JTF_3_2_5", nameJa: "波線（〜）の用法", descriptionJa: "波線（〜）の表記を統一します（未実装）", guidelineId: "jtf-style-3" },
  { id: "JTF_3_2_6", nameJa: "ハイフン（-）の用法", descriptionJa: "ハイフン（-）の表記を統一します（未実装）", guidelineId: "jtf-style-3" },
  { id: "JTF_3_2_7", nameJa: "コロン（：）の用法", descriptionJa: "コロン（：）の表記を統一します（未実装）", guidelineId: "jtf-style-3" },
  { id: "JTF_3_2_8", nameJa: "セミコロン（；）の用法", descriptionJa: "セミコロン（；）の表記を統一します（未実装）", guidelineId: "jtf-style-3" },
  { id: "JTF_3_3_1", nameJa: "丸かっこ（）の用法", descriptionJa: "丸かっこ（）の表記を統一します（未実装）", guidelineId: "jtf-style-3" },
  { id: "JTF_3_3_2", nameJa: "大かっこ［］の用法", descriptionJa: "大かっこ［］の表記を統一します（未実装）", guidelineId: "jtf-style-3" },
  { id: "JTF_3_3_3", nameJa: "かぎかっこ「」の用法", descriptionJa: "かぎかっこ「」の表記を統一します（未実装）", guidelineId: "jtf-style-3" },
  { id: "JTF_3_3_4", nameJa: "二重かぎかっこ『』の用法", descriptionJa: "二重かぎかっこ『』の表記を統一します（未実装）", guidelineId: "jtf-style-3" },
  { id: "JTF_3_3_5", nameJa: "二重引用符の用法", descriptionJa: "二重引用符\" \"の表記を統一します（未実装）", guidelineId: "jtf-style-3" },
  { id: "JTF_3_3_6", nameJa: "中かっこ{ }の用法", descriptionJa: "中かっこ{ }の表記を統一します（未実装）", guidelineId: "jtf-style-3" },
  { id: "JTF_3_3_7", nameJa: "山かっこ〈 〉の用法", descriptionJa: "山かっこ〈 〉の表記を統一します（未実装）", guidelineId: "jtf-style-3" },
  { id: "JTF_3_3_8", nameJa: "一重引用符の用法", descriptionJa: "一重引用符' 'の表記を統一します（未実装）", guidelineId: "jtf-style-3" },
  { id: "JTF_4_3_10", nameJa: "割合の単位表記", descriptionJa: "割合の表記を統一します（未実装）", guidelineId: "jtf-style-3" },
  { id: "JTF_4_3_11", nameJa: "角度の単位表記", descriptionJa: "角度の表記を統一します（未実装）", guidelineId: "jtf-style-3" },

  // ---------------------------------------------------------------------------
  // #782 rules: 現代仮名遣い (3 rules)
  // ---------------------------------------------------------------------------
  { id: "gk-particle-o", nameJa: "助詞「を」の表記", descriptionJa: "助詞の「を」を「お」と書いている箇所を検出します", guidelineId: "gendai-kanazukai-1986" },
  { id: "gk-particle-ha", nameJa: "助詞「は」の表記", descriptionJa: "助詞の「は」を「わ」と書いている箇所を検出します", guidelineId: "gendai-kanazukai-1986" },
  { id: "gk-particle-he", nameJa: "助詞「へ」の表記", descriptionJa: "助詞の「へ」を「え」と書いている箇所を検出します", guidelineId: "gendai-kanazukai-1986" },

  // ---------------------------------------------------------------------------
  // #782 rules: 日本語表記ルールブック (6 rules)
  // ---------------------------------------------------------------------------
  { id: "nh-ji-zu-di-du-exceptions", nameJa: "「じ・ず」と「ぢ・づ」の例外", descriptionJa: "現代仮名遣いにおける「じ・ず」と「ぢ・づ」の例外的な語彙をチェックします" },
  { id: "nh-gendai-kanazukai-notes", nameJa: "現代仮名遣いの注意点", descriptionJa: "現代仮名遣いの一般的な注意点をチェックします（未実装）" },
  { id: "nh-compound-noun-okurigana", nameJa: "複合名詞の送り仮名省略", descriptionJa: "慣用が固定しているため送り仮名を付けない複合名詞をチェックします" },
  { id: "nh-number-format", nameJa: "数字の表記（半角アラビア数字）", descriptionJa: "全角数字を検出し、半角アラビア数字への修正を提案します" },
  { id: "nh-unit-symbol", nameJa: "単位記号の表記（半角英字）", descriptionJa: "全角の単位記号を検出し、半角英字への修正を提案します" },
  { id: "nh-descriptive-symbols", nameJa: "記述記号（引用符・省略記号・ダッシュ）", descriptionJa: "日本語文中の引用符・省略記号・ダッシュの誤用を検出します" },
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
      // #777 rules (原稿編集 第2版)
      "me2-katakana-foreign", "me2-foreign-long-vowel",
      "me2-vertical-numbers", "me2-horizontal-numbers",
      "me2-unit-symbols", "me2-currency-percent",
      "me2-punctuation-consistency", "me2-repetition-marks",
      // #782 JTF rules (punctuation/notation)
      "JTF_1_2_1", "JTF_1_2_1_punctuation", "JTF_1_2_2",
      "JTF_3_1_1", "JTF_3_1_1_kuten_brackets", "JTF_3_1_3",
      "JTF_2_1_5_fullwidth_kana", "JTF_2_1_8", "JTF_2_1_8_halfwidth_alnum",
      "JTF_2_1_10", "JTF_2_1_10_digit_comma",
      "JTF_2_3_no_space", "JTF_2_3_1_1", "JTF_2_3_1_2", "JTF_2_3_1_3", "JTF_2_3_2",
      "JTF_3_3_1_parentheses_space", "JTF_3_3_brackets_fullwidth",
      "JTF_3_3_1", "JTF_3_3_2", "JTF_3_3_3", "JTF_3_3_4",
      "JTF_3_3_5", "JTF_3_3_6", "JTF_3_3_7", "JTF_3_3_8",
      "JTF_3_2_3", "JTF_3_2_5", "JTF_3_2_6", "JTF_3_2_7", "JTF_3_2_8",
      "JTF_4_3_2", "JTF_4_3_3", "JTF_4_3_4", "JTF_4_3_5",
      "JTF_4_3_6", "JTF_4_3_7", "JTF_4_3_8", "JTF_4_3_9",
      "JTF_4_3_10", "JTF_4_3_11",
      // #782 nihongo-hyouki rules (notation)
      "nh-number-format", "nh-unit-symbol", "nh-descriptive-symbols",
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
      // #777 rules (原稿編集 第2版)
      "me2-kanji-font",
      // #782 JTF rules (kanji/kana)
      "JTF_2_2_1_kanji", "JTF_2_1_9",
      // #782 gendai-kanazukai rules
      "gk-particle-o", "gk-particle-ha", "gk-particle-he",
      // #782 nihongo-hyouki rules (kana)
      "nh-ji-zu-di-du-exceptions", "nh-gendai-kanazukai-notes",
      "nh-compound-noun-okurigana",
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
];

/** Per-rule config shape used in presets and settings */
export interface LintRulePresetConfig {
  enabled: boolean;
  severity: Severity;
  skipDialogue?: boolean;
}

/** Default configs per rule (matching each rule's defaultConfig) -- used as standard mode */
export const LINT_DEFAULT_CONFIGS: Record<string, LintRulePresetConfig> = {
  // --- Existing rules ---
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
  "adverb-form-consistency": { enabled: true, severity: "info" },
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

  // --- #777 rules: editors-rulebook (原稿編集 第2版) ---
  "me2-kanji-font": { enabled: true, severity: "warning" },
  "me2-katakana-foreign": { enabled: true, severity: "info" },
  "me2-foreign-long-vowel": { enabled: true, severity: "warning" },
  "me2-vertical-numbers": { enabled: false, severity: "info" },
  "me2-horizontal-numbers": { enabled: false, severity: "info" },
  "me2-unit-symbols": { enabled: false, severity: "info" },
  "me2-currency-percent": { enabled: true, severity: "warning" },
  "me2-punctuation-consistency": { enabled: true, severity: "warning" },
  "me2-repetition-marks": { enabled: true, severity: "info" },

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

  // --- #782 rules: JTF日本語標準スタイルガイド (implemented) ---
  "JTF_1_2_1": { enabled: true, severity: "warning" },
  "JTF_1_2_1_punctuation": { enabled: true, severity: "warning" },
  "JTF_3_1_1": { enabled: true, severity: "warning" },
  "JTF_3_1_1_kuten_brackets": { enabled: true, severity: "warning" },
  "JTF_3_1_3": { enabled: true, severity: "warning" },
  "JTF_2_1_5_fullwidth_kana": { enabled: true, severity: "warning" },
  "JTF_2_1_8": { enabled: true, severity: "warning" },
  "JTF_2_1_8_halfwidth_alnum": { enabled: true, severity: "warning" },
  "JTF_2_1_10_digit_comma": { enabled: true, severity: "warning" },
  "JTF_2_2_1_kanji": { enabled: true, severity: "info" },
  "JTF_2_3_no_space": { enabled: true, severity: "info" },
  "JTF_3_3_1_parentheses_space": { enabled: true, severity: "warning" },
  "JTF_3_3_brackets_fullwidth": { enabled: true, severity: "warning" },
  "JTF_4_3_2": { enabled: true, severity: "warning" },
  "JTF_4_3_3": { enabled: true, severity: "warning" },
  "JTF_4_3_4": { enabled: true, severity: "warning" },
  "JTF_4_3_5": { enabled: true, severity: "warning" },
  "JTF_4_3_6": { enabled: true, severity: "warning" },
  "JTF_4_3_7": { enabled: true, severity: "warning" },
  "JTF_4_3_8": { enabled: true, severity: "warning" },
  "JTF_4_3_9": { enabled: true, severity: "warning" },
  // --- #782 rules: JTF (TODO stubs, disabled) ---
  "JTF_1_2_2": { enabled: false, severity: "info" },
  "JTF_2_1_10": { enabled: false, severity: "info" },
  "JTF_2_1_9": { enabled: false, severity: "info" },
  "JTF_2_3_1_1": { enabled: false, severity: "info" },
  "JTF_2_3_1_2": { enabled: false, severity: "info" },
  "JTF_2_3_1_3": { enabled: false, severity: "info" },
  "JTF_2_3_2": { enabled: false, severity: "info" },
  "JTF_3_2_3": { enabled: false, severity: "info" },
  "JTF_3_2_5": { enabled: false, severity: "info" },
  "JTF_3_2_6": { enabled: false, severity: "info" },
  "JTF_3_2_7": { enabled: false, severity: "info" },
  "JTF_3_2_8": { enabled: false, severity: "info" },
  "JTF_3_3_1": { enabled: false, severity: "info" },
  "JTF_3_3_2": { enabled: false, severity: "info" },
  "JTF_3_3_3": { enabled: false, severity: "info" },
  "JTF_3_3_4": { enabled: false, severity: "info" },
  "JTF_3_3_5": { enabled: false, severity: "info" },
  "JTF_3_3_6": { enabled: false, severity: "info" },
  "JTF_3_3_7": { enabled: false, severity: "info" },
  "JTF_3_3_8": { enabled: false, severity: "info" },
  "JTF_4_3_10": { enabled: false, severity: "info" },
  "JTF_4_3_11": { enabled: false, severity: "info" },

  // --- #782 rules: 現代仮名遣い ---
  "gk-particle-o": { enabled: true, severity: "error" },
  "gk-particle-ha": { enabled: true, severity: "error" },
  "gk-particle-he": { enabled: true, severity: "error" },

  // --- #782 rules: 日本語表記ルールブック ---
  "nh-ji-zu-di-du-exceptions": { enabled: true, severity: "error" },
  "nh-gendai-kanazukai-notes": { enabled: false, severity: "info" },
  "nh-compound-noun-okurigana": { enabled: true, severity: "warning" },
  "nh-number-format": { enabled: true, severity: "warning" },
  "nh-unit-symbol": { enabled: true, severity: "warning" },
  "nh-descriptive-symbols": { enabled: true, severity: "warning" },
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
      "comma-frequency": { enabled: false, severity: "info" },
      "desu-masu-consistency": { enabled: false, severity: "info" },
      "conjunction-overuse": { enabled: false, severity: "info" },
      "word-repetition": { enabled: false, severity: "info" },
      "taigen-dome-overuse": { enabled: false, severity: "info" },
      "passive-overuse": { enabled: false, severity: "info" },
      "counter-word-mismatch": { enabled: false, severity: "info" },
      "adverb-form-consistency": { enabled: false, severity: "info" },
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
      // --- #777 rules (原稿編集 第2版) ---
      "me2-kanji-font": { enabled: true, severity: "info" },
      "me2-katakana-foreign": { enabled: false, severity: "info" },
      "me2-foreign-long-vowel": { enabled: false, severity: "info" },
      "me2-vertical-numbers": { enabled: false, severity: "info" },
      "me2-horizontal-numbers": { enabled: false, severity: "info" },
      "me2-unit-symbols": { enabled: false, severity: "info" },
      "me2-currency-percent": { enabled: true, severity: "info" },
      "me2-punctuation-consistency": { enabled: false, severity: "info" },
      "me2-repetition-marks": { enabled: false, severity: "info" },
      // --- #782 JTF rules (implemented: mostly disabled in relaxed) ---
      "JTF_1_2_1": { enabled: true, severity: "info" },
      "JTF_1_2_1_punctuation": { enabled: true, severity: "info" },
      "JTF_3_1_1": { enabled: false, severity: "info" },
      "JTF_3_1_1_kuten_brackets": { enabled: false, severity: "info" },
      "JTF_3_1_3": { enabled: false, severity: "info" },
      "JTF_2_1_5_fullwidth_kana": { enabled: true, severity: "info" },
      "JTF_2_1_8": { enabled: false, severity: "info" },
      "JTF_2_1_8_halfwidth_alnum": { enabled: false, severity: "info" },
      "JTF_2_1_10_digit_comma": { enabled: false, severity: "info" },
      "JTF_2_2_1_kanji": { enabled: false, severity: "info" },
      "JTF_2_3_no_space": { enabled: false, severity: "info" },
      "JTF_3_3_1_parentheses_space": { enabled: false, severity: "info" },
      "JTF_3_3_brackets_fullwidth": { enabled: false, severity: "info" },
      "JTF_4_3_2": { enabled: false, severity: "info" },
      "JTF_4_3_3": { enabled: false, severity: "info" },
      "JTF_4_3_4": { enabled: false, severity: "info" },
      "JTF_4_3_5": { enabled: false, severity: "info" },
      "JTF_4_3_6": { enabled: false, severity: "info" },
      "JTF_4_3_7": { enabled: false, severity: "info" },
      "JTF_4_3_8": { enabled: false, severity: "info" },
      "JTF_4_3_9": { enabled: false, severity: "info" },
      // JTF TODO stubs (always disabled)
      "JTF_1_2_2": { enabled: false, severity: "info" },
      "JTF_2_1_10": { enabled: false, severity: "info" },
      "JTF_2_1_9": { enabled: false, severity: "info" },
      "JTF_2_3_1_1": { enabled: false, severity: "info" },
      "JTF_2_3_1_2": { enabled: false, severity: "info" },
      "JTF_2_3_1_3": { enabled: false, severity: "info" },
      "JTF_2_3_2": { enabled: false, severity: "info" },
      "JTF_3_2_3": { enabled: false, severity: "info" },
      "JTF_3_2_5": { enabled: false, severity: "info" },
      "JTF_3_2_6": { enabled: false, severity: "info" },
      "JTF_3_2_7": { enabled: false, severity: "info" },
      "JTF_3_2_8": { enabled: false, severity: "info" },
      "JTF_3_3_1": { enabled: false, severity: "info" },
      "JTF_3_3_2": { enabled: false, severity: "info" },
      "JTF_3_3_3": { enabled: false, severity: "info" },
      "JTF_3_3_4": { enabled: false, severity: "info" },
      "JTF_3_3_5": { enabled: false, severity: "info" },
      "JTF_3_3_6": { enabled: false, severity: "info" },
      "JTF_3_3_7": { enabled: false, severity: "info" },
      "JTF_3_3_8": { enabled: false, severity: "info" },
      "JTF_4_3_10": { enabled: false, severity: "info" },
      "JTF_4_3_11": { enabled: false, severity: "info" },
      // --- #782 現代仮名遣い rules ---
      "gk-particle-o": { enabled: true, severity: "info" },
      "gk-particle-ha": { enabled: true, severity: "info" },
      "gk-particle-he": { enabled: true, severity: "info" },
      // --- #782 日本語表記ルールブック rules ---
      "nh-ji-zu-di-du-exceptions": { enabled: true, severity: "info" },
      "nh-gendai-kanazukai-notes": { enabled: false, severity: "info" },
      "nh-compound-noun-okurigana": { enabled: false, severity: "info" },
      "nh-number-format": { enabled: false, severity: "info" },
      "nh-unit-symbol": { enabled: false, severity: "info" },
      "nh-descriptive-symbols": { enabled: false, severity: "info" },
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
      // --- #777 rules (原稿編集 第2版) ---
      "me2-kanji-font": { enabled: true, severity: "error" },
      "me2-katakana-foreign": { enabled: true, severity: "warning" },
      "me2-foreign-long-vowel": { enabled: true, severity: "warning" },
      "me2-vertical-numbers": { enabled: false, severity: "info" },
      "me2-horizontal-numbers": { enabled: false, severity: "info" },
      "me2-unit-symbols": { enabled: false, severity: "info" },
      "me2-currency-percent": { enabled: true, severity: "error" },
      "me2-punctuation-consistency": { enabled: true, severity: "error" },
      "me2-repetition-marks": { enabled: true, severity: "warning" },
      // --- #782 JTF rules (all enabled in strict) ---
      "JTF_1_2_1": { enabled: true, severity: "error" },
      "JTF_1_2_1_punctuation": { enabled: true, severity: "error" },
      "JTF_3_1_1": { enabled: true, severity: "error" },
      "JTF_3_1_1_kuten_brackets": { enabled: true, severity: "error" },
      "JTF_3_1_3": { enabled: true, severity: "error" },
      "JTF_2_1_5_fullwidth_kana": { enabled: true, severity: "error" },
      "JTF_2_1_8": { enabled: true, severity: "error" },
      "JTF_2_1_8_halfwidth_alnum": { enabled: true, severity: "error" },
      "JTF_2_1_10_digit_comma": { enabled: true, severity: "warning" },
      "JTF_2_2_1_kanji": { enabled: true, severity: "warning" },
      "JTF_2_3_no_space": { enabled: true, severity: "warning" },
      "JTF_3_3_1_parentheses_space": { enabled: true, severity: "error" },
      "JTF_3_3_brackets_fullwidth": { enabled: true, severity: "error" },
      "JTF_4_3_2": { enabled: true, severity: "warning" },
      "JTF_4_3_3": { enabled: true, severity: "warning" },
      "JTF_4_3_4": { enabled: true, severity: "warning" },
      "JTF_4_3_5": { enabled: true, severity: "warning" },
      "JTF_4_3_6": { enabled: true, severity: "warning" },
      "JTF_4_3_7": { enabled: true, severity: "warning" },
      "JTF_4_3_8": { enabled: true, severity: "warning" },
      "JTF_4_3_9": { enabled: true, severity: "warning" },
      // JTF TODO stubs (always disabled)
      "JTF_1_2_2": { enabled: false, severity: "info" },
      "JTF_2_1_10": { enabled: false, severity: "info" },
      "JTF_2_1_9": { enabled: false, severity: "info" },
      "JTF_2_3_1_1": { enabled: false, severity: "info" },
      "JTF_2_3_1_2": { enabled: false, severity: "info" },
      "JTF_2_3_1_3": { enabled: false, severity: "info" },
      "JTF_2_3_2": { enabled: false, severity: "info" },
      "JTF_3_2_3": { enabled: false, severity: "info" },
      "JTF_3_2_5": { enabled: false, severity: "info" },
      "JTF_3_2_6": { enabled: false, severity: "info" },
      "JTF_3_2_7": { enabled: false, severity: "info" },
      "JTF_3_2_8": { enabled: false, severity: "info" },
      "JTF_3_3_1": { enabled: false, severity: "info" },
      "JTF_3_3_2": { enabled: false, severity: "info" },
      "JTF_3_3_3": { enabled: false, severity: "info" },
      "JTF_3_3_4": { enabled: false, severity: "info" },
      "JTF_3_3_5": { enabled: false, severity: "info" },
      "JTF_3_3_6": { enabled: false, severity: "info" },
      "JTF_3_3_7": { enabled: false, severity: "info" },
      "JTF_3_3_8": { enabled: false, severity: "info" },
      "JTF_4_3_10": { enabled: false, severity: "info" },
      "JTF_4_3_11": { enabled: false, severity: "info" },
      // --- #782 現代仮名遣い rules ---
      "gk-particle-o": { enabled: true, severity: "error" },
      "gk-particle-ha": { enabled: true, severity: "error" },
      "gk-particle-he": { enabled: true, severity: "error" },
      // --- #782 日本語表記ルールブック rules ---
      "nh-ji-zu-di-du-exceptions": { enabled: true, severity: "error" },
      "nh-gendai-kanazukai-notes": { enabled: false, severity: "info" },
      "nh-compound-noun-okurigana": { enabled: true, severity: "warning" },
      "nh-number-format": { enabled: true, severity: "warning" },
      "nh-unit-symbol": { enabled: true, severity: "warning" },
      "nh-descriptive-symbols": { enabled: true, severity: "warning" },
    },
  },
  novel: {
    nameJa: "小説モード",
    configs: {
      // --- Existing rules ---
      "punctuation-rules": { enabled: true, severity: "warning" },
      "number-format": { enabled: false, severity: "info", skipDialogue: true },
      "joyo-kanji": { enabled: false, severity: "info", skipDialogue: true },
      "era-year-validator": { enabled: false, severity: "info" },
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
      "comma-frequency": { enabled: false, severity: "info" },
      "desu-masu-consistency": { enabled: false, severity: "info" },
      "conjunction-overuse": { enabled: true, severity: "info" },
      "word-repetition": { enabled: true, severity: "info" },
      "taigen-dome-overuse": { enabled: true, severity: "info" },
      "passive-overuse": { enabled: true, severity: "info" },
      "counter-word-mismatch": { enabled: false, severity: "warning" },
      "adverb-form-consistency": { enabled: true, severity: "info" },
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
      // --- #777 rules (原稿編集 第2版) ---
      "me2-kanji-font": { enabled: true, severity: "info" },
      "me2-katakana-foreign": { enabled: false, severity: "info" },
      "me2-foreign-long-vowel": { enabled: true, severity: "info" },
      "me2-vertical-numbers": { enabled: false, severity: "info" },
      "me2-horizontal-numbers": { enabled: false, severity: "info" },
      "me2-unit-symbols": { enabled: false, severity: "info" },
      "me2-currency-percent": { enabled: true, severity: "info" },
      "me2-punctuation-consistency": { enabled: true, severity: "info" },
      "me2-repetition-marks": { enabled: true, severity: "info" },
      // --- #782 JTF rules (mostly disabled for creative writing) ---
      "JTF_1_2_1": { enabled: true, severity: "info" },
      "JTF_1_2_1_punctuation": { enabled: true, severity: "info" },
      "JTF_3_1_1": { enabled: false, severity: "info" },
      "JTF_3_1_1_kuten_brackets": { enabled: false, severity: "info" },
      "JTF_3_1_3": { enabled: false, severity: "info" },
      "JTF_2_1_5_fullwidth_kana": { enabled: true, severity: "info" },
      "JTF_2_1_8": { enabled: false, severity: "info" },
      "JTF_2_1_8_halfwidth_alnum": { enabled: false, severity: "info" },
      "JTF_2_1_10_digit_comma": { enabled: false, severity: "info" },
      "JTF_2_2_1_kanji": { enabled: false, severity: "info" },
      "JTF_2_3_no_space": { enabled: false, severity: "info" },
      "JTF_3_3_1_parentheses_space": { enabled: false, severity: "info" },
      "JTF_3_3_brackets_fullwidth": { enabled: false, severity: "info" },
      "JTF_4_3_2": { enabled: false, severity: "info" },
      "JTF_4_3_3": { enabled: false, severity: "info" },
      "JTF_4_3_4": { enabled: false, severity: "info" },
      "JTF_4_3_5": { enabled: false, severity: "info" },
      "JTF_4_3_6": { enabled: false, severity: "info" },
      "JTF_4_3_7": { enabled: false, severity: "info" },
      "JTF_4_3_8": { enabled: false, severity: "info" },
      "JTF_4_3_9": { enabled: false, severity: "info" },
      // JTF TODO stubs (always disabled)
      "JTF_1_2_2": { enabled: false, severity: "info" },
      "JTF_2_1_10": { enabled: false, severity: "info" },
      "JTF_2_1_9": { enabled: false, severity: "info" },
      "JTF_2_3_1_1": { enabled: false, severity: "info" },
      "JTF_2_3_1_2": { enabled: false, severity: "info" },
      "JTF_2_3_1_3": { enabled: false, severity: "info" },
      "JTF_2_3_2": { enabled: false, severity: "info" },
      "JTF_3_2_3": { enabled: false, severity: "info" },
      "JTF_3_2_5": { enabled: false, severity: "info" },
      "JTF_3_2_6": { enabled: false, severity: "info" },
      "JTF_3_2_7": { enabled: false, severity: "info" },
      "JTF_3_2_8": { enabled: false, severity: "info" },
      "JTF_3_3_1": { enabled: false, severity: "info" },
      "JTF_3_3_2": { enabled: false, severity: "info" },
      "JTF_3_3_3": { enabled: false, severity: "info" },
      "JTF_3_3_4": { enabled: false, severity: "info" },
      "JTF_3_3_5": { enabled: false, severity: "info" },
      "JTF_3_3_6": { enabled: false, severity: "info" },
      "JTF_3_3_7": { enabled: false, severity: "info" },
      "JTF_3_3_8": { enabled: false, severity: "info" },
      "JTF_4_3_10": { enabled: false, severity: "info" },
      "JTF_4_3_11": { enabled: false, severity: "info" },
      // --- #782 現代仮名遣い rules ---
      "gk-particle-o": { enabled: true, severity: "warning" },
      "gk-particle-ha": { enabled: true, severity: "warning" },
      "gk-particle-he": { enabled: true, severity: "warning" },
      // --- #782 日本語表記ルールブック rules ---
      "nh-ji-zu-di-du-exceptions": { enabled: true, severity: "warning" },
      "nh-gendai-kanazukai-notes": { enabled: false, severity: "info" },
      "nh-compound-noun-okurigana": { enabled: false, severity: "info" },
      "nh-number-format": { enabled: false, severity: "info" },
      "nh-unit-symbol": { enabled: false, severity: "info" },
      "nh-descriptive-symbols": { enabled: true, severity: "info" },
    },
  },
  // The official preset intentionally omits skipDialogue on most rules because
  // government documents rarely contain dialogue; adding the toggle would be
  // misleading for users of this preset.
  official: {
    nameJa: "公用文モード",
    configs: {
      // --- Existing rules ---
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
      // --- #777 rules (原稿編集 第2版) ---
      "me2-kanji-font": { enabled: true, severity: "warning" },
      "me2-katakana-foreign": { enabled: true, severity: "warning" },
      "me2-foreign-long-vowel": { enabled: true, severity: "warning" },
      "me2-vertical-numbers": { enabled: false, severity: "info" },
      "me2-horizontal-numbers": { enabled: false, severity: "info" },
      "me2-unit-symbols": { enabled: false, severity: "info" },
      "me2-currency-percent": { enabled: true, severity: "warning" },
      "me2-punctuation-consistency": { enabled: true, severity: "warning" },
      "me2-repetition-marks": { enabled: true, severity: "warning" },
      // --- #782 JTF rules (all enabled in official) ---
      "JTF_1_2_1": { enabled: true, severity: "error" },
      "JTF_1_2_1_punctuation": { enabled: true, severity: "error" },
      "JTF_3_1_1": { enabled: true, severity: "error" },
      "JTF_3_1_1_kuten_brackets": { enabled: true, severity: "error" },
      "JTF_3_1_3": { enabled: true, severity: "error" },
      "JTF_2_1_5_fullwidth_kana": { enabled: true, severity: "error" },
      "JTF_2_1_8": { enabled: true, severity: "warning" },
      "JTF_2_1_8_halfwidth_alnum": { enabled: true, severity: "warning" },
      "JTF_2_1_10_digit_comma": { enabled: true, severity: "warning" },
      "JTF_2_2_1_kanji": { enabled: true, severity: "warning" },
      "JTF_2_3_no_space": { enabled: true, severity: "warning" },
      "JTF_3_3_1_parentheses_space": { enabled: true, severity: "error" },
      "JTF_3_3_brackets_fullwidth": { enabled: true, severity: "error" },
      "JTF_4_3_2": { enabled: true, severity: "warning" },
      "JTF_4_3_3": { enabled: true, severity: "warning" },
      "JTF_4_3_4": { enabled: true, severity: "warning" },
      "JTF_4_3_5": { enabled: true, severity: "warning" },
      "JTF_4_3_6": { enabled: true, severity: "warning" },
      "JTF_4_3_7": { enabled: true, severity: "warning" },
      "JTF_4_3_8": { enabled: true, severity: "warning" },
      "JTF_4_3_9": { enabled: true, severity: "warning" },
      // JTF TODO stubs (always disabled)
      "JTF_1_2_2": { enabled: false, severity: "info" },
      "JTF_2_1_10": { enabled: false, severity: "info" },
      "JTF_2_1_9": { enabled: false, severity: "info" },
      "JTF_2_3_1_1": { enabled: false, severity: "info" },
      "JTF_2_3_1_2": { enabled: false, severity: "info" },
      "JTF_2_3_1_3": { enabled: false, severity: "info" },
      "JTF_2_3_2": { enabled: false, severity: "info" },
      "JTF_3_2_3": { enabled: false, severity: "info" },
      "JTF_3_2_5": { enabled: false, severity: "info" },
      "JTF_3_2_6": { enabled: false, severity: "info" },
      "JTF_3_2_7": { enabled: false, severity: "info" },
      "JTF_3_2_8": { enabled: false, severity: "info" },
      "JTF_3_3_1": { enabled: false, severity: "info" },
      "JTF_3_3_2": { enabled: false, severity: "info" },
      "JTF_3_3_3": { enabled: false, severity: "info" },
      "JTF_3_3_4": { enabled: false, severity: "info" },
      "JTF_3_3_5": { enabled: false, severity: "info" },
      "JTF_3_3_6": { enabled: false, severity: "info" },
      "JTF_3_3_7": { enabled: false, severity: "info" },
      "JTF_3_3_8": { enabled: false, severity: "info" },
      "JTF_4_3_10": { enabled: false, severity: "info" },
      "JTF_4_3_11": { enabled: false, severity: "info" },
      // --- #782 現代仮名遣い rules ---
      "gk-particle-o": { enabled: true, severity: "error" },
      "gk-particle-ha": { enabled: true, severity: "error" },
      "gk-particle-he": { enabled: true, severity: "error" },
      // --- #782 日本語表記ルールブック rules ---
      "nh-ji-zu-di-du-exceptions": { enabled: true, severity: "error" },
      "nh-gendai-kanazukai-notes": { enabled: false, severity: "info" },
      "nh-compound-noun-okurigana": { enabled: true, severity: "warning" },
      "nh-number-format": { enabled: true, severity: "warning" },
      "nh-unit-symbol": { enabled: true, severity: "warning" },
      "nh-descriptive-symbols": { enabled: true, severity: "warning" },
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
