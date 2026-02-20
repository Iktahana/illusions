import { useMemo } from "react";

import {
  countSentences,
  analyzeCharacterTypes,
  calculateCharacterUsageRates,
  calculateReadabilityScore,
} from "@/lib/utils";

import type {
  CharacterTypeAnalysis,
  CharacterUsageRates,
  ReadabilityAnalysis,
} from "@/lib/utils";

import { chars } from "./types";

function words(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

export interface TextStatisticsResult {
  wordCount: number;
  charCount: number;
  paragraphCount: number;
  sentenceCount: number;
  charTypeAnalysis: CharacterTypeAnalysis;
  charUsageRates: CharacterUsageRates;
  readabilityAnalysis: ReadabilityAnalysis;
}

/**
 * Compute text statistics from editor content.
 * All values are memoized and only recomputed when content changes.
 */
export function useTextStatistics(content: string): TextStatisticsResult {
  const wordCount = useMemo(() => words(content), [content]);
  const charCount = useMemo(() => chars(content), [content]);

  const paragraphCount = useMemo(
    () => content ? content.split(/\n\n+/).filter(p => p.trim().length > 0).length : 0,
    [content],
  );

  const sentenceCount = useMemo(() => countSentences(content), [content]);
  const charTypeAnalysis = useMemo(() => analyzeCharacterTypes(content), [content]);
  const charUsageRates = useMemo(() => calculateCharacterUsageRates(charTypeAnalysis), [charTypeAnalysis]);
  const readabilityAnalysis = useMemo(() => calculateReadabilityScore(content), [content]);

  return {
    wordCount,
    charCount,
    paragraphCount,
    sentenceCount,
    charTypeAnalysis,
    charUsageRates,
    readabilityAnalysis,
  };
}
