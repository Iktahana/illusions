import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useState } from "react";

import { fetchAppState, persistAppState } from "@/lib/app-state-manager";
import type { Severity } from "@/lib/linting/types";

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
  verticalScrollBehavior: "auto" | "mouse" | "trackpad";
  scrollSensitivity: number;
  compactMode: boolean;
  showSettingsModal: boolean;
  lintingEnabled: boolean;
  lintingRuleConfigs: Record<string, { enabled: boolean; severity: Severity }>;
  llmEnabled: boolean;
  llmModelId: string;
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
  handleVerticalScrollBehaviorChange: (value: "auto" | "mouse" | "trackpad") => void;
  handleScrollSensitivityChange: (value: number) => void;
  handleToggleCompactMode: () => void;
  setShowSettingsModal: (value: boolean) => void;
  handleLintingEnabledChange: (value: boolean) => void;
  handleLintingRuleConfigChange: (ruleId: string, config: { enabled: boolean; severity: Severity }) => void;
  handleLintingRuleConfigsBatchChange: (configs: Record<string, { enabled: boolean; severity: Severity }>) => void;
  handleLlmEnabledChange: (value: boolean) => void;
  handleLlmModelIdChange: (modelId: string) => void;
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
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [verticalScrollBehavior, setVerticalScrollBehavior] = useState<"auto" | "mouse" | "trackpad">("auto");
  const [scrollSensitivity, setScrollSensitivity] = useState(1.0);
  const [compactMode, setCompactMode] = useState(false);
  const [lintingEnabled, setLintingEnabled] = useState(true);
  const [lintingRuleConfigs, setLintingRuleConfigs] = useState<Record<string, { enabled: boolean; severity: Severity }>>({});
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [llmModelId, setLlmModelId] = useState("qwen3-1.7b-q8");

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
        if (typeof appState.llmEnabled === "boolean") {
          setLlmEnabled(appState.llmEnabled);
        }
        if (typeof appState.llmModelId === "string") {
          setLlmModelId(appState.llmModelId);
        }
        if (appState.lintingRuleConfigs && typeof appState.lintingRuleConfigs === "object") {
          const isSeverity = (v: unknown): v is Severity =>
            v === "error" || v === "warning" || v === "info";
          const sanitized: Record<string, { enabled: boolean; severity: Severity }> = {};
          for (const [ruleId, config] of Object.entries(appState.lintingRuleConfigs)) {
            const cfg = config as { enabled?: unknown; severity?: unknown };
            if (typeof cfg.enabled === "boolean" && isSeverity(cfg.severity)) {
              sanitized[ruleId] = { enabled: cfg.enabled, severity: cfg.severity };
            }
          }
          setLintingRuleConfigs(sanitized);
        }
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

  const handleLlmEnabledChange = useCallback((value: boolean) => {
    setLlmEnabled(value);
    void persistAppState({ llmEnabled: value }).catch((error) => {
      console.error("Failed to persist llmEnabled:", error);
    });
  }, []);

  const handleLlmModelIdChange = useCallback((modelId: string) => {
    setLlmModelId(modelId);
    void persistAppState({ llmModelId: modelId }).catch((error) => {
      console.error("Failed to persist llmModelId:", error);
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

  const handleLintingRuleConfigsBatchChange = useCallback((configs: Record<string, { enabled: boolean; severity: Severity }>) => {
    setLintingRuleConfigs(configs);
    void persistAppState({ lintingRuleConfigs: configs }).catch((error) => {
      console.error("Failed to persist lintingRuleConfigs:", error);
    });
  }, []);

  return {
    settings: {
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
      verticalScrollBehavior,
      scrollSensitivity,
      compactMode,
      showSettingsModal,
      lintingEnabled,
      lintingRuleConfigs,
      llmEnabled,
      llmModelId,
    },
    handlers: {
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
      handleVerticalScrollBehaviorChange,
      handleScrollSensitivityChange,
      handleToggleCompactMode,
      setShowSettingsModal,
      handleLintingEnabledChange,
      handleLintingRuleConfigChange,
      handleLintingRuleConfigsBatchChange,
      handleLlmEnabledChange,
      handleLlmModelIdChange,
    },
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
