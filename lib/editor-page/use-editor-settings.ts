import { useEffect, useState } from "react";

import { fetchAppState } from "@/lib/storage/app-state-manager";

import type { Severity } from "@/lib/linting/types";
import type { CorrectionConfig } from "@/lib/linting/correction-config";
import type { Dispatch, SetStateAction } from "react";

import { useDisplaySettings } from "./use-display-settings";
import type { DisplaySettings, DisplaySettingsHandlers } from "./use-display-settings";
import { useAiSettings } from "./use-ai-settings";
import type { AiSettings, AiSettingsHandlers } from "./use-ai-settings";
import { useDictSettings } from "./use-dict-settings";
import type { DictSettings, DictSettingsHandlers } from "./use-dict-settings";
import { useUpdateSettings } from "./use-update-settings";
import type { UpdateSettings, UpdateSettingsHandlers } from "./use-update-settings";
import { useAnalyticsSettings } from "./use-analytics-settings";
import type { AnalyticsSettings, AnalyticsSettingsHandlers } from "./use-analytics-settings";

export type { DisplaySettings, DisplaySettingsHandlers } from "./use-display-settings";
export type { AiSettings, AiSettingsHandlers } from "./use-ai-settings";
export type { DictSettings, DictSettingsHandlers } from "./use-dict-settings";
export type { UpdateSettings, UpdateSettingsHandlers } from "./use-update-settings";
export type { AnalyticsSettings, AnalyticsSettingsHandlers } from "./use-analytics-settings";

/** Combined editor settings from display, AI, dictionary, update, and analytics sub-hooks */
export type EditorSettings = DisplaySettings &
  AiSettings &
  DictSettings &
  UpdateSettings &
  AnalyticsSettings;

/** Combined handlers from display, AI, dictionary, update, and analytics sub-hooks */
export type EditorSettingsHandlers = Omit<DisplaySettingsHandlers, "setShowSettingsModal"> &
  Omit<AiSettingsHandlers, "setLintingEnabled" | "setLintingRuleConfigs"> &
  DictSettingsHandlers &
  UpdateSettingsHandlers &
  AnalyticsSettingsHandlers & {
    setShowSettingsModal: (value: boolean) => void;
    handleLintingEnabledChange: (value: boolean) => void;
    handleLintingRuleConfigChange: (
      ruleId: string,
      config: { enabled: boolean; severity: Severity },
    ) => void;
    handleLintingRuleConfigsBatchChange: (
      configs: Record<string, { enabled: boolean; severity: Severity }>,
    ) => void;
    handleCorrectionConfigChange: (partial: Partial<CorrectionConfig>) => void;
  };

export interface EditorSettingsSetters {
  /** Direct setters exposed for Electron IPC format-change handler */
  setLineHeight: Dispatch<SetStateAction<number>>;
  setParagraphSpacing: Dispatch<SetStateAction<number>>;
  setTextIndent: Dispatch<SetStateAction<number>>;
  setCharsPerLine: Dispatch<SetStateAction<number>>;
  setShowParagraphNumbers: Dispatch<SetStateAction<boolean>>;
  setCompactMode: Dispatch<SetStateAction<boolean>>;
}

export interface UseEditorSettingsResult {
  settings: EditorSettings;
  handlers: EditorSettingsHandlers;
  setters: EditorSettingsSetters;
  /** True once persisted app state has been loaded into the sub-hooks. */
  settingsHydrated: boolean;
}

/**
 * Composes {@link useDisplaySettings} and {@link useAiSettings} into a unified
 * editor settings hook. Loads persisted values from app state on mount and
 * forwards them to each sub-hook.
 *
 * @param incrementEditorKey - callback to increment the editor key, forcing a remount
 */
