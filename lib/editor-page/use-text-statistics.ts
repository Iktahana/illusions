import { useState, useEffect, useMemo } from "react";

import {
  countSentences,
  analyzeCharacterTypes,
  calculateCharacterUsageRates,
  cleanMarkdown,
  analyzeReadability,
  enrichReadabilityWithMorphology,
} from "@/lib/utils";

import type { CharacterTypeAnalysis, CharacterUsageRates, EnhancedReadabilityAnalysis } from "@/lib/utils";

import { getNlpClient } from "@/lib/nlp-client/nlp-client";
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
  /** 可読性分析結果。表層分析を即時表示し、NLP完了後にサブスコアを更新する。 */
  readabilityAnalysis: EnhancedReadabilityAnalysis;
}

/**
 * Compute text statistics from editor content.
 * All values are memoized and only recomputed when content changes.
 *
 * 原稿用紙換算統計を含む統合統計を返す。
 * Readability is computed in two phases:
 *   Phase 1 (sync):  surface-level analysis via analyzeReadability()
 *   Phase 2 (async): morphological enrichment via enrichReadabilityWithMorphology()
 *                    using kuromoji through INlpClient
 */
export function useTextStatistics(content: string): TextStatisticsResult {
  const manuscriptStats = useMemo(() => computeTextStatistics(content), [content]);

  const cleanedContent = useMemo(() => cleanMarkdown(content), [content]);

  const sentenceCount = useMemo(() => countSentences(cleanedContent), [cleanedContent]);
  const charTypeAnalysis = useMemo(() => analyzeCharacterTypes(cleanedContent), [cleanedContent]);
  const charUsageRates = useMemo(
    () => calculateCharacterUsageRates(charTypeAnalysis),
    [charTypeAnalysis],
  );

  // Phase 1: synchronous surface analysis（即時）
  const surfaceAnalysis = useMemo(() => analyzeReadability(cleanedContent), [cleanedContent]);

  // Phase 2: async morphological enrichment（NLP完了後に更新）
  const [readabilityAnalysis, setReadabilityAnalysis] =
    useState<EnhancedReadabilityAnalysis>(surfaceAnalysis);

  useEffect(() => {
    // content変化時はまず表層結果を即時表示
    setReadabilityAnalysis(surfaceAnalysis);

    // 短すぎる文章はNLPをスキップ（形態素解析のコストに見合わない）
    if (cleanedContent.length < 50) return;

    let cancelled = false;
    getNlpClient()
      .tokenizeParagraph(cleanedContent)
      .then((tokens) => {
        if (cancelled) return;
        setReadabilityAnalysis(enrichReadabilityWithMorphology(surfaceAnalysis, tokens));
      })
      .catch(() => {
        // NLP失敗時は表層結果のまま維持（silent fallback）
      });

    return () => {
      cancelled = true;
    };
  }, [cleanedContent, surfaceAnalysis]);

  return {
    ...manuscriptStats,
    sentenceCount,
    charTypeAnalysis,
    charUsageRates,
    readabilityAnalysis,
  };
}
