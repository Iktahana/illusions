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
  llmPromptStyleJa: string;
}

export const CORRECTION_MODES: Record<CorrectionModeId, CorrectionMode> = {
  novel: {
    id: "novel",
    nameJa: "小説",
    toneJa: "感性・具象・張力",
    descriptionJa: "小説・フィクション向けの校正モード。文体の個性を尊重します。",
    defaultGuidelines: ["novel-manuscript", "joyo-kanji-2010", "jis-x-4051"],
    ruleOverrides: {
      "desu-masu-consistency": { enabled: false },
    },
    llmPromptStyleJa:
      "小説の文体として自然な表現かどうかを判断してください。文学的な表現や倒置法は許容します。",
  },
  official: {
    id: "official",
    nameJa: "公用文",
    toneJa: "厳粛・対等・標準化",
    descriptionJa:
      "官公庁・公的機関の文書向けモード。内閣告示の各種基準に準拠します。",
    defaultGuidelines: [
      "koyo-bun-2022",
      "joyo-kanji-2010",
      "okurigana-1973",
      "gairai-1991",
    ],
    ruleOverrides: {
      "taigen-dome-overuse": { enabled: false },
    },
    llmPromptStyleJa:
      "公用文として適切な表現かどうかを判断してください。擬声語・個人的感情・倒置文は不適切とします。",
  },
  blog: {
    id: "blog",
    nameJa: "ブログ",
    toneJa: "親切・共有感・半正式",
    descriptionJa: "ウェブ記事・ブログ向けモード。読みやすさを重視します。",
    defaultGuidelines: ["jtf-style-3", "joyo-kanji-2010"],
    ruleOverrides: {
      "sentence-length": { enabled: true },
    },
    llmPromptStyleJa:
      "ウェブ記事として読みやすく親しみやすい表現かどうかを判断してください。過度な堅苦しさや難解な語彙は避けてください。",
  },
  academic: {
    id: "academic",
    nameJa: "学術",
    toneJa: "冷静・客観・構造化",
    descriptionJa:
      "論文・学術文書向けモード。客観性と構造的な記述を重視します。",
    defaultGuidelines: ["joyo-kanji-2010", "okurigana-1973", "jis-x-4051"],
    ruleOverrides: {
      "taigen-dome-overuse": { enabled: true, severity: "warning" },
    },
    llmPromptStyleJa:
      "学術論文として適切な客観的表現かどうかを判断してください。「私は」などの主観表現や修辞的隠喩は不適切とします。",
  },
  sns: {
    id: "sns",
    nameJa: "SNS",
    toneJa: "簡潔・インパクト",
    descriptionJa: "SNS・短文投稿向けモード。最も寛容な設定です。",
    defaultGuidelines: ["joyo-kanji-2010"],
    ruleOverrides: {
      "sentence-length": { enabled: false },
      "taigen-dome-overuse": { enabled: false },
      "conjunction-overuse": { enabled: false },
    },
    llmPromptStyleJa: "SNSの短文として自然かどうかを判断してください。",
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