export function useEditorSettings(incrementEditorKey: () => void): UseEditorSettingsResult {
  const { displaySettings, displayHandlers, displaySetters, applyPersistedDisplaySettings } =
    useDisplaySettings(incrementEditorKey);

  const { aiSettings, aiHandlers, applyPersistedAiSettings } = useAiSettings();
  const { dictSettings, dictHandlers, applyPersistedDictSettings } = useDictSettings();
  const { updateSettings, updateHandlers, applyPersistedUpdateSettings } = useUpdateSettings();
  const { analyticsSettings, analyticsHandlers, applyPersistedAnalyticsSettings } =
    useAnalyticsSettings();

  // Flips true once persisted state has been applied, so downstream effects
  // (e.g. the mode-config migration) can wait for the real values instead of
  // acting on the initial defaults. Set even when there is no stored app state,
  // since "nothing persisted" is itself a fully-resolved hydration outcome.
  const [settingsHydrated, setSettingsHydrated] = useState(false);

  // Load persisted settings on mount
  useEffect(() => {
    let mounted = true;

    const loadSettings = async () => {
      try {
        const appState = await fetchAppState();
        if (!mounted) return;

        if (appState) {
          applyPersistedDisplaySettings(appState as Record<string, unknown>);
          applyPersistedAiSettings(appState as Record<string, unknown>);
          applyPersistedDictSettings(appState as Record<string, unknown>);
          applyPersistedUpdateSettings(appState as Record<string, unknown>);
          applyPersistedAnalyticsSettings(appState as Record<string, unknown>);

          // Force editor rebuild to apply restored settings (e.g. custom font)
          incrementEditorKey();
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      } finally {
        if (mounted) setSettingsHydrated(true);
      }
    };

    void loadSettings();

    return () => {
      mounted = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const settings: EditorSettings = {
    ...displaySettings,
    ...aiSettings,
    ...dictSettings,
    ...updateSettings,
    ...analyticsSettings,
  };

  const handlers: EditorSettingsHandlers = {
    ...displayHandlers,
    handleLintingEnabledChange: aiHandlers.handleLintingEnabledChange,
    handleLintingRuleConfigChange: aiHandlers.handleLintingRuleConfigChange,
    handleLintingRuleConfigsBatchChange: aiHandlers.handleLintingRuleConfigsBatchChange,
    handleLintingModeConfigVersionChange: aiHandlers.handleLintingModeConfigVersionChange,
    handleCharacterExtractionBatchSizeChange: aiHandlers.handleCharacterExtractionBatchSizeChange,
    handleCharacterExtractionConcurrencyChange:
      aiHandlers.handleCharacterExtractionConcurrencyChange,
    handlePowerSaveModeChange: aiHandlers.handlePowerSaveModeChange,
    temporarilyDisablePowerSave: aiHandlers.temporarilyDisablePowerSave,
    handleAutoPowerSaveOnBatteryChange: aiHandlers.handleAutoPowerSaveOnBatteryChange,
    handleCorrectionConfigChange: aiHandlers.handleCorrectionConfigChange,
    handleDictAutoCheckUpdatesChange: dictHandlers.handleDictAutoCheckUpdatesChange,
    handleDictAutoDownloadChange: dictHandlers.handleDictAutoDownloadChange,
    handleDictInstalledVersionChange: dictHandlers.handleDictInstalledVersionChange,
    handleDictLastCheckedAtChange: dictHandlers.handleDictLastCheckedAtChange,
    handleAllowBetaUpdatesChange: updateHandlers.handleAllowBetaUpdatesChange,
    handleAiApiKeyChange: aiHandlers.handleAiApiKeyChange,
    handleAiBaseUrlChange: aiHandlers.handleAiBaseUrlChange,
    handleAiModelIdChange: aiHandlers.handleAiModelIdChange,
    handleUsageAnalyticsConsentChange: analyticsHandlers.handleUsageAnalyticsConsentChange,
    handleErrorReportingConsentChange: analyticsHandlers.handleErrorReportingConsentChange,
  };

  return {
    settings,
    handlers,
    setters: displaySetters,
    settingsHydrated,
  };
}
