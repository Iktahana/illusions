/**
 * Guideline metadata catalog.
 * 校正ガイドラインのメタデータカタログ。
 */

import type { GuidelineId } from "./correction-config";

export type GuidelineLicense = "Public" | "Paid" | "CC BY 4.0";

export interface Guideline {
  id: GuidelineId;
  nameJa: string;
  publisherJa: string;
  year: number | null;
  license: GuidelineLicense;
  descriptionJa: string;
}

export const GUIDELINES: Record<GuidelineId, Guideline> = {
  "joyo-kanji-2010": {
    id: "joyo-kanji-2010",
    nameJa: "常用漢字表",
    publisherJa: "内閣告示",
    year: 2010,
    license: "Public",
    descriptionJa: "日常的な文書に用いる漢字の標準表",
  },
  "okurigana-1973": {
    id: "okurigana-1973",
    nameJa: "送り仮名の付け方",
    publisherJa: "内閣告示",
    year: 1973,
    license: "Public",
    descriptionJa: "送り仮名の付け方に関する内閣告示",
  },
  "gairai-1991": {
    id: "gairai-1991",
    nameJa: "外来語の表記",
    publisherJa: "内閣告示",
    year: 1991,
    license: "Public",
    descriptionJa: "外来語・外国語の日本語表記基準",
  },
  "gendai-kanazukai-1986": {
    id: "gendai-kanazukai-1986",
    nameJa: "現代仮名遣い",
    publisherJa: "内閣告示",
    year: 1986,
    license: "Public",
    descriptionJa: "現代語の仮名遣いに関する基準",
  },
  "koyo-bun-2022": {
    id: "koyo-bun-2022",
    nameJa: "公用文作成の考え方",
    publisherJa: "文化審議会",
    year: 2022,
    license: "Public",
    descriptionJa: "官公庁の公文書作成に関する指針",
  },
  "jis-x-4051": {
    id: "jis-x-4051",
    nameJa: "JIS X 4051 日本語組版",
    publisherJa: "JSA",
    year: 2004,
    license: "Paid",
    descriptionJa: "日本語文書の組版に関するJIS規格",
  },
  "kisha-handbook-14": {
    id: "kisha-handbook-14",
    nameJa: "記者ハンドブック 第14版",
    publisherJa: "共同通信社",
    year: 2022,
    license: "Paid",
    descriptionJa: "新聞・報道向けの表記統一基準",
  },
  "jtf-style-3": {
    id: "jtf-style-3",
    nameJa: "JTF日本語標準スタイルガイド",
    publisherJa: "日本翻訳連盟",
    year: 2019,
    license: "CC BY 4.0",
    descriptionJa: "翻訳・ローカライズ向けの日本語スタイルガイド",
  },
  "jtca-style-3": {
    id: "jtca-style-3",
    nameJa: "日本語スタイルガイド 第3版",
    publisherJa: "JTCA",
    year: 2016,
    license: "Paid",
    descriptionJa: "テクニカルコミュニケーション向けスタイルガイド",
  },
  "editors-rulebook": {
    id: "editors-rulebook",
    nameJa: "日本語表記ルールブック 第2版",
    publisherJa: "日本エディタースクール",
    year: 2012,
    license: "Paid",
    descriptionJa: "編集・出版向けの日本語表記ルール集",
  },
  "novel-manuscript": {
    id: "novel-manuscript",
    nameJa: "小説原稿作法",
    publisherJa: "慣習ベース",
    year: null,
    license: "Public",
    descriptionJa: "小説・フィクション向けの慣用的な原稿作法",
  },
};

/**
 * Retrieve a guideline by ID.
 * @param id GuidelineId to look up
 * @returns The Guideline metadata record
 */
export function getGuideline(id: GuidelineId): Guideline {
  return GUIDELINES[id];
}
