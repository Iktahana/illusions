import { useCallback, useState } from "react";

import { fetchAppState, persistAppState } from "@/lib/storage/app-state-manager";
import type { Severity } from "@/lib/linting/types";
import type { CorrectionConfig, CorrectionModeId, GuidelineId } from "@/lib/linting/correction-config";
import { DEFAULT_CORRECTION_CONFIG } from "@/lib/linting/correction-config";

export interface AiSettings {
  lintingEnabled: boolean;
  lintingRuleConfigs: Record<string, { enabled: boolean; severity: Severity }>;
  llmEnabled: boolean;
  llmModelId: string;
  llmIdlingStop: boolean;
  characterExtractionBatchSize: number;
  characterExtractionConcurrency: number;
  powerSaveMode: boolean;
  autoPowerSaveOnBattery: boolean;
  correctionConfig: CorrectionConfig;
}

export interface AiSettingsHandlers {
  handleLintingEnabledChange: (value: boolean) => void;
  handleLintingRuleConfigChange: (ruleId: string, config: { enabled: boolean; severity: Severity }) => void;
  handleLintingRuleConfigsBatchChange: (configs: Record<string, { enabled: boolean; severity: Severity }>) => void;
  handleLlmEnabledChange: (value: boolean) => void;
  handleLlmModelIdChange: (modelId: string) => void;
  handleLlmIdlingStopChange: (value: boolean) => void;
  handleCharacterExtractionBatchSizeChange: (value: number) => void;
  handleCharacterExtractionConcurrencyChange: (value: number) => void;
  handlePowerSaveModeChange: (enabled: boolean) => Promise<void>;
  handleAutoPowerSaveOnBatteryChange: (enabled: boolean) => void;
  handleCorrectionConfigChange: (partial: Partial<CorrectionConfig>) => void;
  /** Expose setters so power-save restore can update linting/LLM state */
  setLintingEnabled: (value: boolean) => void;
  setLintingRuleConfigs: (configs: Record<string, { enabled: boolean; severity: Severity }>) => void;
  setLlmEnabled: (value: boolean) => void;
}

export interface UseAiSettingsResult {
  aiSettings: AiSettings;
  aiHandlers: AiSettingsHandlers;
  /** Apply persisted values loaded from app state */
  applyPersistedAiSettings: (appState: Record<string, unknown>) => void;
}

/**
 * Manages AI-related editor settings: linting rules, LLM model selection,
 * correction config, and power-save mode (which coordinates linting + LLM state).
 */
