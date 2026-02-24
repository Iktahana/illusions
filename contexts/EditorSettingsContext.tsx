"use client";

import React, { createContext, useContext, useMemo } from "react";

import type { EditorSettings, EditorSettingsHandlers } from "@/lib/editor-page/use-editor-settings";

/**
 * Context value that exposes editor settings and their change handlers.
 * Eliminates prop drilling of 50+ individual settings/handler pairs
 * through page.tsx -> SettingsModal / Explorer / Editor / Inspector.
 */
export interface EditorSettingsContextValue {
  settings: EditorSettings;
  handlers: EditorSettingsHandlers;
}

const EditorSettingsContext = createContext<EditorSettingsContextValue | null>(null);

interface EditorSettingsProviderProps {
  children: React.ReactNode;
  settings: EditorSettings;
  handlers: EditorSettingsHandlers;
}

/**
 * Provider that wraps the editor tree and exposes all editor settings
 * via React context, eliminating deep prop drilling.
 */
export function EditorSettingsProvider({
  children,
  settings,
  handlers,
}: EditorSettingsProviderProps): React.JSX.Element {
  return (
    <EditorSettingsContext.Provider value={{ settings, handlers }}>
      {children}
    </EditorSettingsContext.Provider>
  );
}

/**
 * Hook to consume editor settings from context.
 * Must be called within an EditorSettingsProvider.
 */
export function useEditorSettingsContext(): EditorSettingsContextValue {
  const ctx = useContext(EditorSettingsContext);
  if (!ctx) {
    throw new Error(
      "useEditorSettingsContext must be used within an EditorSettingsProvider",
    );
  }
  return ctx;
}

// ============================================================================
// Group-specific selector hooks
// ============================================================================

/** Typography and display settings */
export function useTypographySettings() {
  const { settings, handlers } = useEditorSettingsContext();
  return useMemo(() => ({
    fontScale: settings.fontScale,
    lineHeight: settings.lineHeight,
    paragraphSpacing: settings.paragraphSpacing,
    textIndent: settings.textIndent,
    fontFamily: settings.fontFamily,
    charsPerLine: settings.charsPerLine,
    autoCharsPerLine: settings.autoCharsPerLine,
    showParagraphNumbers: settings.showParagraphNumbers,
    onFontScaleChange: handlers.handleFontScaleChange,
    onLineHeightChange: handlers.handleLineHeightChange,
    onParagraphSpacingChange: handlers.handleParagraphSpacingChange,
    onTextIndentChange: handlers.handleTextIndentChange,
    onFontFamilyChange: handlers.handleFontFamilyChange,
    onCharsPerLineChange: handlers.handleCharsPerLineChange,
    onAutoCharsPerLineChange: handlers.handleAutoCharsPerLineChange,
    onShowParagraphNumbersChange: handlers.handleShowParagraphNumbersChange,
  }), [settings, handlers]);
}

/** Linting configuration */
export function useLintingSettings() {
  const { settings, handlers } = useEditorSettingsContext();
  return useMemo(() => ({
    lintingEnabled: settings.lintingEnabled,
    lintingRuleConfigs: settings.lintingRuleConfigs,
    correctionConfig: settings.correctionConfig,
    onLintingEnabledChange: handlers.handleLintingEnabledChange,
    onLintingRuleConfigChange: handlers.handleLintingRuleConfigChange,
    onLintingRuleConfigsBatchChange: handlers.handleLintingRuleConfigsBatchChange,
    onCorrectionConfigChange: handlers.handleCorrectionConfigChange,
  }), [settings, handlers]);
}

/** LLM configuration */
export function useLlmSettings() {
  const { settings, handlers } = useEditorSettingsContext();
  return useMemo(() => ({
    llmEnabled: settings.llmEnabled,
    llmModelId: settings.llmModelId,
    llmIdlingStop: settings.llmIdlingStop,
    onLlmEnabledChange: handlers.handleLlmEnabledChange,
    onLlmModelIdChange: handlers.handleLlmModelIdChange,
    onLlmIdlingStopChange: handlers.handleLlmIdlingStopChange,
  }), [settings, handlers]);
}

/** POS highlight configuration */
export function usePosHighlightSettings() {
  const { settings, handlers } = useEditorSettingsContext();
  return useMemo(() => ({
    posHighlightEnabled: settings.posHighlightEnabled,
    posHighlightColors: settings.posHighlightColors,
    onPosHighlightEnabledChange: handlers.handlePosHighlightEnabledChange,
    onPosHighlightColorsChange: handlers.handlePosHighlightColorsChange,
  }), [settings, handlers]);
}

/** Scroll behavior configuration */
export function useScrollSettings() {
  const { settings, handlers } = useEditorSettingsContext();
  return useMemo(() => ({
    verticalScrollBehavior: settings.verticalScrollBehavior,
    scrollSensitivity: settings.scrollSensitivity,
    onVerticalScrollBehaviorChange: handlers.handleVerticalScrollBehaviorChange,
    onScrollSensitivityChange: handlers.handleScrollSensitivityChange,
  }), [settings, handlers]);
}

/** Power saving configuration */
export function usePowerSettings() {
  const { settings, handlers } = useEditorSettingsContext();
  return useMemo(() => ({
    powerSaveMode: settings.powerSaveMode,
    autoPowerSaveOnBattery: settings.autoPowerSaveOnBattery,
    onPowerSaveModeChange: handlers.handlePowerSaveModeChange,
    onAutoPowerSaveOnBatteryChange: handlers.handleAutoPowerSaveOnBatteryChange,
  }), [settings, handlers]);
}

/** UI settings (compact mode, auto-save, settings modal) */
export function useUISettings() {
  const { settings, handlers } = useEditorSettingsContext();
  return useMemo(() => ({
    compactMode: settings.compactMode,
    autoSave: settings.autoSave,
    showSettingsModal: settings.showSettingsModal,
    onToggleCompactMode: handlers.handleToggleCompactMode,
    onAutoSaveChange: handlers.handleAutoSaveChange,
    setShowSettingsModal: handlers.setShowSettingsModal,
  }), [settings, handlers]);
}
