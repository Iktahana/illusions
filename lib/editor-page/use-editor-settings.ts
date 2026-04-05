import { useEffect } from "react";

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

export type { DisplaySettings, DisplaySettingsHandlers } from "./use-display-settings";
export type { AiSettings, AiSettingsHandlers } from "./use-ai-settings";
export type { DictSettings, DictSettingsHandlers } from "./use-dict-settings";

/** Combined editor settings from display, AI, and dictionary sub-hooks */
export type EditorSettings = DisplaySettings & AiSettings & DictSettings;

/** Combined handlers from display, AI, and dictionary sub-hooks */
export type EditorSettingsHandlers = Omit<DisplaySettingsHandlers, "setShowSettingsModal"> &
  Omit<AiSettingsHandlers, "setLintingEnabled" | "setLintingRuleConfigs" | "setLlmEnabled"> &
  DictSettingsHandlers & {
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

  // Load persisted settings on mount
  useEffect(() => {
    let mounted = true;

    const loadSettings = async () => {
      try {
        const appState = await fetchAppState();
        if (!mounted || !appState) return;

        applyPersistedDisplaySettings(appState as Record<string, unknown>);
        applyPersistedAiSettings(appState as Record<string, unknown>);
        applyPersistedDictSettings(appState as Record<string, unknown>);

        // Force editor rebuild to apply restored settings (e.g. custom font)
        incrementEditorKey();
      } catch (error) {
        console.error("Failed to load settings:", error);
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
  };

  const handlers: EditorSettingsHandlers = {
    ...displayHandlers,
    handleLintingEnabledChange: aiHandlers.handleLintingEnabledChange,
    handleLintingRuleConfigChange: aiHandlers.handleLintingRuleConfigChange,
    handleLintingRuleConfigsBatchChange: aiHandlers.handleLintingRuleConfigsBatchChange,
    handleLlmEnabledChange: aiHandlers.handleLlmEnabledChange,
    handleLlmModelIdChange: aiHandlers.handleLlmModelIdChange,
    handleLlmIdlingStopChange: aiHandlers.handleLlmIdlingStopChange,
    handleCharacterExtractionBatchSizeChange: aiHandlers.handleCharacterExtractionBatchSizeChange,
    handleCharacterExtractionConcurrencyChange:
      aiHandlers.handleCharacterExtractionConcurrencyChange,
    handlePowerSaveModeChange: aiHandlers.handlePowerSaveModeChange,
    handleAutoPowerSaveOnBatteryChange: aiHandlers.handleAutoPowerSaveOnBatteryChange,
    handleCorrectionConfigChange: aiHandlers.handleCorrectionConfigChange,
    handleDictAutoCheckUpdatesChange: dictHandlers.handleDictAutoCheckUpdatesChange,
    handleDictAutoDownloadChange: dictHandlers.handleDictAutoDownloadChange,
    handleDictInstalledVersionChange: dictHandlers.handleDictInstalledVersionChange,
    handleDictLastCheckedAtChange: dictHandlers.handleDictLastCheckedAtChange,
    handleAiApiKeyChange: aiHandlers.handleAiApiKeyChange,
    handleAiBaseUrlChange: aiHandlers.handleAiBaseUrlChange,
    handleAiModelIdChange: aiHandlers.handleAiModelIdChange,
  };

  return {
    settings,
    handlers,
    setters: displaySetters,
  };
}
