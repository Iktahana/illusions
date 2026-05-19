import { useCallback, useEffect, useState } from "react";

import { fetchAppState, persistAppState } from "@/lib/storage/app-state-manager";
import { configureAiClient, resetAiClient } from "@/lib/ai/ai-client";
import type { Severity } from "@/lib/linting/types";
import type {
  CorrectionConfig,
  CorrectionModeId,
  GuidelineId,
} from "@/lib/linting/correction-config";
import { DEFAULT_CORRECTION_CONFIG } from "@/lib/linting/correction-config";
import { CORRECTION_MODES } from "@/lib/linting/correction-modes";

export interface AiSettings {
  lintingEnabled: boolean;
  lintingRuleConfigs: Record<string, { enabled: boolean; severity: Severity }>;
  characterExtractionBatchSize: number;
  characterExtractionConcurrency: number;
  powerSaveMode: boolean;
  autoPowerSaveOnBattery: boolean;
  correctionConfig: CorrectionConfig;
  // Note: aiApiKey is intentionally NOT included here to limit exposure in
  // EditorSettings context. AiApiSettingsTab reads it directly from AppState.
  /** Custom base URL for AI API (e.g. self-hosted LiteLLM Gateway) */
  aiBaseUrl: string;
  /** Model ID for online AI API */
  aiModelId: string;
}

export interface AiSettingsHandlers {
  handleLintingEnabledChange: (value: boolean) => void;
  handleLintingRuleConfigChange: (
    ruleId: string,
    config: { enabled: boolean; severity: Severity },
  ) => void;
  handleLintingRuleConfigsBatchChange: (
    configs: Record<string, { enabled: boolean; severity: Severity }>,
  ) => void;
  handleCharacterExtractionBatchSizeChange: (value: number) => void;
  handleCharacterExtractionConcurrencyChange: (value: number) => void;
  handlePowerSaveModeChange: (enabled: boolean) => Promise<void>;
  handleAutoPowerSaveOnBatteryChange: (enabled: boolean) => void;
  handleCorrectionConfigChange: (partial: Partial<CorrectionConfig>) => void;
  handleAiApiKeyChange: (apiKey: string) => void;
  handleAiBaseUrlChange: (baseUrl: string) => void;
  handleAiModelIdChange: (modelId: string) => void;
  /** Expose setters so power-save restore can update linting state */
  setLintingEnabled: (value: boolean) => void;
  setLintingRuleConfigs: (
    configs: Record<string, { enabled: boolean; severity: Severity }>,
  ) => void;
}

export interface UseAiSettingsResult {
  aiSettings: AiSettings;
  aiHandlers: AiSettingsHandlers;
  /** Apply persisted values loaded from app state */
  applyPersistedAiSettings: (appState: Record<string, unknown>) => void;
}

/**
 * Manages AI-related editor settings: linting rules,
 * correction config, and power-save mode (which coordinates linting state).
 */
