import type { Dispatch, SetStateAction } from "react";
import { useCallback, useState } from "react";

import { persistAppState } from "@/lib/storage/app-state-manager";

export interface DisplaySettings {
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
  speechVoiceURI: string;
  speechRate: number;
  speechPitch: number;
  speechVolume: number;
}

export interface DisplaySettingsHandlers {
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
  handleSpeechVoiceURIChange: (value: string) => void;
  handleSpeechRateChange: (value: number) => void;
  handleSpeechPitchChange: (value: number) => void;
  handleSpeechVolumeChange: (value: number) => void;
}

export interface DisplaySettingsSetters {
  /** Direct setters exposed for Electron IPC format-change handler */
  setLineHeight: Dispatch<SetStateAction<number>>;
  setParagraphSpacing: Dispatch<SetStateAction<number>>;
  setTextIndent: Dispatch<SetStateAction<number>>;
  setCharsPerLine: Dispatch<SetStateAction<number>>;
  setShowParagraphNumbers: Dispatch<SetStateAction<boolean>>;
  setCompactMode: Dispatch<SetStateAction<boolean>>;
}

export interface UseDisplaySettingsResult {
  displaySettings: DisplaySettings;
  displayHandlers: DisplaySettingsHandlers;
  displaySetters: DisplaySettingsSetters;
  /** Apply persisted values loaded from app state */
  applyPersistedDisplaySettings: (appState: Record<string, unknown>) => void;
}

/**
 * Manages visual display settings: fonts, layout, scroll, POS highlight,
 * paragraph numbers, compact mode, and the settings modal toggle.
 *
 * @param incrementEditorKey - called after settings that require an editor remount
 */
