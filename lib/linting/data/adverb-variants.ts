/**
 * Adverb variant groups for consistency checking.
 * Each group contains kanji and kana forms of the same adverb,
 * matched by kuromoji reading.
 */

export interface AdverbVariantGroup {
  /** Katakana reading from kuromoji (e.g., "マッタク") */
  readonly reading: string;
  /** Surface form variants, first = standard/preferred form */
  readonly variants: readonly string[];
}

export const ADVERB_VARIANT_GROUPS: readonly AdverbVariantGroup[] = [
  { reading: "マッタク", variants: ["全く", "まったく"] },
  { reading: "ホトンド", variants: ["殆ど", "ほとんど"] },
  { reading: "タダチニ", variants: ["直ちに", "ただちに"] },
  { reading: "アラカジメ", variants: ["予め", "あらかじめ"] },
  { reading: "スデニ", variants: ["既に", "すでに"] },
  { reading: "オソラク", variants: ["恐らく", "おそらく"] },
  { reading: "タトエバ", variants: ["例えば", "たとえば"] },
  { reading: "カナラズシモ", variants: ["必ずしも", "かならずしも"] },
  { reading: "カナラズ", variants: ["必ず", "かならず"] },
  { reading: "ワズカ", variants: ["僅か", "わずか"] },
  { reading: "サラニ", variants: ["更に", "さらに"] },
  { reading: "モットモ", variants: ["最も", "もっとも"] },
  { reading: "トクニ", variants: ["特に", "とくに"] },
  { reading: "オオイニ", variants: ["大いに", "おおいに"] },
  { reading: "フタタビ", variants: ["再び", "ふたたび"] },
  { reading: "ヤハリ", variants: ["矢張り", "やはり", "やっぱり"] },
  { reading: "タブン", variants: ["多分", "たぶん"] },
  { reading: "イッソウ", variants: ["一層", "いっそう"] },
  { reading: "タイヘン", variants: ["大変", "たいへん"] },
  { reading: "キワメテ", variants: ["極めて", "きわめて"] },
  { reading: "オモニ", variants: ["主に", "おもに"] },
  { reading: "タダ", variants: ["只", "ただ"] },
  { reading: "スコシ", variants: ["少し", "すこし"] },
  { reading: "ソウトウ", variants: ["相当", "そうとう"] },
  { reading: "ヒジョウニ", variants: ["非常に", "ひじょうに"] },
  { reading: "ジツニ", variants: ["実に", "じつに"] },
  { reading: "マサニ", variants: ["正に", "まさに"] },
  { reading: "ケッシテ", variants: ["決して", "けっして"] },
  { reading: "オヨソ", variants: ["凡そ", "およそ"] },
  { reading: "アエテ", variants: ["敢えて", "あえて"] },
];
