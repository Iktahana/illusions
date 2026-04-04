import { useMemo } from "react";

import {
  countSentences,
  analyzeCharacterTypes,
  calculateCharacterUsageRates,
  calculateReadabilityScore,
} from "@/lib/utils";

import type { CharacterTypeAnalysis, CharacterUsageRates, ReadabilityAnalysis } from "@/lib/utils";

import { computeTextStatistics } from "./text-statistics";
import type { TextStatistics } from "./text-statistics";

export type { TextStatistics };

export interface TextStatisticsResult extends TextStatistics {
  /** 文数 */
  sentenceCount: number;
  /** 文字種別分析 */
  charTypeAnalysis: CharacterTypeAnalysis;
  /** 文字種別使用率 */
  charUsageRates: CharacterUsageRates;
  /** 読みやすさ分析 */
  readabilityAnalysis: ReadabilityAnalysis;
}

/**
 * Compute text statistics from editor content.
 * All values are memoized and only recomputed when content changes.
 *
 * 原稿用紙換算統計を含む統合統計を返す。
 * コンテンツが変わったときのみ再計算する。
 */
export function useTextStatistics(content: string): TextStatisticsResult {
  const manuscriptStats = useMemo(() => computeTextStatistics(content), [content]);

  const sentenceCount = useMemo(() => countSentences(content), [content]);
  const charTypeAnalysis = useMemo(() => analyzeCharacterTypes(content), [content]);
  const charUsageRates = useMemo(
    () => calculateCharacterUsageRates(charTypeAnalysis),
    [charTypeAnalysis],
  );
  const readabilityAnalysis = useMemo(() => calculateReadabilityScore(content), [content]);

  return {
    ...manuscriptStats,
    sentenceCount,
    charTypeAnalysis,
    charUsageRates,
    readabilityAnalysis,
  };
}
