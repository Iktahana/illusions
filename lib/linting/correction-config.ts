/**
 * CorrectionConfig - Single source of truth for all correction settings.
 * 校正設定の統一インターフェース定義。
 */

import type { LintRuleConfig } from "./types";
import type { IgnoredCorrection } from "@/lib/project-types";

/**
 * Identifies what triggered a config change, enabling smart cache invalidation
 * in the decoration plugin.
 */
export type ConfigChangeReason =
  | "text-edit"            // re-run affected paragraphs only
  | "rule-config-change"   // clear issue cache, full re-run
  | "mode-change"          // clear all caches, full re-run
  | "guideline-change"     // clear issue + validation cache
  | "model-change"         // clear validation cache only
  | "ignored-correction"   // rebuild decorations only (no re-run)
  | "manual-refresh";      // clear all caches, force re-run

/** Correction mode identifiers */
export type CorrectionModeId = "novel" | "official" | "blog" | "academic" | "sns";

/** Guideline identifiers */
export type GuidelineId =
  | "joyo-kanji-2010"
  | "okurigana-1973"
  | "gairai-1991"
  | "gendai-kanazukai-1986"
  | "koyo-bun-2022"
  | "jis-x-4051"
  | "kisha-handbook-14"
  | "jtf-style-3"
  | "jtca-style-3"
  | "editors-rulebook"
  | "novel-manuscript";

/** Single source of truth for all correction settings */
export interface CorrectionConfig {
  enabled: boolean;
  mode: CorrectionModeId;
  guidelines: GuidelineId[];
  ruleOverrides: Record<string, Partial<LintRuleConfig>>;
  llm: {
    modelId: string;
    cooldownMs: number;
    validationEnabled: boolean;
  };
  ignoredCorrections: IgnoredCorrection[];
}

/** Default CorrectionConfig values */
export const DEFAULT_CORRECTION_CONFIG: CorrectionConfig = {
  enabled: true,
  mode: "novel",
  guidelines: ["joyo-kanji-2010", "novel-manuscript"],
  ruleOverrides: {},
  llm: {
    modelId: "",
    cooldownMs: 60_000,
    validationEnabled: true,
  },
  ignoredCorrections: [],
};
