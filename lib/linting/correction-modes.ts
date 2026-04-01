/**
 * Correction mode presets.
 * 校正モードのプリセット定義。
 */

import type { CorrectionModeId, GuidelineId } from "./correction-config";
import type { LintRuleConfig } from "./types";

export interface CorrectionMode {
  id: CorrectionModeId;
  nameJa: string;
  toneJa: string;
  descriptionJa: string;
  defaultGuidelines: GuidelineId[];
  ruleOverrides: Record<string, Partial<LintRuleConfig>>;
}

export const CORRECTION_MODES: Record<CorrectionModeId, CorrectionMode> = {
  novel: {
    id: "novel",
    nameJa: "小説",
    toneJa: "感性・具象・張力",
    descriptionJa: "小説・フィクション向けの校正モード。文体の個性を尊重します。",
    defaultGuidelines: [
      "novel-manuscript",
      "gendai-kanazukai-1986",
      "editors-rulebook",
      "joyo-kanji-2010",
    ],
    ruleOverrides: {},
  },
  official: {
    id: "official",
    nameJa: "公用文",
    toneJa: "厳粛・対等・標準化",
    descriptionJa: "官公庁・公的機関の文書向けモード。内閣告示の各種基準に準拠します。",
    defaultGuidelines: [
      "jtf-style-3",
      "editors-rulebook",
      "gendai-kanazukai-1986",
      "koyo-bun-2022",
      "joyo-kanji-2010",
      "okurigana-1973",
      "gairai-1991",
    ],
    ruleOverrides: {},
  },
  blog: {
    id: "blog",
    nameJa: "ブログ",
    toneJa: "親切・共有感・半正式",
    descriptionJa: "ウェブ記事・ブログ向けモード。読みやすさを重視します。",
    defaultGuidelines: [
      "jtf-style-3",
      "gendai-kanazukai-1986",
      "editors-rulebook",
      "joyo-kanji-2010",
    ],
    ruleOverrides: {},
  },
  academic: {
    id: "academic",
    nameJa: "学術",
    toneJa: "冷静・客観・構造化",
    descriptionJa: "論文・学術文書向けモード。客観性と構造的な記述を重視します。",
    defaultGuidelines: [
      "jtf-style-3",
      "editors-rulebook",
      "gendai-kanazukai-1986",
      "joyo-kanji-2010",
      "okurigana-1973",
      "jis-x-4051",
    ],
    ruleOverrides: {},
  },
  sns: {
    id: "sns",
    nameJa: "SNS",
    toneJa: "簡潔・インパクト",
    descriptionJa: "SNS・短文投稿向けモード。最も寛容な設定です。",
    defaultGuidelines: ["gendai-kanazukai-1986", "joyo-kanji-2010"],
    ruleOverrides: {},
  },
};

/**
 * Retrieve a correction mode by ID.
 * @param id CorrectionModeId to look up
 * @returns The CorrectionMode definition
 */
export function getCorrectionMode(id: CorrectionModeId): CorrectionMode {
  return CORRECTION_MODES[id];
}

/** Ordered list of all available correction mode IDs. */
export const CORRECTION_MODE_IDS: CorrectionModeId[] = [
  "novel",
  "official",
  "blog",
  "academic",
  "sns",
];
