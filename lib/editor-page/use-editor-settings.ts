import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchAppState, persistAppState } from "@/lib/storage/app-state-manager";
import type { Severity } from "@/lib/linting/types";
import type { CorrectionConfig, CorrectionModeId, GuidelineId } from "@/lib/linting/correction-config";
import { DEFAULT_CORRECTION_CONFIG } from "@/lib/linting/correction-config";

export interface EditorSettings {
  fontScale: number;
  lineHeight: number;
  paragraphSpacing: number;
  textIndent: number;
  fontFamily: string;
  charsPerLine: number;
  autoCharsPerLine: boolean;
  showParagraphNumbers: boolean;
  autoSave: boolean;
  posHighlightEnabled: boolean;
  posHighlightColors: Record<string, string>;
  posHighlightDisabledTypes: string[];
  verticalScrollBehavior: "auto" | "mouse" | "trackpad";
  scrollSensitivity: number;
  compactMode: boolean;
  showSettingsModal: boolean;
  lintingEnabled: boolean;
  lintingRuleConfigs: Record<string, { enabled: boolean; severity: Severity }>;
  characterExtractionBatchSize: number;
  characterExtractionConcurrency: number;
  powerSaveMode: boolean;
  autoPowerSaveOnBattery: boolean;
  /** Unified correction config derived from individual linting fields */
  correctionConfig: CorrectionConfig;
  speechVoiceURI: string;
  speechRate: number;
  speechPitch: number;
  speechVolume: number;
}

export interface EditorSettingsHandlers {
  handleFontScaleChange: (value: number) => void;
  handleLineHeightChange: (value: number) => void;
  handleParagraphSpacingChange: (value: number) => void;
  handleTextIndentChange: (value: number) => void;
  handleFontFamilyChange: (value: string) => void;
  handleCharsPerLineChange: (value: number) => void;
  handleAutoCharsPerLineChange: (value?: boolean) => void;
  handleShowParagraphNumbersChange: (value: boolean) => void;
  handleAutoSaveChange: (value: boolean) => void;
  handlePosHighlightEnabledChange: (value: boolean) => void;
  handlePosHighlightColorsChange: (value: Record<string, string>) => void;
  handlePosHighlightDisabledTypesChange: (value: string[]) => void;
  handleVerticalScrollBehaviorChange: (value: "auto" | "mouse" | "trackpad") => void;
  handleScrollSensitivityChange: (value: number) => void;
  handleToggleCompactMode: () => void;
  setShowSettingsModal: (value: boolean) => void;
  handleLintingEnabledChange: (value: boolean) => void;
  handleLintingRuleConfigChange: (ruleId: string, config: { enabled: boolean; severity: Severity }) => void;
  handleLintingRuleConfigsBatchChange: (configs: Record<string, { enabled: boolean; severity: Severity }>) => void;
  handleCharacterExtractionBatchSizeChange: (value: number) => void;
  handleCharacterExtractionConcurrencyChange: (value: number) => void;
  handlePowerSaveModeChange: (enabled: boolean) => void;
  handleAutoPowerSaveOnBatteryChange: (enabled: boolean) => void;
  handleCorrectionConfigChange: (partial: Partial<CorrectionConfig>) => void;
  handleSpeechVoiceURIChange: (value: string) => void;
  handleSpeechRateChange: (value: number) => void;
  handleSpeechPitchChange: (value: number) => void;
  handleSpeechVolumeChange: (value: number) => void;
}

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
 * Manages all editor display settings, persists them to app state,
 * and loads saved values on mount.
 *
 * @param incrementEditorKey - callback to increment the editor key, forcing a remount
 */