export function useAiSettings(): UseAiSettingsResult {
  const [lintingEnabled, setLintingEnabled] = useState(true);
  const [lintingRuleConfigs, setLintingRuleConfigs] = useState<Record<string, { enabled: boolean; severity: Severity }>>({});
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [llmModelId, setLlmModelId] = useState("qwen3-1.7b-q8");
  const [llmIdlingStop, setLlmIdlingStop] = useState(true);
  const [characterExtractionBatchSize, setCharacterExtractionBatchSize] = useState(3);
  const [characterExtractionConcurrency, setCharacterExtractionConcurrency] = useState(4);
  const [powerSaveMode, setPowerSaveMode] = useState(false);
  const [autoPowerSaveOnBattery, setAutoPowerSaveOnBattery] = useState(true);
  const [correctionMode, setCorrectionMode] = useState<CorrectionModeId>("novel");
  const [correctionGuidelines, setCorrectionGuidelines] = useState<GuidelineId[]>(DEFAULT_CORRECTION_CONFIG.guidelines);

  const applyPersistedAiSettings = useCallback((appState: Record<string, unknown>) => {
    if (typeof appState.lintingEnabled === "boolean") setLintingEnabled(appState.lintingEnabled);
    if (typeof appState.llmEnabled === "boolean") setLlmEnabled(appState.llmEnabled);
    if (typeof appState.llmModelId === "string") setLlmModelId(appState.llmModelId);
    if (typeof appState.llmIdlingStop === "boolean") setLlmIdlingStop(appState.llmIdlingStop);

    if (appState.lintingRuleConfigs && typeof appState.lintingRuleConfigs === "object") {
      const isSeverity = (v: unknown): v is Severity => v === "error" || v === "warning" || v === "info";
      const sanitized: Record<string, { enabled: boolean; severity: Severity; skipDialogue?: boolean }> = {};
      for (const [ruleId, config] of Object.entries(appState.lintingRuleConfigs as Record<string, unknown>)) {
        const cfg = config as { enabled?: unknown; severity?: unknown; skipDialogue?: unknown };
        if (typeof cfg.enabled === "boolean" && isSeverity(cfg.severity)) {
          const entry: { enabled: boolean; severity: Severity; skipDialogue?: boolean } = {
            enabled: cfg.enabled,
            severity: cfg.severity,
          };
          if (typeof cfg.skipDialogue === "boolean") {
            entry.skipDialogue = cfg.skipDialogue;
          }
          sanitized[ruleId] = entry;
        }
      }
      setLintingRuleConfigs(sanitized);
    }

    if (appState.powerSaveMode !== undefined) setPowerSaveMode(appState.powerSaveMode as boolean);
    if (appState.autoPowerSaveOnBattery !== undefined) setAutoPowerSaveOnBattery(appState.autoPowerSaveOnBattery as boolean);
    if (appState.correctionMode) setCorrectionMode(appState.correctionMode as CorrectionModeId);
    if (appState.correctionGuidelines) setCorrectionGuidelines(appState.correctionGuidelines as GuidelineId[]);

    if (typeof appState.characterExtractionBatchSize === "number") {
      setCharacterExtractionBatchSize(Math.min(Math.max(appState.characterExtractionBatchSize, 1), 10));
    }
    if (typeof appState.characterExtractionConcurrency === "number") {
      setCharacterExtractionConcurrency(Math.min(Math.max(appState.characterExtractionConcurrency, 1), 8));
    }
  }, []);

  const handleLintingEnabledChange = useCallback((value: boolean) => {
    setLintingEnabled(value);
    void persistAppState({ lintingEnabled: value }).catch((e) => console.error("Failed to persist lintingEnabled:", e));
  }, []);

  const handleLlmEnabledChange = useCallback((value: boolean) => {
    setLlmEnabled(value);
    void persistAppState({ llmEnabled: value }).catch((e) => console.error("Failed to persist llmEnabled:", e));
  }, []);

  const handleLlmModelIdChange = useCallback((modelId: string) => {
    setLlmModelId(modelId);
    void persistAppState({ llmModelId: modelId }).catch((e) => console.error("Failed to persist llmModelId:", e));
  }, []);

  const handleLlmIdlingStopChange = useCallback((value: boolean) => {
    setLlmIdlingStop(value);
    void persistAppState({ llmIdlingStop: value }).catch((e) => console.error("Failed to persist llmIdlingStop:", e));
  }, []);

  const handleCharacterExtractionBatchSizeChange = useCallback((value: number) => {
    const clamped = Math.max(1, Math.min(10, value));
    setCharacterExtractionBatchSize(clamped);
    void persistAppState({ characterExtractionBatchSize: clamped }).catch((e) =>
      console.error("Failed to persist characterExtractionBatchSize:", e)
    );
  }, []);

  const handleCharacterExtractionConcurrencyChange = useCallback((value: number) => {
    const clamped = Math.max(1, Math.min(8, value));
    setCharacterExtractionConcurrency(clamped);
    void persistAppState({ characterExtractionConcurrency: clamped }).catch((e) =>
      console.error("Failed to persist characterExtractionConcurrency:", e)
    );
  }, []);

  const handleLintingRuleConfigChange = useCallback((ruleId: string, config: { enabled: boolean; severity: Severity }) => {
    setLintingRuleConfigs((prev) => {
      const next = { ...prev, [ruleId]: config };
      void persistAppState({ lintingRuleConfigs: next }).catch((e) =>
        console.error("Failed to persist lintingRuleConfigs:", e)
      );
      return next;
    });
  }, []);

  const handleLintingRuleConfigsBatchChange = useCallback(
    (configs: Record<string, { enabled: boolean; severity: Severity; skipDialogue?: boolean }>) => {
      setLintingRuleConfigs(configs);
      void persistAppState({ lintingRuleConfigs: configs }).catch((e) =>
        console.error("Failed to persist lintingRuleConfigs:", e)
      );
    },
    []
  );

  const handlePowerSaveModeChange = useCallback(async (enabled: boolean) => {
    if (enabled) {
      const snapshot = { lintingEnabled, lintingRuleConfigs, llmEnabled };
      await persistAppState({
        powerSaveMode: true,
        prePowerSaveState: snapshot,
        lintingEnabled: false,
        llmEnabled: false,
      });
      setPowerSaveMode(true);
      setLintingEnabled(false);
      setLlmEnabled(false);
    } else {
      const stored = await fetchAppState();
      const prev = stored?.prePowerSaveState;
      if (prev) {
        // Default llmEnabled to current value for older stored snapshots that
        // predate the field (persisted before this field was added).
        const nextLlmEnabled = typeof prev.llmEnabled === "boolean" ? prev.llmEnabled : llmEnabled;
        setLintingEnabled(prev.lintingEnabled);
        setLintingRuleConfigs(prev.lintingRuleConfigs);
        setLlmEnabled(nextLlmEnabled);
        await persistAppState({
          powerSaveMode: false,
          prePowerSaveState: null,
          lintingEnabled: prev.lintingEnabled,
          lintingRuleConfigs: prev.lintingRuleConfigs,
          llmEnabled: nextLlmEnabled,
        });
      } else {
        await persistAppState({ powerSaveMode: false, prePowerSaveState: null });
      }
      setPowerSaveMode(false);
    }
  }, [lintingEnabled, lintingRuleConfigs, llmEnabled]);

  const handleAutoPowerSaveOnBatteryChange = useCallback((enabled: boolean) => {
    setAutoPowerSaveOnBattery(enabled);
    void persistAppState({ autoPowerSaveOnBattery: enabled }).catch((e) =>
      console.error("Failed to persist autoPowerSaveOnBattery:", e)
    );
  }, []);

  const handleCorrectionConfigChange = useCallback((partial: Partial<CorrectionConfig>) => {
    if (partial.mode !== undefined) setCorrectionMode(partial.mode);
    if (partial.guidelines !== undefined) setCorrectionGuidelines(partial.guidelines);
    void persistAppState({
      correctionMode: partial.mode ?? correctionMode,
      correctionGuidelines: partial.guidelines ?? correctionGuidelines,
    }).catch((e) => console.error("Failed to persist correctionConfig:", e));
  }, [correctionMode, correctionGuidelines]);

  return {
    aiSettings: {
      lintingEnabled,
      lintingRuleConfigs,
      llmEnabled,
      llmModelId,
      llmIdlingStop,
      characterExtractionBatchSize,
      characterExtractionConcurrency,
      powerSaveMode,
      autoPowerSaveOnBattery,
      correctionConfig: {
        ...DEFAULT_CORRECTION_CONFIG,
        enabled: lintingEnabled,
        mode: correctionMode,
        guidelines: correctionGuidelines,
        ruleOverrides: lintingRuleConfigs,
        llm: {
          ...(DEFAULT_CORRECTION_CONFIG.llm ?? {}),
          modelId: llmModelId,
          validationEnabled: llmEnabled,
        },
      },
    },
    aiHandlers: {
      handleLintingEnabledChange,
      handleLintingRuleConfigChange,
      handleLintingRuleConfigsBatchChange,
      handleLlmEnabledChange,
      handleLlmModelIdChange,
      handleLlmIdlingStopChange,
      handleCharacterExtractionBatchSizeChange,
      handleCharacterExtractionConcurrencyChange,
      handlePowerSaveModeChange,
      handleAutoPowerSaveOnBatteryChange,
      handleCorrectionConfigChange,
      setLintingEnabled,
      setLintingRuleConfigs,
      setLlmEnabled,
    },
    applyPersistedAiSettings,
  };
}