export function useAiSettings(): UseAiSettingsResult {
  const [lintingEnabled, setLintingEnabled] = useState(true);
  const [lintingRuleConfigs, setLintingRuleConfigs] = useState<
    Record<string, { enabled: boolean; severity: Severity }>
  >({});
  const [characterExtractionBatchSize, setCharacterExtractionBatchSize] = useState(3);
  const [characterExtractionConcurrency, setCharacterExtractionConcurrency] = useState(4);
  const [powerSaveMode, setPowerSaveMode] = useState(false);
  const [autoPowerSaveOnBattery, setAutoPowerSaveOnBattery] = useState(true);
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [aiModelId, setAiModelId] = useState("gpt-4o-mini");
  const [correctionMode, setCorrectionMode] = useState<CorrectionModeId>("novel");
  const [correctionGuidelines, setCorrectionGuidelines] = useState<GuidelineId[]>(
    DEFAULT_CORRECTION_CONFIG.guidelines,
  );

  const applyPersistedAiSettings = useCallback((appState: Record<string, unknown>) => {
    if (typeof appState.lintingEnabled === "boolean") setLintingEnabled(appState.lintingEnabled);

    if (appState.lintingRuleConfigs && typeof appState.lintingRuleConfigs === "object") {
      const isSeverity = (v: unknown): v is Severity =>
        v === "error" || v === "warning" || v === "info";
      const sanitized: Record<
        string,
        { enabled: boolean; severity: Severity; skipDialogue?: boolean }
      > = {};
      for (const [ruleId, config] of Object.entries(
        appState.lintingRuleConfigs as Record<string, unknown>,
      )) {
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
    if (appState.autoPowerSaveOnBattery !== undefined)
      setAutoPowerSaveOnBattery(appState.autoPowerSaveOnBattery as boolean);
    if (appState.correctionMode) setCorrectionMode(appState.correctionMode as CorrectionModeId);
    if (appState.correctionGuidelines) {
      const stored = appState.correctionGuidelines as GuidelineId[];
      // Migration: guidelines that have implemented rules
      const RULE_BEARING: GuidelineId[] = [
        "jtf-style-3",
        "editors-rulebook",
        "gendai-kanazukai-1986",
      ];
      const hasAnyRuleBearing = stored.some((g) => RULE_BEARING.includes(g));
      if (!hasAnyRuleBearing) {
        // Stored guidelines lack any rule-bearing entries — reset to mode defaults
        const mode = (appState.correctionMode as CorrectionModeId) || "novel";
        const modeDefaults = CORRECTION_MODES[mode]?.defaultGuidelines;
        setCorrectionGuidelines(modeDefaults ?? DEFAULT_CORRECTION_CONFIG.guidelines);
      } else {
        setCorrectionGuidelines(stored);
      }
    }

    // Online AI API settings
    if (typeof appState.aiApiKey === "string") setAiApiKey(appState.aiApiKey);
    if (typeof appState.aiBaseUrl === "string") setAiBaseUrl(appState.aiBaseUrl);
    if (typeof appState.aiModelId === "string") setAiModelId(appState.aiModelId);

    if (typeof appState.characterExtractionBatchSize === "number") {
      setCharacterExtractionBatchSize(
        Math.min(Math.max(appState.characterExtractionBatchSize, 1), 10),
      );
    }
    if (typeof appState.characterExtractionConcurrency === "number") {
      setCharacterExtractionConcurrency(
        Math.min(Math.max(appState.characterExtractionConcurrency, 1), 8),
      );
    }
  }, []);

  const handleLintingEnabledChange = useCallback((value: boolean) => {
    setLintingEnabled(value);
    void persistAppState({ lintingEnabled: value }).catch((e) =>
      console.error("Failed to persist lintingEnabled:", e),
    );
  }, []);

  const handleCharacterExtractionBatchSizeChange = useCallback((value: number) => {
    const clamped = Math.max(1, Math.min(10, value));
    setCharacterExtractionBatchSize(clamped);
    void persistAppState({ characterExtractionBatchSize: clamped }).catch((e) =>
      console.error("Failed to persist characterExtractionBatchSize:", e),
    );
  }, []);

  const handleCharacterExtractionConcurrencyChange = useCallback((value: number) => {
    const clamped = Math.max(1, Math.min(8, value));
    setCharacterExtractionConcurrency(clamped);
    void persistAppState({ characterExtractionConcurrency: clamped }).catch((e) =>
      console.error("Failed to persist characterExtractionConcurrency:", e),
    );
  }, []);

  const handleAiApiKeyChange = useCallback((apiKey: string) => {
    setAiApiKey(apiKey);
    void persistAppState({ aiApiKey: apiKey }).catch((e) =>
      console.error("Failed to persist aiApiKey:", e),
    );
  }, []);

  const handleAiBaseUrlChange = useCallback((baseUrl: string) => {
    setAiBaseUrl(baseUrl);
    void persistAppState({ aiBaseUrl: baseUrl }).catch((e) =>
      console.error("Failed to persist aiBaseUrl:", e),
    );
  }, []);

  const handleAiModelIdChange = useCallback((modelId: string) => {
    setAiModelId(modelId);
    void persistAppState({ aiModelId: modelId }).catch((e) =>
      console.error("Failed to persist aiModelId:", e),
    );
  }, []);

  // Sync AI client configuration whenever relevant settings change
  useEffect(() => {
    if (aiApiKey) {
      configureAiClient({
        apiKey: aiApiKey,
        baseUrl: aiBaseUrl || undefined,
        modelId: aiModelId,
      });
    } else {
      resetAiClient();
    }
  }, [aiApiKey, aiBaseUrl, aiModelId]);

  const handleLintingRuleConfigChange = useCallback(
    (ruleId: string, config: { enabled: boolean; severity: Severity }) => {
      setLintingRuleConfigs((prev) => {
        const next = { ...prev, [ruleId]: config };
        void persistAppState({ lintingRuleConfigs: next }).catch((e) =>
          console.error("Failed to persist lintingRuleConfigs:", e),
        );
        return next;
      });
    },
    [],
  );

  const handleLintingRuleConfigsBatchChange = useCallback(
    (configs: Record<string, { enabled: boolean; severity: Severity; skipDialogue?: boolean }>) => {
      setLintingRuleConfigs(configs);
      void persistAppState({ lintingRuleConfigs: configs }).catch((e) =>
        console.error("Failed to persist lintingRuleConfigs:", e),
      );
    },
    [],
  );

  const handlePowerSaveModeChange = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        const snapshot = { lintingEnabled, lintingRuleConfigs };
        await persistAppState({
          powerSaveMode: true,
          prePowerSaveState: snapshot,
          lintingEnabled: false,
        });
        setPowerSaveMode(true);
        setLintingEnabled(false);
      } else {
        const stored = await fetchAppState();
        const prev = stored?.prePowerSaveState;
        if (prev) {
          setLintingEnabled(prev.lintingEnabled);
          setLintingRuleConfigs(prev.lintingRuleConfigs);
          await persistAppState({
            powerSaveMode: false,
            prePowerSaveState: null,
            lintingEnabled: prev.lintingEnabled,
            lintingRuleConfigs: prev.lintingRuleConfigs,
          });
        } else {
          await persistAppState({ powerSaveMode: false, prePowerSaveState: null });
        }
        setPowerSaveMode(false);
      }
    },
    [lintingEnabled, lintingRuleConfigs],
  );

  const handleAutoPowerSaveOnBatteryChange = useCallback((enabled: boolean) => {
    setAutoPowerSaveOnBattery(enabled);
    void persistAppState({ autoPowerSaveOnBattery: enabled }).catch((e) =>
      console.error("Failed to persist autoPowerSaveOnBattery:", e),
    );
  }, []);

  const handleCorrectionConfigChange = useCallback(
    (partial: Partial<CorrectionConfig>) => {
      if (partial.mode !== undefined) setCorrectionMode(partial.mode);
      if (partial.guidelines !== undefined) setCorrectionGuidelines(partial.guidelines);
      void persistAppState({
        correctionMode: partial.mode ?? correctionMode,
        correctionGuidelines: partial.guidelines ?? correctionGuidelines,
      }).catch((e) => console.error("Failed to persist correctionConfig:", e));
    },
    [correctionMode, correctionGuidelines],
  );

  return {
    aiSettings: {
      lintingEnabled,
      lintingRuleConfigs,
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
      },
      aiBaseUrl,
      aiModelId,
    },
    aiHandlers: {
      handleLintingEnabledChange,
      handleLintingRuleConfigChange,
      handleLintingRuleConfigsBatchChange,
      handleCharacterExtractionBatchSizeChange,
      handleCharacterExtractionConcurrencyChange,
      handlePowerSaveModeChange,
      handleAutoPowerSaveOnBatteryChange,
      handleCorrectionConfigChange,
      handleAiApiKeyChange,
      handleAiBaseUrlChange,
      handleAiModelIdChange,
      setLintingEnabled,
      setLintingRuleConfigs,
    },
    applyPersistedAiSettings,
  };
}
