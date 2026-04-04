"use client";
/* eslint-disable react-hooks/rules-of-hooks, @typescript-eslint/no-unused-vars */

import { useCallback, useEffect, useRef, useState } from "react";

import { useTheme } from "@/contexts/ThemeContext";
import EditorLayout from "@/components/EditorLayout";
import WelcomeScreen from "@/components/WelcomeScreen";
import PopoutEditorWindow from "@/components/PopoutEditorWindow";
import CreateProjectWizard from "@/components/CreateProjectWizard";
import PermissionPrompt from "@/components/PermissionPrompt";
import { useRubyTcy } from "@/lib/editor-page/use-ruby-tcy";
import { useLintHandlers } from "@/lib/editor-page/use-lint-handlers";
import { useTabManager } from "@/lib/tab-manager";
import { useUnsavedWarning } from "@/lib/hooks/use-unsaved-warning";
import { useDockviewAdapter } from "@/lib/dockview/use-dockview-adapter";
import { useDockviewPersistence } from "@/lib/dockview/use-dockview-persistence";
import "@/lib/dockview/dockview-theme.css";
import { useElectronMenuHandlers } from "@/lib/menu/use-electron-menu-handlers";
import { useExport } from "@/lib/export/use-export";
import type { ExportMetadata } from "@/lib/export/types";
import type { PdfExportSettings } from "@/lib/export/pdf-export-settings";
import { notificationManager } from "@/lib/services/notification-manager";
import { useWebMenuHandlers } from "@/lib/menu/use-web-menu-handlers";
import { useGlobalShortcuts } from "@/lib/hooks/use-global-shortcuts";
import { isElectronRenderer } from "@/lib/utils/runtime-env";
import WebMenuBar from "@/components/WebMenuBar";
import { useEditorMode } from "@/contexts/EditorModeContext";
import { getAvailableFeatures } from "@/lib/utils/feature-detection";
import { isProjectMode } from "@/lib/project/project-types";
import { isEditorTab } from "@/lib/tab-manager/tab-types";
import { sanitizeMdiContent } from "@/lib/tab-manager/types";
import { useTextStatistics } from "@/lib/editor-page/use-text-statistics";
import { useEditorSettings } from "@/lib/editor-page/use-editor-settings";
import { useEditorLifecycle } from "@/lib/editor-page/use-editor-lifecycle";
import { useElectronEvents } from "@/lib/editor-page/use-electron-events";
import { useProjectLifecycle } from "@/lib/editor-page/use-project-lifecycle";
import { useLinting } from "@/lib/editor-page/use-linting";
import { CORRECTION_MODES, MODE_TO_PRESET } from "@/lib/linting/correction-modes";
import { LINT_PRESETS } from "@/lib/linting/lint-presets";
import type { CorrectionModeId } from "@/lib/linting/correction-config";
import { usePowerSaving } from "@/lib/editor-page/use-power-saving";
import { useIgnoredCorrections } from "@/lib/editor-page/use-ignored-corrections";
import { useKeyboardShortcuts } from "@/lib/editor-page/use-keyboard-shortcuts";
import { usePanelState } from "@/lib/editor-page/use-panel-state";
import { useSaveToast } from "@/lib/editor-page/use-save-toast";
import { useTerminalTabs } from "@/lib/editor-page/use-terminal-tabs";
import { useDiffTabs } from "@/lib/editor-page/use-diff-tabs";
import { useContextMenu } from "@/lib/hooks/use-context-menu";
import { usePreviousDayStats } from "@/lib/editor-page/use-previous-day-stats";

import type { EditorView } from "@milkdown/prose/view";
import type { SupportedFileExtension } from "@/lib/project/project-types";

// Module-level flag: persists across React StrictMode/HMR remounts,
// but resets on page refresh (module re-evaluated).
// Each Electron BrowserWindow has its own JS context, so no cross-window contamination.
let _skipAutoRestoreDetected: boolean | null = null;

// Module-level popout detection (checked once per window context)
let _popoutBufferInfo: {
  bufferId: string;
  fileName: string;
  fileType: SupportedFileExtension;
} | null = null;
let _popoutDetected = false;