export function useDisplaySettings(
  incrementEditorKey: () => void,
): UseDisplaySettingsResult {
  const [fontScale, setFontScale] = useState(100);
  const [lineHeight, setLineHeight] = useState(1.8);
  const [paragraphSpacing, setParagraphSpacing] = useState(0.5);
  const [textIndent, setTextIndent] = useState(1);
  const [fontFamily, setFontFamily] = useState("Noto Serif JP");
  const [charsPerLine, setCharsPerLine] = useState(40);
  const [autoCharsPerLine, setAutoCharsPerLine] = useState(true);
  const [showParagraphNumbers, setShowParagraphNumbers] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  const [posHighlightEnabled, setPosHighlightEnabled] = useState(false);
  const [posHighlightColors, setPosHighlightColors] = useState<Record<string, string>>({});
  const [posHighlightDisabledTypes, setPosHighlightDisabledTypes] = useState<string[]>([]);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [speechVoiceURI, setSpeechVoiceURI] = useState("");
  const [speechRate, setSpeechRate] = useState(1.0);
  const [speechPitch, setSpeechPitch] = useState(1.0);
  const [speechVolume, setSpeechVolume] = useState(1.0);
  const [verticalScrollBehavior, setVerticalScrollBehavior] = useState<"auto" | "mouse" | "trackpad">("auto");
  const [scrollSensitivity, setScrollSensitivity] = useState(1.0);
  const [compactMode, setCompactMode] = useState(false);

  /** Apply values from a loaded app state object */
  const applyPersistedDisplaySettings = useCallback((appState: Record<string, unknown>) => {
    if (typeof appState.fontScale === "number") setFontScale(appState.fontScale);
    if (typeof appState.lineHeight === "number") setLineHeight(appState.lineHeight);
    if (typeof appState.paragraphSpacing === "number") setParagraphSpacing(appState.paragraphSpacing);
    if (typeof appState.textIndent === "number") setTextIndent(appState.textIndent);
    if (typeof appState.fontFamily === "string") setFontFamily(appState.fontFamily);
    if (typeof appState.charsPerLine === "number") setCharsPerLine(appState.charsPerLine);
    if (typeof appState.autoCharsPerLine === "boolean") setAutoCharsPerLine(appState.autoCharsPerLine);
    if (typeof appState.showParagraphNumbers === "boolean") setShowParagraphNumbers(appState.showParagraphNumbers);
    if (typeof appState.autoSave === "boolean") setAutoSave(appState.autoSave);
    if (typeof appState.posHighlightEnabled === "boolean") setPosHighlightEnabled(appState.posHighlightEnabled);
    if (appState.posHighlightColors && typeof appState.posHighlightColors === "object") {
      setPosHighlightColors(appState.posHighlightColors as Record<string, string>);
    }
    if (Array.isArray(appState.posHighlightDisabledTypes)) {
      setPosHighlightDisabledTypes(appState.posHighlightDisabledTypes as string[]);
    }
    if (appState.verticalScrollBehavior) {
      setVerticalScrollBehavior(appState.verticalScrollBehavior as "auto" | "mouse" | "trackpad");
    }
    if (typeof appState.scrollSensitivity === "number") setScrollSensitivity(appState.scrollSensitivity);
    if (typeof appState.compactMode === "boolean") setCompactMode(appState.compactMode);
    if (typeof appState.speechVoiceURI === "string") setSpeechVoiceURI(appState.speechVoiceURI);
    if (typeof appState.speechRate === "number") setSpeechRate(appState.speechRate);
    if (typeof appState.speechPitch === "number") setSpeechPitch(appState.speechPitch);
    if (typeof appState.speechVolume === "number") setSpeechVolume(appState.speechVolume);
  }, []);

  const handleFontScaleChange = useCallback((value: number) => {
    setFontScale(value);
    incrementEditorKey();
    void persistAppState({ fontScale: value }).catch((e) => console.error("Failed to persist fontScale:", e));
  }, [incrementEditorKey]);

  const handleLineHeightChange = useCallback((value: number) => {
    setLineHeight(value);
    incrementEditorKey();
    void persistAppState({ lineHeight: value }).catch((e) => console.error("Failed to persist lineHeight:", e));
  }, [incrementEditorKey]);

  const handleParagraphSpacingChange = useCallback((value: number) => {
    setParagraphSpacing(value);
    incrementEditorKey();
    void persistAppState({ paragraphSpacing: value }).catch((e) => console.error("Failed to persist paragraphSpacing:", e));
  }, [incrementEditorKey]);

  const handleTextIndentChange = useCallback((value: number) => {
    setTextIndent(value);
    incrementEditorKey();
    void persistAppState({ textIndent: value }).catch((e) => console.error("Failed to persist textIndent:", e));
  }, [incrementEditorKey]);

  const handleFontFamilyChange = useCallback((value: string) => {
    setFontFamily(value);
    incrementEditorKey();
    void persistAppState({ fontFamily: value }).catch((e) => console.error("Failed to persist fontFamily:", e));
  }, [incrementEditorKey]);

  const handleCharsPerLineChange = useCallback((value: number) => {
    const clamped = Math.max(1, value);
    setCharsPerLine(clamped);
    incrementEditorKey();
    void persistAppState({ charsPerLine: clamped }).catch((e) => console.error("Failed to persist charsPerLine:", e));
  }, [incrementEditorKey]);

  const handleAutoCharsPerLineChange = useCallback((value?: boolean) => {
    setAutoCharsPerLine((prev) => {
      const next = value !== undefined ? value : !prev;
      void persistAppState({ autoCharsPerLine: next }).catch((e) => console.error("Failed to persist autoCharsPerLine:", e));
      return next;
    });
  }, []);

  const handleShowParagraphNumbersChange = useCallback((value: boolean) => {
    setShowParagraphNumbers(value);
    void persistAppState({ showParagraphNumbers: value }).catch((e) => console.error("Failed to persist showParagraphNumbers:", e));
  }, []);

  const handleAutoSaveChange = useCallback((value: boolean) => {
    setAutoSave(value);
    void persistAppState({ autoSave: value }).catch((e) => console.error("Failed to persist autoSave:", e));
  }, []);

  const handlePosHighlightEnabledChange = useCallback((value: boolean) => {
    setPosHighlightEnabled(value);
    void persistAppState({ posHighlightEnabled: value }).catch((e) => console.error("Failed to persist posHighlightEnabled:", e));
  }, []);

  const handlePosHighlightColorsChange = useCallback((value: Record<string, string>) => {
    setPosHighlightColors(value);
    void persistAppState({ posHighlightColors: value }).catch((e) => console.error("Failed to persist posHighlightColors:", e));
  }, []);

  const handlePosHighlightDisabledTypesChange = useCallback((value: string[]) => {
    setPosHighlightDisabledTypes(value);
    void persistAppState({ posHighlightDisabledTypes: value }).catch((e) => console.error("Failed to persist posHighlightDisabledTypes:", e));
  }, []);

  const handleVerticalScrollBehaviorChange = useCallback((value: "auto" | "mouse" | "trackpad") => {
    setVerticalScrollBehavior(value);
    void persistAppState({ verticalScrollBehavior: value }).catch((e) => console.error("Failed to persist verticalScrollBehavior:", e));
  }, []);

  const handleScrollSensitivityChange = useCallback((value: number) => {
    setScrollSensitivity(value);
    void persistAppState({ scrollSensitivity: value }).catch((e) => console.error("Failed to persist scrollSensitivity:", e));
  }, []);

  const handleToggleCompactMode = useCallback(() => {
    setCompactMode((prev) => {
      const next = !prev;
      void persistAppState({ compactMode: next }).catch((e) => console.error("Failed to persist compactMode:", e));
      return next;
    });
  }, []);

  const handleSpeechVoiceURIChange = useCallback((value: string) => {
    setSpeechVoiceURI(value);
    void persistAppState({ speechVoiceURI: value }).catch((e) => console.error("Failed to persist speechVoiceURI:", e));
  }, []);

  const handleSpeechRateChange = useCallback((value: number) => {
    setSpeechRate(value);
    void persistAppState({ speechRate: value }).catch((e) => console.error("Failed to persist speechRate:", e));
  }, []);

  const handleSpeechPitchChange = useCallback((value: number) => {
    setSpeechPitch(value);
    void persistAppState({ speechPitch: value }).catch((e) => console.error("Failed to persist speechPitch:", e));
  }, []);

  const handleSpeechVolumeChange = useCallback((value: number) => {
    setSpeechVolume(value);
    void persistAppState({ speechVolume: value }).catch((e) => console.error("Failed to persist speechVolume:", e));
  }, []);

  return {
    displaySettings: {
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
      speechVoiceURI,
      speechRate,
      speechPitch,
      speechVolume,
    },
    displayHandlers: {
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
      handleSpeechVoiceURIChange,
      handleSpeechRateChange,
      handleSpeechPitchChange,
      handleSpeechVolumeChange,
    },
    displaySetters: {
      setLineHeight,
      setParagraphSpacing,
      setTextIndent,
      setCharsPerLine,
      setShowParagraphNumbers,
      setCompactMode,
    },
    applyPersistedDisplaySettings,
  };
}
