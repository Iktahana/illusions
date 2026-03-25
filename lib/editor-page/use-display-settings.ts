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
  terminalBackground: string;
  terminalForeground: string;
  terminalFontFamily: string;
  terminalFontSize: number;
  terminalLineHeight: number;
  terminalCursorStyle: "block" | "underline" | "bar";
  terminalCursorBlink: boolean;
  terminalScrollback: number;
  terminalCopyOnSelect: boolean;
  terminalMacOptionIsMeta: boolean;
  terminalDefaultShell: string;
  terminalAnsiColors: Record<string, string>;
}

export interface DisplaySettingsHandlers {
  handleFontScaleChange: (value: number) => void;
  handleLineHeightChange: (value: number) => void;
  handleParagraphSpacingChange: (value: number) => void;
  handleTextIndentChange: (value: number) => void;
  handleFontFamilyChange: (value: string) => void;
  handleCharsPerLineChange: (value: number) => void;
  /** Lightweight setter for auto-calculation — updates value + persists, NO editor remount */
  handleAutoCharsPerLineCalc: (value: number) => void;
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
  handleTerminalBackgroundChange: (value: string) => void;
  handleTerminalForegroundChange: (value: string) => void;
  handleTerminalFontFamilyChange: (value: string) => void;
  handleTerminalFontSizeChange: (value: number) => void;
  handleTerminalLineHeightChange: (value: number) => void;
  handleTerminalCursorStyleChange: (value: "block" | "underline" | "bar") => void;
  handleTerminalCursorBlinkChange: (value: boolean) => void;
  handleTerminalScrollbackChange: (value: number) => void;
  handleTerminalCopyOnSelectChange: (value: boolean) => void;
  handleTerminalMacOptionIsMetaChange: (value: boolean) => void;
  handleTerminalDefaultShellChange: (value: string) => void;
  handleTerminalAnsiColorChange: (key: string, value: string) => void;
  handleTerminalAnsiColorsReset: () => void;
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

  // Terminal settings
  const [terminalBackground, setTerminalBackground] = useState("#000000");
  const [terminalForeground, setTerminalForeground] = useState("#f2f2f2");
  const [terminalFontFamily, setTerminalFontFamily] = useState("'JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', monospace");
  const [terminalFontSize, setTerminalFontSize] = useState(12);
  const [terminalLineHeight, setTerminalLineHeight] = useState(1.4);
  const [terminalCursorStyle, setTerminalCursorStyle] = useState<"block" | "underline" | "bar">("block");
  const [terminalCursorBlink, setTerminalCursorBlink] = useState(true);
  const [terminalScrollback, setTerminalScrollback] = useState(5000);
  const [terminalCopyOnSelect, setTerminalCopyOnSelect] = useState(false);
  const [terminalMacOptionIsMeta, setTerminalMacOptionIsMeta] = useState(false);
  const [terminalDefaultShell, setTerminalDefaultShell] = useState("");
  const [terminalAnsiColors, setTerminalAnsiColors] = useState<Record<string, string>>({
    black: "#000000",
    red: "#dc2626",
    green: "#16a34a",
    yellow: "#ca8a04",
    blue: "#2563eb",
    magenta: "#9333ea",
    cyan: "#0d9488",
    white: "#d4d4d4",
    brightBlack: "#737373",
    brightRed: "#ef4444",
    brightGreen: "#22c55e",
    brightYellow: "#eab308",
    brightBlue: "#3b82f6",
    brightMagenta: "#a855f7",
    brightCyan: "#14b8a6",
    brightWhite: "#f5f5f5",
  });

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
    // Terminal settings
    if (typeof appState.terminalBackground === "string") setTerminalBackground(appState.terminalBackground);
    if (typeof appState.terminalForeground === "string") setTerminalForeground(appState.terminalForeground);
    if (typeof appState.terminalFontFamily === "string") setTerminalFontFamily(appState.terminalFontFamily);
    if (typeof appState.terminalFontSize === "number") setTerminalFontSize(appState.terminalFontSize);
    if (typeof appState.terminalLineHeight === "number") setTerminalLineHeight(appState.terminalLineHeight);
    if (appState.terminalCursorStyle === "block" || appState.terminalCursorStyle === "underline" || appState.terminalCursorStyle === "bar") {
      setTerminalCursorStyle(appState.terminalCursorStyle);
    }
    if (typeof appState.terminalCursorBlink === "boolean") setTerminalCursorBlink(appState.terminalCursorBlink);
    if (typeof appState.terminalScrollback === "number") setTerminalScrollback(appState.terminalScrollback);
    if (typeof appState.terminalCopyOnSelect === "boolean") setTerminalCopyOnSelect(appState.terminalCopyOnSelect);
    if (typeof appState.terminalMacOptionIsMeta === "boolean") setTerminalMacOptionIsMeta(appState.terminalMacOptionIsMeta);
    if (typeof appState.terminalDefaultShell === "string") setTerminalDefaultShell(appState.terminalDefaultShell);
    // Restore individual ANSI colors
    const colorKeys = ["Black", "Red", "Green", "Yellow", "Blue", "Magenta", "Cyan", "White",
      "BrightBlack", "BrightRed", "BrightGreen", "BrightYellow", "BrightBlue", "BrightMagenta", "BrightCyan", "BrightWhite"] as const;
    const restoredColors: Record<string, string> = {};
    let hasRestoredColor = false;
    for (const key of colorKeys) {
      const stateKey = `terminalColor${key}`;
      if (typeof (appState as Record<string, unknown>)[stateKey] === "string") {
        const camel = key.charAt(0).toLowerCase() + key.slice(1);
        restoredColors[camel] = (appState as Record<string, unknown>)[stateKey] as string;
        hasRestoredColor = true;
      }
    }
    if (hasRestoredColor) {
      setTerminalAnsiColors((prev) => ({ ...prev, ...restoredColors }));
    }
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

