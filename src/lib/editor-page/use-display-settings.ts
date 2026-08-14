import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useState } from "react";

import { persistAppState } from "@/lib/storage/app-state-manager";
import { trackUsageEvent } from "@/lib/analytics/usage-events";
import { createDebouncedTelemetry } from "@/lib/analytics/debounced-telemetry";

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
  compactMode: boolean;
  allowOptionKeySpecialCharacterInput: boolean;
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
  handleToggleCompactMode: () => void;
  handleAllowOptionKeySpecialCharacterInputChange: (value: boolean) => void;
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
export function useDisplaySettings(incrementEditorKey: () => void): UseDisplaySettingsResult {
  const [settingsTelemetry] = useState(() => createDebouncedTelemetry());
  useEffect(() => () => settingsTelemetry.flush(), [settingsTelemetry]);

  const persistSetting = useCallback(
    (
      update: Record<string, unknown>,
      category: "typography" | "scroll" | "pos_highlight" | "speech" | "terminal",
      setting: "typography" | "scroll" | "pos_highlight" | "speech" | "terminal" | "autosave",
      action: "enabled" | "disabled" | "updated" | "reset",
      errorLabel: string,
      debounce = false,
    ): void => {
      void persistAppState(update)
        .then(() => {
          const props = { category, setting, action } as const;
          if (debounce) {
            settingsTelemetry.schedule(setting, "settings_change_completed", props);
          } else {
            trackUsageEvent("settings_change_completed", props);
          }
        })
        .catch((error) => console.error(errorLabel, error));
    },
    [settingsTelemetry],
  );
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
  const [compactMode, setCompactMode] = useState(false);
  const [allowOptionKeySpecialCharacterInput, setAllowOptionKeySpecialCharacterInput] =
    useState(false);

  // Terminal settings
  const [terminalBackground, setTerminalBackground] = useState("#000000");
  const [terminalForeground, setTerminalForeground] = useState("#f2f2f2");
  const [terminalFontFamily, setTerminalFontFamily] = useState(
    "'JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
  );
  const [terminalFontSize, setTerminalFontSize] = useState(12);
  const [terminalLineHeight, setTerminalLineHeight] = useState(1.4);
  const [terminalCursorStyle, setTerminalCursorStyle] = useState<"block" | "underline" | "bar">(
    "block",
  );
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
    if (typeof appState.paragraphSpacing === "number")
      setParagraphSpacing(appState.paragraphSpacing);
    if (typeof appState.textIndent === "number") setTextIndent(appState.textIndent);
    if (typeof appState.fontFamily === "string") setFontFamily(appState.fontFamily);
    if (typeof appState.charsPerLine === "number") setCharsPerLine(appState.charsPerLine);
    if (typeof appState.autoCharsPerLine === "boolean")
      setAutoCharsPerLine(appState.autoCharsPerLine);
    if (typeof appState.showParagraphNumbers === "boolean")
      setShowParagraphNumbers(appState.showParagraphNumbers);
    if (typeof appState.autoSave === "boolean") setAutoSave(appState.autoSave);
    if (typeof appState.posHighlightEnabled === "boolean")
      setPosHighlightEnabled(appState.posHighlightEnabled);
    if (appState.posHighlightColors && typeof appState.posHighlightColors === "object") {
      setPosHighlightColors(appState.posHighlightColors as Record<string, string>);
    }
    if (Array.isArray(appState.posHighlightDisabledTypes)) {
      setPosHighlightDisabledTypes(appState.posHighlightDisabledTypes as string[]);
    }
    if (typeof appState.compactMode === "boolean") setCompactMode(appState.compactMode);
    if (typeof appState.allowOptionKeySpecialCharacterInput === "boolean") {
      setAllowOptionKeySpecialCharacterInput(appState.allowOptionKeySpecialCharacterInput);
    }
    if (typeof appState.speechVoiceURI === "string") setSpeechVoiceURI(appState.speechVoiceURI);
    if (typeof appState.speechRate === "number") setSpeechRate(appState.speechRate);
    if (typeof appState.speechPitch === "number") setSpeechPitch(appState.speechPitch);
    if (typeof appState.speechVolume === "number") setSpeechVolume(appState.speechVolume);
    // Terminal settings
    if (typeof appState.terminalBackground === "string")
      setTerminalBackground(appState.terminalBackground);
    if (typeof appState.terminalForeground === "string")
      setTerminalForeground(appState.terminalForeground);
    if (typeof appState.terminalFontFamily === "string")
      setTerminalFontFamily(appState.terminalFontFamily);
    if (typeof appState.terminalFontSize === "number")
      setTerminalFontSize(appState.terminalFontSize);
    if (typeof appState.terminalLineHeight === "number")
      setTerminalLineHeight(appState.terminalLineHeight);
    if (
      appState.terminalCursorStyle === "block" ||
      appState.terminalCursorStyle === "underline" ||
      appState.terminalCursorStyle === "bar"
    ) {
      setTerminalCursorStyle(appState.terminalCursorStyle);
    }
    if (typeof appState.terminalCursorBlink === "boolean")
      setTerminalCursorBlink(appState.terminalCursorBlink);
    if (typeof appState.terminalScrollback === "number")
      setTerminalScrollback(appState.terminalScrollback);
    if (typeof appState.terminalCopyOnSelect === "boolean")
      setTerminalCopyOnSelect(appState.terminalCopyOnSelect);
    if (typeof appState.terminalMacOptionIsMeta === "boolean")
      setTerminalMacOptionIsMeta(appState.terminalMacOptionIsMeta);
    if (typeof appState.terminalDefaultShell === "string")
      setTerminalDefaultShell(appState.terminalDefaultShell);
    // Restore individual ANSI colors
    const colorKeys = [
      "Black",
      "Red",
      "Green",
      "Yellow",
      "Blue",
      "Magenta",
      "Cyan",
      "White",
      "BrightBlack",
      "BrightRed",
      "BrightGreen",
      "BrightYellow",
      "BrightBlue",
      "BrightMagenta",
      "BrightCyan",
      "BrightWhite",
    ] as const;
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

  const handleFontScaleChange = useCallback(
    (value: number) => {
      setFontScale(value);
      incrementEditorKey();
      persistSetting(
        { fontScale: value },
        "typography",
        "typography",
        "updated",
        "Failed to persist fontScale:",
        true,
      );
    },
    [incrementEditorKey, persistSetting],
  );

  const handleLineHeightChange = useCallback(
    (value: number) => {
      setLineHeight(value);
      incrementEditorKey();
      persistSetting(
        { lineHeight: value },
        "typography",
        "typography",
        "updated",
        "Failed to persist lineHeight:",
        true,
      );
    },
    [incrementEditorKey, persistSetting],
  );

  const handleParagraphSpacingChange = useCallback(
    (value: number) => {
      setParagraphSpacing(value);
      incrementEditorKey();
      persistSetting(
        { paragraphSpacing: value },
        "typography",
        "typography",
        "updated",
        "Failed to persist paragraphSpacing:",
        true,
      );
    },
    [incrementEditorKey, persistSetting],
  );

  const handleTextIndentChange = useCallback(
    (value: number) => {
      setTextIndent(value);
      incrementEditorKey();
      persistSetting(
        { textIndent: value },
        "typography",
        "typography",
        "updated",
        "Failed to persist textIndent:",
        true,
      );
    },
    [incrementEditorKey, persistSetting],
  );

  const handleFontFamilyChange = useCallback(
    (value: string) => {
      setFontFamily(value);
      incrementEditorKey();
      persistSetting(
        { fontFamily: value },
        "typography",
        "typography",
        "updated",
        "Failed to persist fontFamily:",
      );
    },
    [incrementEditorKey, persistSetting],
  );

  const handleCharsPerLineChange = useCallback(
    (value: number) => {
      const clamped = Math.max(1, value);
      setCharsPerLine(clamped);
      incrementEditorKey();
      persistSetting(
        { charsPerLine: clamped },
        "typography",
        "typography",
        "updated",
        "Failed to persist charsPerLine:",
        true,
      );
    },
    [incrementEditorKey, persistSetting],
  );

  // Lightweight setter for auto-calculation: updates value + persists but does NOT
  // remount the editor. MilkdownEditor's useEffect applies CSS constraints reactively,
  // so a full remount is unnecessary and would cause a visible "twitch" on tab switch.
  const handleAutoCharsPerLineCalc = useCallback((value: number) => {
    const clamped = Math.max(1, value);
    setCharsPerLine(clamped);
    void persistAppState({ charsPerLine: clamped }).catch((e) =>
      console.error("Failed to persist charsPerLine:", e),
    );
  }, []);

  const handleAutoCharsPerLineChange = useCallback(
    (value?: boolean) => {
      setAutoCharsPerLine((prev) => {
        const next = value !== undefined ? value : !prev;
        persistSetting(
          { autoCharsPerLine: next },
          "typography",
          "typography",
          next ? "enabled" : "disabled",
          "Failed to persist autoCharsPerLine:",
        );
        return next;
      });
    },
    [persistSetting],
  );

  const handleShowParagraphNumbersChange = useCallback(
    (value: boolean) => {
      setShowParagraphNumbers(value);
      persistSetting(
        { showParagraphNumbers: value },
        "typography",
        "typography",
        value ? "enabled" : "disabled",
        "Failed to persist showParagraphNumbers:",
      );
    },
    [persistSetting],
  );

  const handleAutoSaveChange = useCallback(
    (value: boolean) => {
      setAutoSave(value);
      persistSetting(
        { autoSave: value },
        "typography",
        "autosave",
        value ? "enabled" : "disabled",
        "Failed to persist autoSave:",
      );
    },
    [persistSetting],
  );

  const handlePosHighlightEnabledChange = useCallback(
    (value: boolean) => {
      setPosHighlightEnabled(value);
      persistSetting(
        { posHighlightEnabled: value },
        "pos_highlight",
        "pos_highlight",
        value ? "enabled" : "disabled",
        "Failed to persist posHighlightEnabled:",
      );
    },
    [persistSetting],
  );

  const handlePosHighlightColorsChange = useCallback(
    (value: Record<string, string>) => {
      setPosHighlightColors(value);
      persistSetting(
        { posHighlightColors: value },
        "pos_highlight",
        "pos_highlight",
        "updated",
        "Failed to persist posHighlightColors:",
        true,
      );
    },
    [persistSetting],
  );

  const handlePosHighlightDisabledTypesChange = useCallback(
    (value: string[]) => {
      setPosHighlightDisabledTypes(value);
      persistSetting(
        { posHighlightDisabledTypes: value },
        "pos_highlight",
        "pos_highlight",
        "updated",
        "Failed to persist posHighlightDisabledTypes:",
      );
    },
    [persistSetting],
  );

  const handleToggleCompactMode = useCallback(() => {
    setCompactMode((prev) => {
      const next = !prev;
      void persistAppState({ compactMode: next }).catch((e) =>
        console.error("Failed to persist compactMode:", e),
      );
      trackUsageEvent("editor_layout_changed", {
        action: "compact_mode",
        value: next ? "enabled" : "disabled",
      });
      return next;
    });
  }, []);

  const handleAllowOptionKeySpecialCharacterInputChange = useCallback((value: boolean) => {
    setAllowOptionKeySpecialCharacterInput(value);
    void persistAppState({ allowOptionKeySpecialCharacterInput: value }).catch((e) =>
      console.error("Failed to persist allowOptionKeySpecialCharacterInput:", e),
    );
  }, []);

  const handleSpeechVoiceURIChange = useCallback(
    (value: string) => {
      setSpeechVoiceURI(value);
      persistSetting(
        { speechVoiceURI: value },
        "speech",
        "speech",
        "updated",
        "Failed to persist speechVoiceURI:",
      );
    },
    [persistSetting],
  );

  const handleSpeechRateChange = useCallback(
    (value: number) => {
      setSpeechRate(value);
      persistSetting(
        { speechRate: value },
        "speech",
        "speech",
        "updated",
        "Failed to persist speechRate:",
        true,
      );
    },
    [persistSetting],
  );

  const handleSpeechPitchChange = useCallback(
    (value: number) => {
      setSpeechPitch(value);
      persistSetting(
        { speechPitch: value },
        "speech",
        "speech",
        "updated",
        "Failed to persist speechPitch:",
        true,
      );
    },
    [persistSetting],
  );

  const handleSpeechVolumeChange = useCallback(
    (value: number) => {
      setSpeechVolume(value);
      persistSetting(
        { speechVolume: value },
        "speech",
        "speech",
        "updated",
        "Failed to persist speechVolume:",
        true,
      );
    },
    [persistSetting],
  );

  // --- Terminal handlers ---

  const handleTerminalBackgroundChange = useCallback(
    (value: string) => {
      setTerminalBackground(value);
      persistSetting(
        { terminalBackground: value },
        "terminal",
        "terminal",
        "updated",
        "Failed to persist terminalBackground:",
        true,
      );
    },
    [persistSetting],
  );

  const handleTerminalForegroundChange = useCallback(
    (value: string) => {
      setTerminalForeground(value);
      persistSetting(
        { terminalForeground: value },
        "terminal",
        "terminal",
        "updated",
        "Failed to persist terminalForeground:",
        true,
      );
    },
    [persistSetting],
  );

  const handleTerminalFontFamilyChange = useCallback(
    (value: string) => {
      setTerminalFontFamily(value);
      persistSetting(
        { terminalFontFamily: value },
        "terminal",
        "terminal",
        "updated",
        "Failed to persist terminalFontFamily:",
      );
    },
    [persistSetting],
  );

  const handleTerminalFontSizeChange = useCallback(
    (value: number) => {
      setTerminalFontSize(value);
      persistSetting(
        { terminalFontSize: value },
        "terminal",
        "terminal",
        "updated",
        "Failed to persist terminalFontSize:",
        true,
      );
    },
    [persistSetting],
  );

  const handleTerminalLineHeightChange = useCallback(
    (value: number) => {
      setTerminalLineHeight(value);
      persistSetting(
        { terminalLineHeight: value },
        "terminal",
        "terminal",
        "updated",
        "Failed to persist terminalLineHeight:",
        true,
      );
    },
    [persistSetting],
  );

  const handleTerminalCursorStyleChange = useCallback(
    (value: "block" | "underline" | "bar") => {
      setTerminalCursorStyle(value);
      persistSetting(
        { terminalCursorStyle: value },
        "terminal",
        "terminal",
        "updated",
        "Failed to persist terminalCursorStyle:",
      );
    },
    [persistSetting],
  );

  const handleTerminalCursorBlinkChange = useCallback(
    (value: boolean) => {
      setTerminalCursorBlink(value);
      persistSetting(
        { terminalCursorBlink: value },
        "terminal",
        "terminal",
        value ? "enabled" : "disabled",
        "Failed to persist terminalCursorBlink:",
      );
    },
    [persistSetting],
  );

  const handleTerminalScrollbackChange = useCallback(
    (value: number) => {
      setTerminalScrollback(value);
      persistSetting(
        { terminalScrollback: value },
        "terminal",
        "terminal",
        "updated",
        "Failed to persist terminalScrollback:",
        true,
      );
    },
    [persistSetting],
  );

  const handleTerminalCopyOnSelectChange = useCallback(
    (value: boolean) => {
      setTerminalCopyOnSelect(value);
      persistSetting(
        { terminalCopyOnSelect: value },
        "terminal",
        "terminal",
        value ? "enabled" : "disabled",
        "Failed to persist terminalCopyOnSelect:",
      );
    },
    [persistSetting],
  );

  const handleTerminalMacOptionIsMetaChange = useCallback(
    (value: boolean) => {
      setTerminalMacOptionIsMeta(value);
      persistSetting(
        { terminalMacOptionIsMeta: value },
        "terminal",
        "terminal",
        value ? "enabled" : "disabled",
        "Failed to persist terminalMacOptionIsMeta:",
      );
    },
    [persistSetting],
  );

  const handleTerminalDefaultShellChange = useCallback(
    (value: string) => {
      setTerminalDefaultShell(value);
      persistSetting(
        { terminalDefaultShell: value },
        "terminal",
        "terminal",
        "updated",
        "Failed to persist terminalDefaultShell:",
      );
    },
    [persistSetting],
  );

  const handleTerminalAnsiColorChange = useCallback(
    (key: string, value: string) => {
      setTerminalAnsiColors((prev) => {
        const next = { ...prev, [key]: value };
        // Persist as individual fields: terminalColorBlack, terminalColorRed, etc.
        const capitalKey = key.charAt(0).toUpperCase() + key.slice(1);
        persistSetting(
          { ["terminalColor" + capitalKey]: value },
          "terminal",
          "terminal",
          "updated",
          "Failed to persist terminal color:",
          true,
        );
        return next;
      });
    },
    [persistSetting],
  );

  const DEFAULT_ANSI_COLORS: Record<string, string> = {
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
  };

  const handleTerminalAnsiColorsReset = useCallback(() => {
    setTerminalAnsiColors(DEFAULT_ANSI_COLORS);
    // Persist all reset colors
    const batch: Record<string, string> = {};
    for (const [key, val] of Object.entries(DEFAULT_ANSI_COLORS)) {
      const capitalKey = key.charAt(0).toUpperCase() + key.slice(1);
      batch[`terminalColor${capitalKey}`] = val;
    }
    persistSetting(
      batch,
      "terminal",
      "terminal",
      "reset",
      "Failed to persist terminal color reset:",
    );
  }, [persistSetting]);

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
      compactMode,
      allowOptionKeySpecialCharacterInput,
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
      handleToggleCompactMode,
      handleAllowOptionKeySpecialCharacterInputChange,
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
