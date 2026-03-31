"use client";

import type React from "react";
import {
  useLintingSettings,
  useCharacterExtractionSettings,
} from "@/contexts/EditorSettingsContext";
import LintingSettings from "./LintingSettings";

/**
 * Settings tab for linting/proofreading.
 * Delegates all rendering to the standalone LintingSettings component.
 */
export default function LintingSettingsTab(): React.ReactElement {
  const {
    lintingEnabled,
    lintingRuleConfigs,
    correctionConfig,
    onLintingEnabledChange,
    onLintingRuleConfigChange,
    onLintingRuleConfigsBatchChange,
    onCorrectionConfigChange,
  } = useLintingSettings();
  const {
    characterExtractionBatchSize,
    characterExtractionConcurrency,
    onCharacterExtractionBatchSizeChange,
    onCharacterExtractionConcurrencyChange,
  } = useCharacterExtractionSettings();

  return (
    <LintingSettings
      lintingEnabled={lintingEnabled}
      onLintingEnabledChange={(v) => onLintingEnabledChange?.(v)}
      lintingRuleConfigs={lintingRuleConfigs}
      onLintingRuleConfigChange={(id, cfg) => onLintingRuleConfigChange?.(id, cfg)}
      onLintingRuleConfigsBatchChange={(cfgs) => onLintingRuleConfigsBatchChange?.(cfgs)}
      characterExtractionBatchSize={characterExtractionBatchSize}
      onCharacterExtractionBatchSizeChange={onCharacterExtractionBatchSizeChange}
      characterExtractionConcurrency={characterExtractionConcurrency}
      onCharacterExtractionConcurrencyChange={onCharacterExtractionConcurrencyChange}
      correctionConfig={correctionConfig}
      onCorrectionConfigChange={onCorrectionConfigChange}
    />
  );
}