function detectPopoutMode(): typeof _popoutBufferInfo {
  if (_popoutDetected) return _popoutBufferInfo;
  _popoutDetected = true;
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const bufferId = params.get("popout-buffer");
  if (!bufferId) return null;
  _popoutBufferInfo = {
    bufferId,
    fileName: params.get("fileName") ?? "新規ファイル",
    fileType: (params.get("fileType") ?? ".mdi") as SupportedFileExtension,
  };
  return _popoutBufferInfo;
}

export default function EditorPage() {
  // Early check: if this is a popout window, render simplified editor
  const popoutInfo = detectPopoutMode();
  if (popoutInfo) {
    return <PopoutEditorWindow {...popoutInfo} />;
  }
  const { editorMode, setProjectMode, setStandaloneMode, resetMode } = useEditorMode();
  const { themeMode, setThemeMode } = useTheme();

  // Detect ?welcome parameter: skip auto-restore and show welcome page
  const [skipAutoRestore] = useState(() => {
    if (typeof window === "undefined") return false;
    if (_skipAutoRestoreDetected !== null) return _skipAutoRestoreDetected;

    const params = new URLSearchParams(window.location.search);
    _skipAutoRestoreDetected = params.has("welcome") || params.has("pending-file");
    return _skipAutoRestoreDetected;
  });

  const [editorKey, setEditorKey] = useState(0);
  const incrementEditorKey = useCallback(() => {
    setEditorKey((prev) => prev + 1);
  }, []);

  // Ref for dockview layout flush — populated after useDockviewPersistence,
  // consumed by useTabManager's close handler via stable callback.
  const flushLayoutStateRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const stableFlushLayoutState = useCallback(async () => {
    await flushLayoutStateRef.current?.();
  }, []);

  // Deferred promise gate: tab restoration waits until VFS root is set
  const [vfsGate] = useState(() => {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  });

  // --- Editor settings hook ---
  const {
    settings,
    handlers: settingsHandlers,
    setters: settingsSetters,
  } = useEditorSettings(incrementEditorKey);
  const {
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
    compactMode,
    showSettingsModal,
    lintingEnabled,
    lintingRuleConfigs,
    powerSaveMode,
    autoPowerSaveOnBattery,
    correctionConfig,
  } = settings;
  const {
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
    handleToggleCompactMode,
    setShowSettingsModal,
    handleLintingEnabledChange,
    handleLintingRuleConfigChange,
    handleLintingRuleConfigsBatchChange,
    handlePowerSaveModeChange,
    handleAutoPowerSaveOnBatteryChange,
    handleCorrectionConfigChange,
  } = settingsHandlers;

  const isElectron = typeof window !== "undefined" && isElectronRenderer();

  // Derive a stable per-window key from the project root path (Electron project mode).
  // This key scopes tabs and dockview layout so multiple windows with different projects
  // do not overwrite each other's state (fixes #1042).
  // Standalone mode and Web mode use null — they rely on the legacy global AppState path.
  const windowKey = isProjectMode(editorMode) && editorMode.rootPath ? editorMode.rootPath : null;

  // --- Power saving hook ---
  usePowerSaving({
    powerSaveMode,
    autoPowerSaveOnBattery,
    onPowerSaveModeChange: handlePowerSaveModeChange,
  });

  // --- Panel state hook ---
  const { state: panelState, handlers: panelHandlers } = usePanelState({ setShowSettingsModal });
  const {
    topView,
    bottomView,
    searchResults,
    isRightPanelCollapsed,
    dictionarySearchTrigger,
    settingsInitialCategory,
    switchToCorrectionsTrigger,
    showRubyDialog,
    rubySelectedText,
    editorDiff,
  } = panelState;
  const {
    setTopView,
    setBottomView,
    setIsRightPanelCollapsed,
    setSettingsInitialCategory,
    setShowRubyDialog,
    setRubySelectedText,
    setEditorDiff,
    handleOpenDictionary,
    handleShowAllSearchResults,
    handleCloseSearchResults,
    handleOpenLintingSettings,
    handleOpenPosHighlightSettings,
    triggerSwitchToCorrections,
  } = panelHandlers;

  const tabManager = useTabManager({
    skipAutoRestore,
    autoSave,
    vfsReadyPromise: vfsGate.promise,
    flushLayoutState: stableFlushLayoutState,
    windowKey,
  });
  const {
    content,
    setContent,
    currentFile,
    isDirty,
    isSaving,
    lastSavedTime,
    lastSaveWasAuto,
    openFile: tabOpenFile,
    saveFile,
    saveAsFile,
    newFile: tabNewFile,
    updateFileName,
    wasAutoRecovered,
    onSystemFileOpen,
    _loadSystemFile: tabLoadSystemFile,
    tabs,
    activeTabId,
    newTab,
    closeTab,
    switchTab,
    nextTab,
    prevTab,
    switchToIndex,
    openProjectFile,
    pinTab,
    newTerminalTab,
    updateTerminalTab,
    openDiffTab,
    forceCloseTab,
    updateTab,
    pendingCloseTabId,
    pendingCloseFileName,
    handleCloseTabSave,
    handleCloseTabDiscard,
    handleCloseTabCancel,
    flushTabState,
  } = tabManager;

  // Keep a live tabs ref for dockview panel renderers captured by stale closures.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const { diffTabContextValue, handleCloseTabWithPtyCleanup } = useDiffTabs({
    tabs,
    updateTab,
    forceCloseTab,
    closeTab,
  });

  const {
    handleNewTerminalTab,
    terminalTabContextValue,
    showDesktopOnlyDialog,
    setShowDesktopOnlyDialog,
  } = useTerminalTabs({
    tabs,
    newTerminalTab,
    updateTerminalTab,
    forceCloseTab,
    editorMode,
    settings,
    isElectron,
  });

  // Patched tabManager passed to the dockview adapter so that panel close
  // triggers PTY kill before removing the tab from state.
  const tabManagerWithPtyCleanup = { ...tabManager, closeTab: handleCloseTabWithPtyCleanup };

  // Search state — declared before useDockviewAdapter so it can be passed as options
  const [searchOpenTrigger, setSearchOpenTrigger] = useState(0);
  const [searchInitialTerm, setSearchInitialTerm] = useState<string | undefined>(undefined);

  // --- Dockview adapter (bridges useTabManager ↔ dockview layout) ---
  const { handleDockviewReady, dockviewApi, splitEditor } = useDockviewAdapter({
    tabManager: tabManagerWithPtyCleanup,
    editorKey,
    searchOpenTrigger,
    searchInitialTerm,
    windowKey,
  });
  const { flushLayoutState } = useDockviewPersistence({
    dockviewApi,
    tabs: tabManagerWithPtyCleanup.tabs,
    windowKey,
  });
  flushLayoutStateRef.current = flushLayoutState;

  // Derive editor mode from active tab's fileType
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeEditorTab = activeTab && isEditorTab(activeTab) ? activeTab : undefined;
  const activeFileType = activeEditorTab?.fileType ?? ".mdi";
  const mdiExtensionsEnabled = activeFileType === ".mdi";
  const gfmEnabled = activeFileType !== ".txt";

  // Stable ref so export / shortcut callbacks can read the current value without re-creating
  const isEditorTabActiveRef = useRef<boolean>(!!activeEditorTab);
  isEditorTabActiveRef.current = !!activeEditorTab;

  // Auto-collapse right panel when all tabs are closed, restore when a tab opens
  const rightPanelUserPrefRef = useRef(isRightPanelCollapsed);
  const hasTabs = tabs.length > 0;
  useEffect(() => {
    if (!hasTabs) {
      // Save user preference before auto-collapsing
      rightPanelUserPrefRef.current = isRightPanelCollapsed;
      setIsRightPanelCollapsed(true);
    } else {
      // Restore to user's last explicit preference
      setIsRightPanelCollapsed(rightPanelUserPrefRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTabs]);

  // Track user's explicit toggle (not auto-collapse)
  const handleToggleRightPanel = useCallback(() => {
    const next = !isRightPanelCollapsed;
    setIsRightPanelCollapsed(next);
    if (hasTabs) {
      rightPanelUserPrefRef.current = next;
    }
  }, [isRightPanelCollapsed, setIsRightPanelCollapsed, hasTabs]);

  const contentRef = useRef<string>(content);
  const editorDomRef = useRef<HTMLDivElement>(null);
  const [dismissedRecovery, setDismissedRecovery] = useState(false);
  const [recoveryExiting, setRecoveryExiting] = useState(false);
  const [newFileTrigger, setNewFileTrigger] = useState(0);
  const [selectedCharCount, setSelectedCharCount] = useState(0);
  const { menu: tabBarMenu, show: showTabBarMenu, close: closeTabBarMenu } = useContextMenu();
  const hasAutoRecoveredRef = useRef(false);
  const [editorViewInstance, setEditorViewInstance] = useState<EditorView | null>(null);

  // --- Ruby/TCY hook ---
  const { handleOpenRubyDialog, handleApplyRuby, handleToggleTcy } = useRubyTcy({
    editorViewInstance,
    setRubySelectedText: panelHandlers.setRubySelectedText,
    setShowRubyDialog: panelHandlers.setShowRubyDialog,
  });

  // --- Project lifecycle hook ---
  const projectLifecycle = useProjectLifecycle({
    editorMode,
    setProjectMode,
    setStandaloneMode,
    isElectron,
    tabLoadSystemFile,
    incrementEditorKey,
    content,
    skipAutoRestore,
    lastSavedTime,
    onVfsReady: vfsGate.resolve,
  });
  const {
    state: {
      recentProjects,
      showCreateWizard,
      showPermissionPrompt,
      permissionPromptData,
      isRestoring,
      restoreError,
      confirmRemoveRecent,
    },
    handlers: {
      handleCreateProject,
      handleOpenProject,
      handleOpenStandaloneFile,
      handleOpenRecentProject,
      handleDeleteRecentProject,
      handleOpenAsProject,
      handleProjectCreated,
      handlePermissionGranted,
      handlePermissionDenied,
      handleUpgrade,
      handleUpgradeDismiss,
      setShowCreateWizard,
      setRestoreError,
      setConfirmRemoveRecent,
    },
    upgrade: { showUpgradeBanner, upgradeBannerDismissed },
  } = projectLifecycle;

  // Unsaved warning hook (project mode transitions only; tabs handle per-tab dirty checks)
  const anyDirty = tabs.some((t) => isEditorTab(t) && t.isDirty);
  const unsavedWarning = useUnsavedWarning(anyDirty, saveFile, currentFile?.name || null);

  // Auto-recovered editor remount
  useEffect(() => {
    if (wasAutoRecovered && !hasAutoRecoveredRef.current) {
      hasAutoRecoveredRef.current = true;
      incrementEditorKey();
    }
  }, [wasAutoRecovered, incrementEditorKey]);

  // With tabs, open/new don't need unsaved warnings (they create new tabs)
  const openFile = useCallback(async () => {
    await tabOpenFile();
    incrementEditorKey();
  }, [tabOpenFile, incrementEditorKey]);

  const newFile = useCallback(
    (fileType?: SupportedFileExtension) => {
      tabNewFile(fileType);
      incrementEditorKey();
    },
    [tabNewFile, incrementEditorKey],
  );

  // --- Tab bar empty area context menu ---
  const handleTabBarContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      // Only show on the void (empty) area of the tab bar
      if (!target.closest(".dv-void-container") && !target.classList.contains("dv-void-container"))
        return;

      const items = [
        { label: "新規ファイル", action: "new-file" },
        { label: "ファイルを開く…", action: "open-file" },
        ...(isElectron ? [{ label: "新規ターミナル", action: "new-terminal" }] : []),
      ];
      void showTabBarMenu(e, items);
    },
    [showTabBarMenu, isElectron],
  );

  const handleTabBarMenuAction = useCallback(
    (action: string) => {
      switch (action) {
        case "new-file":
          if (isProjectMode(editorMode)) {
            setTopView("files");
            setNewFileTrigger((prev) => prev + 1);
          } else {
            newTab();
          }
          break;
        case "open-file":
          void openFile();
          break;
        case "new-terminal":
          handleNewTerminalTab();
          break;
      }
    },
    [editorMode, newTab, openFile, handleNewTerminalTab, setTopView, setNewFileTrigger],
  );

  // Electron menu "New" and "Open" bindings (with safety checks)
  useElectronMenuHandlers(newFile, openFile);

  // Export hook: handles PDF/EPUB/DOCX export with notifications
  const getExportContent = useCallback(() => content, [content]);
  const getExportTitle = useCallback(() => {
    const tab = tabs.find((t) => t.id === activeTabId);
    const name = (tab && isEditorTab(tab) ? tab.file?.name : undefined) ?? "untitled";
    return name.replace(/\.[^.]+$/, "");
  }, [tabs, activeTabId]);

  // PDF export dialog state
  const [showPdfExportDialog, setShowPdfExportDialog] = useState(false);
  const [pdfExportContent, setPdfExportContent] = useState("");
  const [pdfExportMetadata, setPdfExportMetadata] = useState<ExportMetadata>({ title: "" });
  const pdfExportContentRef = useRef("");
  const pdfExportMetadataRef = useRef<ExportMetadata>({ title: "" });

  const handlePdfExportRequest = useCallback((pdfContent: string, metadata: ExportMetadata) => {
    pdfExportContentRef.current = pdfContent;
    pdfExportMetadataRef.current = metadata;
    setPdfExportContent(pdfContent);
    setPdfExportMetadata(metadata);
    setShowPdfExportDialog(true);
  }, []);

  const handlePdfExportConfirm = useCallback(async (settings: PdfExportSettings) => {
    setShowPdfExportDialog(false);

    if (!window.electronAPI?.exportPDF) {
      notificationManager.error("PDFエクスポートはデスクトップアプリでのみ利用可能です");
      return;
    }

    const progressId = notificationManager.showProgress("PDFをエクスポート中...", {
      type: "info",
    });

    try {
      const result = await window.electronAPI.exportPDF(pdfExportContentRef.current, {
        metadata: pdfExportMetadataRef.current,
        verticalWriting: settings.verticalWriting,
        pageSize: settings.pageSize,
        landscape: settings.landscape,
        margins: settings.margins,
        charsPerLine: settings.charsPerLine,
        linesPerPage: settings.linesPerPage,
        fontFamily: settings.fontFamily,
        showPageNumbers: settings.showPageNumbers,
        textIndent: settings.textIndent,
      });

      notificationManager.dismiss(progressId);

      if (result === null || result === undefined) return;

      if (typeof result === "object" && "success" in result && !result.success) {
        notificationManager.error(
          `PDFのエクスポートに失敗しました: ${(result as { error: string }).error}`,
        );
        return;
      }

      notificationManager.success("PDFをエクスポートしました");
    } catch (error) {
      notificationManager.dismiss(progressId);
      const message = error instanceof Error ? error.message : "Unknown error";
      notificationManager.error(`PDFのエクスポートに失敗しました: ${message}`);
    }
  }, []);

  const { exportAs } = useExport({
    getContent: getExportContent,
    getTitle: getExportTitle,
    getIsEditorTabActive: useCallback(() => isEditorTabActiveRef.current, []),
    onPdfExportRequest: handlePdfExportRequest,
  });

  // System file open: tab manager handles loading; we just update editor key
  useEffect(() => {
    if (!onSystemFileOpen) return;
    onSystemFileOpen(() => {
      incrementEditorKey();
    });
  }, [onSystemFileOpen, incrementEditorKey]);

  // Ref-forwarding for useWebMenuHandlers
  const openRecentProjectRef = useRef<(projectId: string) => void>(() => {});
  const fontScaleChangeRef = useRef<(scale: number) => void>(() => {});
  const toggleCompactModeRef = useRef<() => void>(() => {});

  // Web menu handlers
  const { handleMenuAction } = useWebMenuHandlers({
    onNew: newFile,
    onOpen: openFile,
    onSave: saveFile,
    onSaveAs: saveAsFile,
    onOpenProject: () => void handleOpenProject(),
    onOpenRecentProject: (projectId: string) => openRecentProjectRef.current(projectId),
    onCloseWindow: () => window.close(),
    onToggleCompactMode: () => toggleCompactModeRef.current(),
    onExport: (format) => void exportAs(format),
    editorView: editorViewInstance,
    fontScale,
    onFontScaleChange: (scale: number) => fontScaleChangeRef.current(scale),
    isEditorTabActive: !!activeEditorTab,
  });

  // Global shortcuts for Web (only when not in Electron)
  useGlobalShortcuts();

  // --- Save toast hook ---
  const { showSaveToast, saveToastExiting } = useSaveToast({ lastSavedTime, lastSaveWasAuto });

  const { handlePasteAsPlaintext, handleInsertText, handleChapterClick } = useEditorLifecycle({
    flushTabState,
    flushLayoutState: stableFlushLayoutState,
    skipAutoRestore,
    isElectron,
    handleOpenAsProject,
    tabLoadSystemFile,
    incrementEditorKey,
    wasAutoRecovered,
    dismissedRecovery,
    recoveryExiting,
    setDismissedRecovery,
    setRecoveryExiting,
    editorViewInstance,
    contentRef,
    setContent,
  });

  // --- Electron IPC events hook ---
  useElectronEvents({
    isElectron,
    handlePasteAsPlaintext,
    handleToggleCompactMode,
    setLineHeight: settingsSetters.setLineHeight,
    setParagraphSpacing: settingsSetters.setParagraphSpacing,
    setTextIndent: settingsSetters.setTextIndent,
    setCharsPerLine: settingsSetters.setCharsPerLine,
    setShowParagraphNumbers: settingsSetters.setShowParagraphNumbers,
    handleAutoCharsPerLineChange,
    incrementEditorKey,
    setThemeMode,
    compactMode,
    showParagraphNumbers,
    themeMode,
    autoCharsPerLine,
    handleOpenProject,
    handleOpenRecentProject,
    handleOpenAsProject,
    confirmBeforeAction: unsavedWarning.confirmBeforeAction,
  });

  contentRef.current = content;

  const handleChange = (markdown: string) => {
    contentRef.current = markdown;
    setContent(markdown);
  };

  // --- Text statistics hook ---
  const {
    visibleTextCharCount,
    manuscriptCellCount,
    manuscriptPages,
    paragraphCount,
    sentenceCount,
    charTypeAnalysis,
    charUsageRates,
    readabilityAnalysis,
  } = useTextStatistics(content);

  // charCount は旧インターフェース互換用エイリアス（可視本文文字数）
  const charCount = visibleTextCharCount;

  // --- Previous day comparison ---
  const previousDayStats = usePreviousDayStats(currentFile?.name, isProjectMode(editorMode));

  // --- Linting hook ---
  const {
    ruleRunner,
    lintIssues,
    isLinting,
    handleLintIssuesUpdated,
    handleNlpError,
    refreshLinting,
  } = useLinting(
    lintingEnabled,
    lintingRuleConfigs,
    editorViewInstance,
    powerSaveMode,
    correctionConfig.guidelines,
    correctionConfig.mode,
  );

  // --- Ignored corrections hook ---
  const { ignoredCorrections, ignoreCorrection } = useIgnoredCorrections(editorMode);

  // Sync ignoredCorrections to ProseMirror plugin
  useEffect(() => {
    if (!editorViewInstance) return;

    import("@/packages/milkdown-plugin-japanese-novel/linting-plugin")
      .then(({ updateLintingSettings }) => {
        updateLintingSettings(editorViewInstance, { ignoredCorrections }, "ignored-correction");
      })
      .catch((err) => {
        console.error("[page] Failed to sync ignored corrections:", err);
      });
  }, [editorViewInstance, ignoredCorrections]);

  // --- Lint handlers hook ---
  const {
    enrichedLintIssues,
    activeLintIssueIndex,
    handleNavigateToIssue,
    handleShowLintHint,
    handleIgnoreCorrection,
    handleApplyFix,
  } = useLintHandlers({
    editorViewInstance,
    lintIssues,
    ignoreCorrection,
    triggerSwitchToCorrections,
  });

  const fileName = currentFile?.name ?? "新規ファイル";

  // Keep refs in sync so useWebMenuHandlers can call them
  openRecentProjectRef.current = (projectId: string) => void handleOpenRecentProject(projectId);
  fontScaleChangeRef.current = handleFontScaleChange;
  toggleCompactModeRef.current = handleToggleCompactMode;

  // --- Keyboard shortcuts hook ---
  useKeyboardShortcuts({
    isElectron,
    saveFile,
    handlePasteAsPlaintext,
    handleToggleCompactMode,
    handleOpenRubyDialog,
    handleToggleTcy,
    setShowSettingsModal,
    setSearchOpenTrigger,
    incrementEditorKey,
    nextTab,
    prevTab,
    newTab,
    closeTab,
    switchToIndex,
    tabs,
    activeTabId,
    isEditorTabActive: !!activeEditorTab,
    splitEditorRight: useCallback(() => splitEditor("right"), [splitEditor]),
    splitEditorDown: useCallback(() => splitEditor("down"), [splitEditor]),
    toggleExplorer: useCallback(
      () => setTopView(topView === "explorer" ? "none" : "explorer"),
      [setTopView, topView],
    ),
    toggleSearch: useCallback(
      () => setTopView(topView === "search" ? "none" : "search"),
      [setTopView, topView],
    ),
    toggleOutline: useCallback(
      () => setTopView(topView === "outline" ? "none" : "outline"),
      [setTopView, topView],
    ),
  });

  // Detect feature availability after mount to avoid SSR hydration mismatch
  const [features, setFeatures] = useState<ReturnType<typeof getAvailableFeatures>>({
    projectMode: false,
    standaloneMode: false,
    downloadFallback: false,
    isElectron: false,
  });
  useEffect(() => {
    setFeatures(getAvailableFeatures());
  }, []);

  // --- Routing: WelcomeScreen vs Editor ---
  if (editorMode === null) {
    // Show blank screen while auto-restoring last project (avoid WelcomeScreen flash)
    if (isRestoring) {
      return <div className="h-screen bg-background" />;
    }

    return (
      <div className="h-screen flex flex-col overflow-hidden relative">
        {/* Web menu bar (only for non-Electron environment) */}
        {!isElectron && (
          <WebMenuBar
            onMenuAction={handleMenuAction}
            recentProjects={recentProjects}
            checkedState={{ compactMode }}
          />
        )}

        <WelcomeScreen
          onCreateProject={handleCreateProject}
          onOpenProject={() => void handleOpenProject()}
          onOpenStandaloneFile={() => void handleOpenStandaloneFile()}
          onOpenRecentProject={(id) => void handleOpenRecentProject(id)}
          onDeleteRecentProject={(id) => void handleDeleteRecentProject(id)}
          recentProjects={recentProjects}
          isProjectModeSupported={features.projectMode}
          restoreError={restoreError}
          onDismissRestoreError={() => setRestoreError(null)}
          onOpenAccountSettings={() => {
            setSettingsInitialCategory("account");
            setShowSettingsModal(true);
          }}
        />

        {/* CreateProjectWizard dialog */}
        <CreateProjectWizard
          isOpen={showCreateWizard}
          onClose={() => setShowCreateWizard(false)}
          onProjectCreated={handleProjectCreated}
        />

        {/* Permission prompt for re-opening stored projects */}
        {permissionPromptData && (
          <PermissionPrompt
            isOpen={showPermissionPrompt}
            projectName={permissionPromptData.projectName}
            handle={permissionPromptData.handle}
            onGranted={handlePermissionGranted}
            onDenied={handlePermissionDenied}
          />
        )}
      </div>
    );
  }

  // --- Editor view (project or standalone mode) ---
  // Shared props forwarded to every SidebarPanel instance
  const sidebarPanelProps = {
    content,
    editorMode,
    compactMode,
    onChapterClick: handleChapterClick,
    onInsertText: handleInsertText,
    searchResults,
    onCloseSearchResults: handleCloseSearchResults,
    editorViewInstance,
    dictionarySearchTrigger,
    currentFilePath: currentFile?.path ?? undefined,
    newFileTrigger,
    openProjectFile,
    incrementEditorKey,
    onWordSearch: (word: string) => {
      setSearchInitialTerm(word);
      setSearchOpenTrigger((prev) => prev + 1);
    },
  } as const;

  const inspectorProps = {
    compactMode,
    charCount,
    selectedCharCount,
    paragraphCount,
    manuscriptCellCount,
    manuscriptPages,
    fileName,
    isDirty,
    isSaving,
    lastSavedTime,
    onSaveFile: saveFile,
    onFileNameChange: updateFileName,
    sentenceCount,
    charTypeAnalysis,
    charUsageRates,
    readabilityAnalysis,
    onOpenPosHighlightSettings: handleOpenPosHighlightSettings,
    activeFileName: currentFile?.name,
    activeFilePath: currentFile?.path ?? undefined,
    currentContent: content,
    onHistoryRestore: (restoredContent: string) => {
      setContent(restoredContent);
      // Clear conflict state after restoring a snapshot.
      // Set fileSyncStatus based on whether the restored content matches the last saved content,
      // so that a restored snapshot that differs from disk is not treated as clean.
      if (activeTabId !== null) {
        const currentTab = tabsRef.current.find((t) => t.id === activeTabId);
        const lastSaved =
          currentTab && isEditorTab(currentTab) ? (currentTab.lastSavedContent ?? "") : "";
        const isClean = sanitizeMdiContent(restoredContent) === sanitizeMdiContent(lastSaved);
        updateTab(activeTabId, {
          fileSyncStatus: isClean ? "clean" : "dirty",
          conflictDiskContent: null,
        });
      }
      incrementEditorKey();
    },
    onCompareInEditor: setEditorDiff,
    lintIssues: enrichedLintIssues,
    onNavigateToIssue: handleNavigateToIssue,
    onApplyFix: handleApplyFix,
    onIgnoreCorrection: handleIgnoreCorrection,
    onRefreshLinting: refreshLinting,
    isLinting,
    activeLintIssueIndex,
    onOpenLintingSettings: handleOpenLintingSettings,
    correctionMode: correctionConfig.mode,
    onCorrectionModeChange: (modeId: CorrectionModeId) => {
      const mode = CORRECTION_MODES[modeId];
      handleCorrectionConfigChange({ mode: modeId, guidelines: [...mode.defaultGuidelines] });
      const preset = LINT_PRESETS[MODE_TO_PRESET[modeId]];
      if (preset) handleLintingRuleConfigsBatchChange({ ...preset.configs });
    },
    switchToCorrectionsTrigger,
    previousDayStats,
  } as const;

  return (
    <EditorLayout
      providers={{
        diffTabContextValue,
        terminalTabContextValue,
        settings,
        settingsHandlers,
      }}
      chrome={{
        currentFile,
        isDirty,
        isElectron,
        handleMenuAction,
        recentProjects,
        compactMode,
      }}
      dialogs={{
        unsavedWarning,
        pendingCloseTabId,
        pendingCloseFileName,
        handleCloseTabSave,
        handleCloseTabDiscard,
        handleCloseTabCancel,
        showDesktopOnlyDialog,
        setShowDesktopOnlyDialog,
        confirmRemoveRecent,
        setConfirmRemoveRecent,
        handleDeleteRecentProject,
        showSettingsModal,
        setShowSettingsModal,
        settingsInitialCategory,
        setSettingsInitialCategory,
        showRubyDialog,
        setShowRubyDialog,
        rubySelectedText,
        handleApplyRuby,
        showPdfExportDialog,
        setShowPdfExportDialog,
        handlePdfExportConfirm,
        pdfExportContent,
        pdfExportMetadata,
      }}
      recovery={{
        wasAutoRecovered,
        dismissedRecovery,
        recoveryExiting,
        setRecoveryExiting,
        currentFileName: currentFile?.name,
      }}
      upgrade={{
        showUpgradeBanner,
        upgradeBannerDismissed,
        editorMode,
        featuresProjectMode: features.projectMode,
        handleUpgrade,
        handleUpgradeDismiss,
      }}
      activityBar={{
        topView,
        bottomView,
        setTopView,
        setBottomView,
        handleNewTerminalTab,
      }}
      mainArea={{
        tabs,
        editorMode,
        newTab,
        openFile,
        setNewFileTrigger,
        handleTabBarContextMenu,
        tabBarMenu,
        handleTabBarMenuAction,
        closeTabBarMenu,
        handleDockviewReady,
        sidebarPanelProps,
        tabsRef,
        editorDiff,
        setEditorDiff,
        editorDomRef,
        handleChange,
        handleInsertText,
        setSelectedCharCount,
        searchOpenTrigger,
        searchInitialTerm,
        setEditorViewInstance,
        handleShowAllSearchResults,
        ruleRunner,
        handleLintIssuesUpdated,
        handleNlpError,
        handleOpenRubyDialog,
        handleToggleTcy,
        handleOpenDictionary,
        handleShowLintHint,
        handleIgnoreCorrection,
        switchTab,
        updateTab,
      }}
      inspector={{
        isRightPanelCollapsed,
        handleToggleRightPanel,
        activeEditorTab,
        props: inspectorProps,
        showSaveToast,
        saveToastExiting,
      }}
    />
  );
}