  // Lightweight setter for auto-calculation: updates value + persists but does NOT
  // remount the editor. MilkdownEditor's useEffect applies CSS constraints reactively,
  // so a full remount is unnecessary and would cause a visible "twitch" on tab switch.
  const handleAutoCharsPerLineCalc = useCallback((value: number) => {
    const clamped = Math.max(1, value);
    setCharsPerLine(clamped);
    void persistAppState({ charsPerLine: clamped }).catch((e) => console.error("Failed to persist charsPerLine:", e));
  }, []);

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

  // --- Terminal handlers ---

  const handleTerminalBackgroundChange = useCallback((value: string) => {
    setTerminalBackground(value);
    void persistAppState({ terminalBackground: value }).catch((e) => console.error("Failed to persist terminalBackground:", e));
  }, []);

  const handleTerminalForegroundChange = useCallback((value: string) => {
    setTerminalForeground(value);
    void persistAppState({ terminalForeground: value }).catch((e) => console.error("Failed to persist terminalForeground:", e));
  }, []);

  const handleTerminalFontFamilyChange = useCallback((value: string) => {
    setTerminalFontFamily(value);
    void persistAppState({ terminalFontFamily: value }).catch((e) => console.error("Failed to persist terminalFontFamily:", e));
  }, []);

  const handleTerminalFontSizeChange = useCallback((value: number) => {
    setTerminalFontSize(value);
    void persistAppState({ terminalFontSize: value }).catch((e) => console.error("Failed to persist terminalFontSize:", e));
  }, []);

  const handleTerminalLineHeightChange = useCallback((value: number) => {
    setTerminalLineHeight(value);
    void persistAppState({ terminalLineHeight: value }).catch((e) => console.error("Failed to persist terminalLineHeight:", e));
  }, []);

  const handleTerminalCursorStyleChange = useCallback((value: "block" | "underline" | "bar") => {
    setTerminalCursorStyle(value);
    void persistAppState({ terminalCursorStyle: value }).catch((e) => console.error("Failed to persist terminalCursorStyle:", e));
  }, []);

  const handleTerminalCursorBlinkChange = useCallback((value: boolean) => {
    setTerminalCursorBlink(value);
    void persistAppState({ terminalCursorBlink: value }).catch((e) => console.error("Failed to persist terminalCursorBlink:", e));
  }, []);

