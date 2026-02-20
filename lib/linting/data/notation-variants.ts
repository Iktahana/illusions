/**
 * Notation variant dictionary for Japanese text.
 *
 * Defines groups of known variant forms for the same word.
 * Used by the notation consistency rule to detect mixed usage
 * within a single document.
 */

export type VariantCategory = "okurigana" | "kanji-kana" | "katakana-chouon";

/** Japanese label for each variant category */
export const VARIANT_CATEGORY_LABELS: Readonly<Record<VariantCategory, string>> = {
  okurigana: "送り仮名",
  "kanji-kana": "漢字・かな",
  "katakana-chouon": "カタカナ長音",
};

export interface VariantGroup {
  /** Unique identifier for the group */
  readonly id: string;
  /** Category of the variant */
  readonly category: VariantCategory;
  /** All known variant forms (first is the "standard" form per government guidelines) */
  readonly variants: readonly string[];
}

/**
 * Pre-defined variant groups.
 *
 * For okurigana, standard forms follow: 文化庁「送り仮名の付け方」(1973, 内閣告示第二号)
 * For kanji-kana, standard forms follow: 文化庁「公用文作成の考え方」(2022)
 * For katakana, standard forms follow: 文化庁「外来語の表記」(1991, 内閣告示第二号)
 */