export function useEditorSettings(
  incrementEditorKey: () => void,
): UseEditorSettingsResult {
  // Editor display settings state
  const [fontScale, setFontScale] = useState(100);
  const [lineHeight, setLineHeight] = useState(1.8);
  const [paragraphSpacing, setParagraphSpacing] = useState(0.5);
  const [textIndent, setTextIndent] = useState(1);
  const [fontFamily, setFontFamily] = useState('Noto Serif JP');
  const [charsPerLine, setCharsPerLine] = useState(40);
  const [autoCharsPerLine, setAutoCharsPerLine] = useState(true);
  const [showParagraphNumbers, setShowParagraphNumbers] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  const [posHighlightEnabled, setPosHighlightEnabled] = useState(false);
  const [posHighlightColors, setPosHighlightColors] = useState<Record<string, string>>({});
  const [posHighlightDisabledTypes, setPosHighlightDisabledTypes] = useState<string[]>([]);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [verticalScrollBehavior, setVerticalScrollBehavior] = useState<"auto" | "mouse" | "trackpad">("auto");
  const [scrollSensitivity, setScrollSensitivity] = useState(1.0);
  const [compactMode, setCompactMode] = useState(false);
  const [lintingEnabled, setLintingEnabled] = useState(true);
  const [lintingRuleConfigs, setLintingRuleConfigs] = useState<Record<string, { enabled: boolean; severity: Severity }>>({});
  const [characterExtractionBatchSize, setCharacterExtractionBatchSize] = useState(3);
  const [characterExtractionConcurrency, setCharacterExtractionConcurrency] = useState(4);
  const [powerSaveMode, setPowerSaveMode] = useState(false);
  const [autoPowerSaveOnBattery, setAutoPowerSaveOnBattery] = useState(true);
  const [correctionMode, setCorrectionMode] = useState<CorrectionModeId>("novel");
  const [correctionGuidelines, setCorrectionGuidelines] = useState<GuidelineId[]>(DEFAULT_CORRECTION_CONFIG.guidelines);
  const [speechVoiceURI, setSpeechVoiceURI] = useState("");
  const [speechRate, setSpeechRate] = useState(1.0);
  const [speechPitch, setSpeechPitch] = useState(1.0);
  const [speechVolume, setSpeechVolume] = useState(1.0);

  // Load persisted settings on mount
  useEffect(() => {
    let mounted = true;

    const loadSettings = async () => {
      try {
        const appState = await fetchAppState();
        if (!mounted || !appState) return;
        if (typeof appState.fontScale === "number") {
          setFontScale(appState.fontScale);
        }
        if (typeof appState.lineHeight === "number") {
          setLineHeight(appState.lineHeight);
        }
        if (typeof appState.paragraphSpacing === "number") {
          setParagraphSpacing(appState.paragraphSpacing);
        }
        if (typeof appState.textIndent === "number") {
          setTextIndent(appState.textIndent);
        }
        if (typeof appState.fontFamily === "string") {
          setFontFamily(appState.fontFamily);
        }
        if (typeof appState.charsPerLine === "number") {
          setCharsPerLine(appState.charsPerLine);
        }
        if (typeof appState.autoCharsPerLine === "boolean") {
          setAutoCharsPerLine(appState.autoCharsPerLine);
        }
        if (typeof appState.showParagraphNumbers === "boolean") {
          setShowParagraphNumbers(appState.showParagraphNumbers);
        }
        if (typeof appState.autoSave === "boolean") {
          setAutoSave(appState.autoSave);
        }
        if (typeof appState.posHighlightEnabled === "boolean") {
          setPosHighlightEnabled(appState.posHighlightEnabled);
        }
        if (appState.posHighlightColors && typeof appState.posHighlightColors === "object") {
          setPosHighlightColors(appState.posHighlightColors);
        }
        if (Array.isArray(appState.posHighlightDisabledTypes)) {
          setPosHighlightDisabledTypes(appState.posHighlightDisabledTypes);
        }
        if (appState.verticalScrollBehavior) {
          setVerticalScrollBehavior(appState.verticalScrollBehavior);
        }
        if (typeof appState.scrollSensitivity === "number") {
          setScrollSensitivity(appState.scrollSensitivity);
        }
        if (typeof appState.compactMode === "boolean") {
          setCompactMode(appState.compactMode);
        }
        if (typeof appState.lintingEnabled === "boolean") {
          setLintingEnabled(appState.lintingEnabled);
        }
        if (appState.lintingRuleConfigs && typeof appState.lintingRuleConfigs === "object") {
          const isSeverity = (v: unknown): v is Severity =>
            v === "error" || v === "warning" || v === "info";
          const sanitized: Record<string, { enabled: boolean; severity: Severity; skipDialogue?: boolean }> = {};
          for (const [ruleId, config] of Object.entries(appState.lintingRuleConfigs)) {
            const cfg = config as { enabled?: unknown; severity?: unknown; skipDialogue?: unknown };
            if (typeof cfg.enabled === "boolean" && isSeverity(cfg.severity)) {
              const entry: { enabled: boolean; severity: Severity; skipDialogue?: boolean } = { enabled: cfg.enabled, severity: cfg.severity };
              if (typeof cfg.skipDialogue === "boolean") {
                entry.skipDialogue = cfg.skipDialogue;
              }
              sanitized[ruleId] = entry;
            }
          }
          setLintingRuleConfigs(sanitized);
        }
        if (appState.powerSaveMode !== undefined) setPowerSaveMode(appState.powerSaveMode);
        if (appState.autoPowerSaveOnBattery !== undefined) setAutoPowerSaveOnBattery(appState.autoPowerSaveOnBattery);
        if (appState.correctionMode) setCorrectionMode(appState.correctionMode);
        if (appState.correctionGuidelines) setCorrectionGuidelines(appState.correctionGuidelines);
        if (typeof appState.characterExtractionBatchSize === "number") {
          setCharacterExtractionBatchSize(Math.min(Math.max(appState.characterExtractionBatchSize, 1), 10));
        }
        if (typeof appState.characterExtractionConcurrency === "number") {
          setCharacterExtractionConcurrency(Math.min(Math.max(appState.characterExtractionConcurrency, 1), 8));
        }
        if (typeof appState.speechVoiceURI === "string") setSpeechVoiceURI(appState.speechVoiceURI);
        if (typeof appState.speechRate === "number") setSpeechRate(appState.speechRate);
        if (typeof appState.speechPitch === "number") setSpeechPitch(appState.speechPitch);
        if (typeof appState.speechVolume === "number") setSpeechVolume(appState.speechVolume);
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

  // --- Handler callbacks ---

  const handleFontScaleChange = useCallback((value: number) => {
    setFontScale(value);
    incrementEditorKey();
    void persistAppState({ fontScale: value }).catch((error) => {
      console.error("Failed to persist fontScale:", error);
    });
  }, [incrementEditorKey]);

  const handleLineHeightChange = useCallback((value: number) => {
    setLineHeight(value);
    incrementEditorKey();
    void persistAppState({ lineHeight: value }).catch((error) => {
      console.error("Failed to persist lineHeight:", error);
    });
  }, [incrementEditorKey]);

  const handleParagraphSpacingChange = useCallback((value: number) => {
    setParagraphSpacing(value);
    incrementEditorKey();
    void persistAppState({ paragraphSpacing: value }).catch((error) => {
      console.error("Failed to persist paragraphSpacing:", error);
    });
  }, [incrementEditorKey]);

  const handleTextIndentChange = useCallback((value: number) => {
    setTextIndent(value);
    incrementEditorKey();
    void persistAppState({ textIndent: value }).catch((error) => {
      console.error("Failed to persist textIndent:", error);
    });
  }, [incrementEditorKey]);

  const handleFontFamilyChange = useCallback((value: string) => {
    setFontFamily(value);
    incrementEditorKey();
    void persistAppState({ fontFamily: value }).catch((error) => {
      console.error("Failed to persist fontFamily:", error);
    });
  }, [incrementEditorKey]);

  const handleCharsPerLineChange = useCallback((value: number) => {
    const clamped = Math.max(1, value);
    setCharsPerLine(clamped);
    incrementEditorKey();
    void persistAppState({ charsPerLine: clamped }).catch((error) => {
      console.error("Failed to persist charsPerLine:", error);
    });
  }, [incrementEditorKey]);

  const handleAutoCharsPerLineChange = useCallback((value?: boolean) => {
    setAutoCharsPerLine(prev => {
      const next = value !== undefined ? value : !prev;
      void persistAppState({ autoCharsPerLine: next }).catch((error) => {
        console.error("Failed to persist autoCharsPerLine:", error);
      });
      return next;
    });
  }, []);

  const handleShowParagraphNumbersChange = useCallback((value: boolean) => {
    setShowParagraphNumbers(value);
    void persistAppState({ showParagraphNumbers: value }).catch((error) => {
      console.error("Failed to persist showParagraphNumbers:", error);
    });
  }, []);

  const handleAutoSaveChange = useCallback((value: boolean) => {
    setAutoSave(value);
    void persistAppState({ autoSave: value }).catch((error) => {
      console.error("Failed to persist autoSave:", error);
    });
  }, []);

  const handlePosHighlightEnabledChange = useCallback((value: boolean) => {
    setPosHighlightEnabled(value);
    void persistAppState({ posHighlightEnabled: value }).catch((error) => {
      console.error("Failed to persist posHighlightEnabled:", error);
    });
  }, []);

  const handlePosHighlightColorsChange = useCallback((value: Record<string, string>) => {
    setPosHighlightColors(value);
    void persistAppState({ posHighlightColors: value }).catch((error) => {
      console.error("Failed to persist posHighlightColors:", error);
    });
  }, []);

  const handlePosHighlightDisabledTypesChange = useCallback((value: string[]) => {
    setPosHighlightDisabledTypes(value);
    void persistAppState({ posHighlightDisabledTypes: value }).catch((error) => {
      console.error("Failed to persist posHighlightDisabledTypes:", error);
    });
  }, []);

  const handleVerticalScrollBehaviorChange = useCallback((value: "auto" | "mouse" | "trackpad") => {
    setVerticalScrollBehavior(value);
    void persistAppState({ verticalScrollBehavior: value }).catch((error) => {
      console.error("Failed to persist verticalScrollBehavior:", error);
    });
  }, []);

  const handleScrollSensitivityChange = useCallback((value: number) => {
    setScrollSensitivity(value);
    void persistAppState({ scrollSensitivity: value }).catch((error) => {
      console.error("Failed to persist scrollSensitivity:", error);
    });
  }, []);

  const handleToggleCompactMode = useCallback(() => {
    setCompactMode(prev => {
      const next = !prev;
      void persistAppState({ compactMode: next }).catch((error) => {
        console.error("Failed to persist compactMode:", error);
      });
      return next;
    });
  }, []);

  const handleLintingEnabledChange = useCallback((value: boolean) => {
    setLintingEnabled(value);
    void persistAppState({ lintingEnabled: value }).catch((error) => {
      console.error("Failed to persist lintingEnabled:", error);
    });
  }, []);

  const handleCharacterExtractionBatchSizeChange = useCallback((value: number) => {
    const clamped = Math.max(1, Math.min(10, value));
    setCharacterExtractionBatchSize(clamped);
    void persistAppState({ characterExtractionBatchSize: clamped }).catch((error) => {
      console.error("Failed to persist characterExtractionBatchSize:", error);
    });
  }, []);

  const handleCharacterExtractionConcurrencyChange = useCallback((value: number) => {
    const clamped = Math.max(1, Math.min(8, value));
    setCharacterExtractionConcurrency(clamped);
    void persistAppState({ characterExtractionConcurrency: clamped }).catch((error) => {
      console.error("Failed to persist characterExtractionConcurrency:", error);
    });
  }, []);

  const handleLintingRuleConfigChange = useCallback((ruleId: string, config: { enabled: boolean; severity: Severity }) => {
    setLintingRuleConfigs(prev => {
      const next = { ...prev, [ruleId]: config };
      void persistAppState({ lintingRuleConfigs: next }).catch((error) => {
        console.error("Failed to persist lintingRuleConfigs:", error);
      });
      return next;
    });
  }, []);

  const handleLintingRuleConfigsBatchChange = useCallback((configs: Record<string, { enabled: boolean; severity: Severity; skipDialogue?: boolean }>) => {
    setLintingRuleConfigs(configs);
    void persistAppState({ lintingRuleConfigs: configs }).catch((error) => {
      console.error("Failed to persist lintingRuleConfigs:", error);
    });
  }, []);

  const handlePowerSaveModeChange = useCallback(async (enabled: boolean) => {
    if (enabled) {
      // Save current state before enabling power save
      const snapshot = {
        lintingEnabled,
        lintingRuleConfigs,
      };
      await persistAppState({
        powerSaveMode: true,
        prePowerSaveState: snapshot,
        lintingEnabled: false,
      });
      setPowerSaveMode(true);
      setLintingEnabled(false);
    } else {
      // Restore previous state
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
  }, [lintingEnabled, lintingRuleConfigs]);

  const handleAutoPowerSaveOnBatteryChange = useCallback((enabled: boolean) => {
    setAutoPowerSaveOnBattery(enabled);
    void persistAppState({ autoPowerSaveOnBattery: enabled }).catch((error) => {
      console.error("Failed to persist autoPowerSaveOnBattery:", error);
    });
  }, []);

  const handleCorrectionConfigChange = useCallback((partial: Partial<CorrectionConfig>) => {
    if (partial.mode !== undefined) {
      setCorrectionMode(partial.mode);
    }
    if (partial.guidelines !== undefined) {
      setCorrectionGuidelines(partial.guidelines);
    }
    void persistAppState({
      correctionMode: partial.mode ?? correctionMode,
      correctionGuidelines: partial.guidelines ?? correctionGuidelines,
    }).catch((error) => {
      console.error("Failed to persist correctionConfig:", error);
    });
  }, [correctionMode, correctionGuidelines]);

  const handleSpeechVoiceURIChange = useCallback((value: string) => {
    setSpeechVoiceURI(value);
    void persistAppState({ speechVoiceURI: value }).catch((error) => {
      console.error("Failed to persist speechVoiceURI:", error);
    });
  }, []);

  const handleSpeechRateChange = useCallback((value: number) => {
    setSpeechRate(value);
    void persistAppState({ speechRate: value }).catch((error) => {
      console.error("Failed to persist speechRate:", error);
    });
  }, []);

  const handleSpeechPitchChange = useCallback((value: number) => {
    setSpeechPitch(value);
    void persistAppState({ speechPitch: value }).catch((error) => {
      console.error("Failed to persist speechPitch:", error);
    });
  }, []);

  const handleSpeechVolumeChange = useCallback((value: number) => {
    setSpeechVolume(value);
    void persistAppState({ speechVolume: value }).catch((error) => {
      console.error("Failed to persist speechVolume:", error);
    });
  }, []);

  const settings = useMemo<EditorSettings>(() => ({
    fontScale,
    lineHeight,
    paragraphSpacing,
    textIndent,
    fontFamily,
    charsPerLine,
    autoCharsPerLine,
    showParagraphNumbers,
    autoSave,
    posHighlightEnabled,
    posHighlightColors,
    posHighlightDisabledTypes,
    verticalScrollBehavior,
    scrollSensitivity,
    compactMode,
    showSettingsModal,
    lintingEnabled,
    lintingRuleConfigs,
    characterExtractionBatchSize,
    characterExtractionConcurrency,
    powerSaveMode,
    autoPowerSaveOnBattery,
    speechVoiceURI,
    speechRate,
    speechPitch,
    speechVolume,
    correctionConfig: {
      ...DEFAULT_CORRECTION_CONFIG,
      enabled: lintingEnabled,
      mode: correctionMode,
      guidelines: correctionGuidelines,
      ruleOverrides: lintingRuleConfigs,
    },
  }), [
    fontScale, lineHeight, paragraphSpacing, textIndent, fontFamily,
    charsPerLine, autoCharsPerLine, showParagraphNumbers, autoSave,
    posHighlightEnabled, posHighlightColors, posHighlightDisabledTypes, verticalScrollBehavior,
    scrollSensitivity, compactMode, showSettingsModal,
    lintingEnabled, lintingRuleConfigs,
    characterExtractionBatchSize, characterExtractionConcurrency,
    powerSaveMode, autoPowerSaveOnBattery, correctionMode, correctionGuidelines,
    speechVoiceURI, speechRate, speechPitch, speechVolume,
  ]);

  const handlers = useMemo<EditorSettingsHandlers>(() => ({
    handleFontScaleChange,
    handleLineHeightChange,
    handleParagraphSpacingChange,
    handleTextIndentChange,
    handleFontFamilyChange,
    handleCharsPerLineChange,
    handleAutoCharsPerLineChange,
    handleShowParagraphNumbersChange,
    handleAutoSaveChange,
    handlePosHighlightEnabledChange,
    handlePosHighlightColorsChange,
    handlePosHighlightDisabledTypesChange,
    handleVerticalScrollBehaviorChange,
    handleScrollSensitivityChange,
    handleToggleCompactMode,
    setShowSettingsModal,
    handleLintingEnabledChange,
    handleLintingRuleConfigChange,
    handleLintingRuleConfigsBatchChange,
    handleCharacterExtractionBatchSizeChange,
    handleCharacterExtractionConcurrencyChange,
    handlePowerSaveModeChange,
    handleAutoPowerSaveOnBatteryChange,
    handleCorrectionConfigChange,
    handleSpeechVoiceURIChange,
    handleSpeechRateChange,
    handleSpeechPitchChange,
    handleSpeechVolumeChange,
  }), [
    handleFontScaleChange, handleLineHeightChange, handleParagraphSpacingChange,
    handleTextIndentChange, handleFontFamilyChange, handleCharsPerLineChange,
    handleAutoCharsPerLineChange, handleShowParagraphNumbersChange,
    handleAutoSaveChange, handlePosHighlightEnabledChange,
    handlePosHighlightColorsChange, handlePosHighlightDisabledTypesChange,
    handleVerticalScrollBehaviorChange,
    handleScrollSensitivityChange, handleToggleCompactMode, setShowSettingsModal,
    handleLintingEnabledChange, handleLintingRuleConfigChange,
    handleLintingRuleConfigsBatchChange,
    handleCharacterExtractionBatchSizeChange, handleCharacterExtractionConcurrencyChange,
    handlePowerSaveModeChange, handleAutoPowerSaveOnBatteryChange,
    handleCorrectionConfigChange,
    handleSpeechVoiceURIChange, handleSpeechRateChange,
    handleSpeechPitchChange, handleSpeechVolumeChange,
  ]);

  return {
    settings,
    handlers,
    setters: {
      setLineHeight,
      setParagraphSpacing,
      setTextIndent,
      setCharsPerLine,
      setShowParagraphNumbers,
      setCompactMode,
    },
  };
}