  const handleTerminalScrollbackChange = useCallback((value: number) => {
    setTerminalScrollback(value);
    void persistAppState({ terminalScrollback: value }).catch((e) => console.error("Failed to persist terminalScrollback:", e));
  }, []);

  const handleTerminalCopyOnSelectChange = useCallback((value: boolean) => {
    setTerminalCopyOnSelect(value);
    void persistAppState({ terminalCopyOnSelect: value }).catch((e) => console.error("Failed to persist terminalCopyOnSelect:", e));
  }, []);

  const handleTerminalMacOptionIsMetaChange = useCallback((value: boolean) => {
    setTerminalMacOptionIsMeta(value);
    void persistAppState({ terminalMacOptionIsMeta: value }).catch((e) => console.error("Failed to persist terminalMacOptionIsMeta:", e));
  }, []);

  const handleTerminalDefaultShellChange = useCallback((value: string) => {
    setTerminalDefaultShell(value);
    void persistAppState({ terminalDefaultShell: value }).catch((e) => console.error("Failed to persist terminalDefaultShell:", e));
  }, []);

  const handleTerminalAnsiColorChange = useCallback((key: string, value: string) => {
    setTerminalAnsiColors((prev) => {
      const next = { ...prev, [key]: value };
      // Persist as individual fields: terminalColorBlack, terminalColorRed, etc.
      const capitalKey = key.charAt(0).toUpperCase() + key.slice(1);
      void persistAppState({ [`terminalColor${capitalKey}`]: value } as Record<string, string>).catch((e) =>
        console.error(`Failed to persist terminalColor${capitalKey}:`, e),
      );
      return next;
    });
  }, []);

  const DEFAULT_ANSI_COLORS: Record<string, string> = {
    black: "#000000", red: "#dc2626", green: "#16a34a", yellow: "#ca8a04",
    blue: "#2563eb", magenta: "#9333ea", cyan: "#0d9488", white: "#d4d4d4",
    brightBlack: "#737373", brightRed: "#ef4444", brightGreen: "#22c55e", brightYellow: "#eab308",
    brightBlue: "#3b82f6", brightMagenta: "#a855f7", brightCyan: "#14b8a6", brightWhite: "#f5f5f5",
  };

  const handleTerminalAnsiColorsReset = useCallback(() => {
    setTerminalAnsiColors(DEFAULT_ANSI_COLORS);
    // Persist all reset colors
    const batch: Record<string, string> = {};
    for (const [key, val] of Object.entries(DEFAULT_ANSI_COLORS)) {
      const capitalKey = key.charAt(0).toUpperCase() + key.slice(1);
      batch[`terminalColor${capitalKey}`] = val;
    }
    void persistAppState(batch as Record<string, string>).catch((e) =>
      console.error("Failed to persist terminal color reset:", e),
    );
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
      terminalBackground,
      terminalForeground,
      terminalFontFamily,
      terminalFontSize,
      terminalLineHeight,
      terminalCursorStyle,
      terminalCursorBlink,
      terminalScrollback,
      terminalCopyOnSelect,
      terminalMacOptionIsMeta,
      terminalDefaultShell,
      terminalAnsiColors,
    },
    displayHandlers: {
      handleFontScaleChange,
      handleLineHeightChange,
      handleParagraphSpacingChange,
      handleTextIndentChange,
      handleFontFamilyChange,
      handleCharsPerLineChange,
      handleAutoCharsPerLineCalc,
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
      handleTerminalBackgroundChange,
      handleTerminalForegroundChange,
      handleTerminalFontFamilyChange,
      handleTerminalFontSizeChange,
      handleTerminalLineHeightChange,
      handleTerminalCursorStyleChange,
      handleTerminalCursorBlinkChange,
      handleTerminalScrollbackChange,
      handleTerminalCopyOnSelectChange,
      handleTerminalMacOptionIsMetaChange,
      handleTerminalDefaultShellChange,
      handleTerminalAnsiColorChange,
      handleTerminalAnsiColorsReset,
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