export const VARIANT_GROUPS: ReadonlyArray<VariantGroup> = [
  // --- 送り仮名の揺れ (Okurigana variation) ---
  { id: "uchiawase", category: "okurigana", variants: ["打ち合わせ", "打合せ", "打合わせ", "打ち合せ"] },
  { id: "uketsuke", category: "okurigana", variants: ["受け付け", "受付", "受付け", "受け付"] },
  { id: "toriatsukai", category: "okurigana", variants: ["取り扱い", "取扱い", "取扱"] },
  { id: "moushikomi", category: "okurigana", variants: ["申し込み", "申込み", "申込"] },
  { id: "hikiwatashi", category: "okurigana", variants: ["引き渡し", "引渡し", "引渡"] },
  { id: "kumiawase", category: "okurigana", variants: ["組み合わせ", "組合せ", "組合わせ"] },
  { id: "warikomi", category: "okurigana", variants: ["割り込み", "割込み", "割込"] },
  { id: "tachiai", category: "okurigana", variants: ["立ち会い", "立会い", "立会"] },
  { id: "tsukekae", category: "okurigana", variants: ["付け替え", "付替え", "付替"] },
  { id: "kumitate", category: "okurigana", variants: ["組み立て", "組立て", "組立"] },
  { id: "okonau", category: "okurigana", variants: ["行う", "行なう"] },
  { id: "arawasu", category: "okurigana", variants: ["表す", "表わす"] },
  { id: "tsukuriau", category: "okurigana", variants: ["繰り返し", "繰返し", "繰返"] },
  { id: "moushide", category: "okurigana", variants: ["申し出", "申出"] },
  { id: "uketori", category: "okurigana", variants: ["受け取り", "受取り", "受取"] },
  { id: "kirikae", category: "okurigana", variants: ["切り替え", "切替え", "切替"] },

  // --- 漢字・かなの揺れ (Kanji/kana variation) ---
  { id: "kodomo", category: "kanji-kana", variants: ["子供", "子ども", "こども"] },
  { id: "dekiru", category: "kanji-kana", variants: ["出来る", "できる"] },
  { id: "koto", category: "kanji-kana", variants: ["事", "こと"] },
  { id: "mono", category: "kanji-kana", variants: ["物", "もの"] },
  { id: "toki", category: "kanji-kana", variants: ["時", "とき"] },
  { id: "tokoro", category: "kanji-kana", variants: ["所", "ところ"] },
  { id: "tame", category: "kanji-kana", variants: ["為", "ため"] },
  { id: "hodo", category: "kanji-kana", variants: ["程", "ほど"] },
  { id: "yue", category: "kanji-kana", variants: ["故", "ゆえ"] },
  { id: "nado", category: "kanji-kana", variants: ["等", "など"] },
  { id: "kudasai", category: "kanji-kana", variants: ["下さい", "ください"] },
  { id: "itadaku", category: "kanji-kana", variants: ["頂く", "いただく"] },
  { id: "arigatou", category: "kanji-kana", variants: ["有り難う", "ありがとう"] },
  { id: "watashi", category: "kanji-kana", variants: ["私", "わたし", "わたくし"] },
  { id: "mottomo", category: "kanji-kana", variants: ["最も", "もっとも"] },
  { id: "sugu", category: "kanji-kana", variants: ["直ぐ", "すぐ"] },
  { id: "subete", category: "kanji-kana", variants: ["全て", "すべて"] },
  { id: "osoraku", category: "kanji-kana", variants: ["恐らく", "おそらく"] },
  { id: "samazama", category: "kanji-kana", variants: ["様々", "さまざま"] },
  { id: "nazenara", category: "kanji-kana", variants: ["何故なら", "なぜなら"] },
  { id: "mata", category: "kanji-kana", variants: ["又", "また"] },
  { id: "oyobi", category: "kanji-kana", variants: ["及び", "および"] },
  { id: "narabini", category: "kanji-kana", variants: ["並びに", "ならびに"] },
  { id: "aruiwa", category: "kanji-kana", variants: ["或いは", "あるいは"] },

  // --- カタカナ長音の揺れ (Katakana long vowel variation) ---
  { id: "computer", category: "katakana-chouon", variants: ["コンピューター", "コンピュータ"] },
  { id: "server", category: "katakana-chouon", variants: ["サーバー", "サーバ"] },
  { id: "printer", category: "katakana-chouon", variants: ["プリンター", "プリンタ"] },
  { id: "browser", category: "katakana-chouon", variants: ["ブラウザー", "ブラウザ"] },
  { id: "user", category: "katakana-chouon", variants: ["ユーザー", "ユーザ"] },
  { id: "folder", category: "katakana-chouon", variants: ["フォルダー", "フォルダ"] },
  { id: "parameter", category: "katakana-chouon", variants: ["パラメーター", "パラメータ"] },
  { id: "manager", category: "katakana-chouon", variants: ["マネージャー", "マネージャ"] },
  { id: "adapter", category: "katakana-chouon", variants: ["アダプター", "アダプタ"] },
  { id: "indicator", category: "katakana-chouon", variants: ["インジケーター", "インジケータ"] },
  { id: "calendar", category: "katakana-chouon", variants: ["カレンダー", "カレンダ"] },
  { id: "character", category: "katakana-chouon", variants: ["キャラクター", "キャラクタ"] },
  { id: "elevator", category: "katakana-chouon", variants: ["エレベーター", "エレベータ"] },
  { id: "editor", category: "katakana-chouon", variants: ["エディター", "エディタ"] },
  { id: "monitor", category: "katakana-chouon", variants: ["モニター", "モニタ"] },
  { id: "scanner", category: "katakana-chouon", variants: ["スキャナー", "スキャナ"] },
  { id: "router", category: "katakana-chouon", variants: ["ルーター", "ルータ"] },
  { id: "driver", category: "katakana-chouon", variants: ["ドライバー", "ドライバ"] },
  { id: "filter", category: "katakana-chouon", variants: ["フィルター", "フィルタ"] },
  { id: "header", category: "katakana-chouon", variants: ["ヘッダー", "ヘッダ"] },
  { id: "footer", category: "katakana-chouon", variants: ["フッター", "フッタ"] },
  { id: "buffer", category: "katakana-chouon", variants: ["バッファー", "バッファ"] },
  { id: "trigger", category: "katakana-chouon", variants: ["トリガー", "トリガ"] },
  { id: "slider", category: "katakana-chouon", variants: ["スライダー", "スライダ"] },
  { id: "container", category: "katakana-chouon", variants: ["コンテナー", "コンテナ"] },
  { id: "counter", category: "katakana-chouon", variants: ["カウンター", "カウンタ"] },
];
