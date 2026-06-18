import { useState, useEffect, useMemo } from "react";

import {
  countSentences,
  analyzeCharacterTypes,
  calculateCharacterUsageRates,
  cleanMarkdown,
  analyzeReadability,
  enrichReadabilityWithMorphology,
  enrichReadabilityWithDict,
} from "@/lib/utils";

import type {
  CharacterTypeAnalysis,
  CharacterUsageRates,
  EnhancedReadabilityAnalysis,
} from "@/lib/utils";

import { getNlpClient } from "@/lib/nlp-client/nlp-client";
import { getDictAccess } from "@/lib/dict/dict-access";
import type { Token } from "@/lib/nlp-client/types";
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
 * Readability is computed in three phases:
 *   Phase 1 (sync):  surface-level analysis via analyzeReadability()
 *   Phase 2 (async): morphological enrichment via enrichReadabilityWithMorphology()
 *                    using kuromoji through INlpClient
 *   Phase 3 (async): dictionary enrichment via enrichReadabilityWithDict()
 *                    using Genji freq_rank via DictAccess — only when state === "ready"
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

  // Phase 2 + 3: async enrichment（NLP完了後 → 辞書補強）
  const [readabilityAnalysis, setReadabilityAnalysis] =
    useState<EnhancedReadabilityAnalysis>(surfaceAnalysis);

  useEffect(() => {
    // content変化時はまず表層結果を即時表示
    setReadabilityAnalysis(surfaceAnalysis);

    // 短すぎる文章はNLPをスキップ（形態素解析のコストに見合わない）
    if (cleanedContent.length < 50) return;

    let cancelled = false;

    const run = async (): Promise<void> => {
      // Phase 2: kuromoji 形態素解析
      let morphResult = surfaceAnalysis;
      let tokens: Token[] = [];
      try {
        tokens = await getNlpClient().tokenizeParagraph(cleanedContent);
        if (cancelled) return;
        morphResult = enrichReadabilityWithMorphology(surfaceAnalysis, tokens);
        setReadabilityAnalysis(morphResult);
      } catch {
        // NLP失敗時は表層結果のまま維持（silent fallback）
        if (cancelled) return;
      }

      // Phase 3: 幻辞辞書補強（state === "ready" のときのみ実行）
      // Web では重い一括照合をしないためヘルスチェックで必ず確認する
      try {
        const access = getDictAccess();
        const health = await access.getHealth();
        if (cancelled) return;
        if (health.state !== "ready") return; // graceful degradation

        // 内容語（名詞/動詞/形容詞/副詞）の basic_form を収集してバッチ照合
        const contentForms = [
          ...new Set(
            tokens
              .filter((t) => ["名詞", "動詞", "形容詞", "副詞"].includes(t.pos))
              .map((t) => t.basic_form ?? t.surface)
              .filter((f): f is string => typeof f === "string" && f.length > 0),
          ),
        ];

        if (contentForms.length === 0) return;

        const lookupMap = await access.lookupBatch(contentForms);
        if (cancelled) return;

        const dictResult = enrichReadabilityWithDict(morphResult, tokens, lookupMap);
        setReadabilityAnalysis(dictResult);
      } catch {
        // 辞書補強失敗時は Tier 2 結果のまま維持（silent fallback）
      }
    };

    void run();

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
