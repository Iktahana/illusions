"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useTheme } from "@/contexts/ThemeContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import Inspector from "@/components/Inspector";
import NovelEditor from "@/components/Editor";
import EditorDiffView from "@/components/EditorDiffView";
import ResizablePanel from "@/components/ResizablePanel";
import TitleUpdater from "@/components/TitleUpdater";
import ActivityBar from "@/components/ActivityBar";
import SidebarSplitter from "@/components/SidebarSplitter";
import UnsavedWarningDialog from "@/components/UnsavedWarningDialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import UpgradeToProjectBanner from "@/components/UpgradeToProjectBanner";
import WelcomeScreen from "@/components/WelcomeScreen";
import PopoutEditorWindow from "@/components/PopoutEditorWindow";
import SidebarPanel from "@/components/SidebarPanel";
import CreateProjectWizard from "@/components/CreateProjectWizard";
import PermissionPrompt from "@/components/PermissionPrompt";
import SettingsModal from "@/components/SettingsModal";
import RubyDialog from "@/components/RubyDialog";
import DesktopOnlyDialog from "@/components/DesktopOnlyDialog";
import { EmptyEditorState } from "@/components/EmptyEditorState";
import { useRubyTcy } from "@/lib/editor-page/use-ruby-tcy";
import { useLintHandlers } from "@/lib/editor-page/use-lint-handlers";
import { useTabManager } from "@/lib/hooks/use-tab-manager";
import { useUnsavedWarning } from "@/lib/hooks/use-unsaved-warning";
import { DockviewReact } from "dockview-react";
import {
  dockviewTabComponents,
  TerminalPanel,
  DiffPanel,
} from "@/lib/dockview/dockview-components";
import { useDockviewAdapter } from "@/lib/dockview/use-dockview-adapter";
import { useDockviewPersistence } from "@/lib/dockview/use-dockview-persistence";
import "@/lib/dockview/dockview-theme.css";
import { useElectronMenuHandlers } from "@/lib/menu/use-electron-menu-handlers";
import { useExport } from "@/lib/export/use-export";
import { useWebMenuHandlers } from "@/lib/menu/use-web-menu-handlers";
import { useGlobalShortcuts } from "@/lib/hooks/use-global-shortcuts";
import { isElectronRenderer } from "@/lib/utils/runtime-env";
import WebMenuBar from "@/components/WebMenuBar";
import { useEditorMode } from "@/contexts/EditorModeContext";
import { EditorSettingsProvider } from "@/contexts/EditorSettingsContext";
import { getAvailableFeatures } from "@/lib/utils/feature-detection";
import { isProjectMode, isStandaloneMode } from "@/lib/project/project-types";
import { isEditorTab, isTerminalTab } from "@/lib/tab-manager/tab-types";
import type { TerminalTabState } from "@/lib/tab-manager/tab-types";
import { TerminalTabContext } from "@/contexts/TerminalTabContext";
import type { TerminalTabContextValue } from "@/contexts/TerminalTabContext";
import { useTextStatistics } from "@/lib/editor-page/use-text-statistics";
import { useEditorSettings } from "@/lib/editor-page/use-editor-settings";
import { useElectronEvents } from "@/lib/editor-page/use-electron-events";
import { useProjectLifecycle } from "@/lib/editor-page/use-project-lifecycle";
import { useLinting } from "@/lib/editor-page/use-linting";
import { usePowerSaving } from "@/lib/editor-page/use-power-saving";
import { useIgnoredCorrections } from "@/lib/editor-page/use-ignored-corrections";
import { useKeyboardShortcuts } from "@/lib/editor-page/use-keyboard-shortcuts";
import { usePanelState } from "@/lib/editor-page/use-panel-state";
import { useSaveToast } from "@/lib/editor-page/use-save-toast";

import type { EditorView } from "@milkdown/prose/view";
import type { SupportedFileExtension } from "@/lib/project/project-types";

// Module-level flag: persists across React StrictMode/HMR remounts,
// but resets on page refresh (module re-evaluated).
// Each Electron BrowserWindow has its own JS context, so no cross-window contamination.
let _skipAutoRestoreDetected: boolean | null = null;

// Module-level popout detection (checked once per window context)
let _popoutBufferInfo: { bufferId: string; fileName: string; fileType: SupportedFileExtension } | null = null;
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
    setEditorKey(prev => prev + 1);
  }, []);

  // Deferred promise gate: tab restoration waits until VFS root is set
  const [vfsGate] = useState(() => {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => { resolve = r; });
    return { promise, resolve };
  });

  // --- Editor settings hook ---
  const { settings, handlers: settingsHandlers, setters: settingsSetters } = useEditorSettings(incrementEditorKey);
  const {
    fontScale, lineHeight, paragraphSpacing, textIndent, fontFamily,
    charsPerLine, autoCharsPerLine, showParagraphNumbers, autoSave,
    posHighlightEnabled, posHighlightColors, verticalScrollBehavior,
    scrollSensitivity, compactMode, showSettingsModal,
    lintingEnabled, lintingRuleConfigs,
    powerSaveMode, autoPowerSaveOnBattery,
    correctionConfig,
  } = settings;
  const {
    handleFontScaleChange, handleLineHeightChange, handleParagraphSpacingChange,
    handleTextIndentChange, handleFontFamilyChange, handleCharsPerLineChange,
    handleAutoCharsPerLineChange, handleShowParagraphNumbersChange,
    handleAutoSaveChange, handlePosHighlightEnabledChange,
    handlePosHighlightColorsChange, handleVerticalScrollBehaviorChange,
    handleScrollSensitivityChange, handleToggleCompactMode, setShowSettingsModal,
    handleLintingEnabledChange, handleLintingRuleConfigChange,
    handleLintingRuleConfigsBatchChange,
    handlePowerSaveModeChange, handleAutoPowerSaveOnBatteryChange,
    handleCorrectionConfigChange,
  } = settingsHandlers;

  const isElectron = typeof window !== "undefined" && isElectronRenderer();

  // --- Power saving hook ---
  usePowerSaving({
    powerSaveMode,
    autoPowerSaveOnBattery,
    onPowerSaveModeChange: handlePowerSaveModeChange,
  });

  // --- Panel state hook ---
  const { state: panelState, handlers: panelHandlers } = usePanelState({ setShowSettingsModal });
  const {
    topView, bottomView, searchResults, isRightPanelCollapsed,
    dictionarySearchTrigger, settingsInitialCategory, switchToCorrectionsTrigger,
    showRubyDialog, rubySelectedText, editorDiff,
  } = panelState;
  const {
    setTopView, setBottomView, setIsRightPanelCollapsed,
    setSettingsInitialCategory, setShowRubyDialog, setRubySelectedText, setEditorDiff,
    handleOpenDictionary, handleShowAllSearchResults, handleCloseSearchResults,
    handleOpenLintingSettings, handleOpenPosHighlightSettings, triggerSwitchToCorrections,
  } = panelHandlers;

  const tabManager = useTabManager({ skipAutoRestore, autoSave, vfsReadyPromise: vfsGate.promise });
  const {
    content, setContent, currentFile, isDirty, isSaving, lastSavedTime, lastSaveWasAuto,
    openFile: tabOpenFile, saveFile, saveAsFile,
    newFile: tabNewFile, updateFileName, wasAutoRecovered, onSystemFileOpen,
    _loadSystemFile: tabLoadSystemFile,
    tabs, activeTabId, newTab, closeTab, switchTab, nextTab, prevTab, switchToIndex,
    openProjectFile, pinTab, newTerminalTab, updateTerminalTab,
    pendingCloseTabId, pendingCloseFileName, handleCloseTabSave, handleCloseTabDiscard, handleCloseTabCancel,
  } = tabManager;

  // Ref that always holds the latest tabs array (avoids stale closures in PTY callbacks)
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  // Ref that always holds the latest updateTerminalTab (avoids re-subscribing)
  const updateTerminalTabRef = useRef(updateTerminalTab);
  updateTerminalTabRef.current = updateTerminalTab;

  // --- Tab close wrapper: kill PTY session when a terminal tab closes ---
  const handleCloseTabWithPtyCleanup = useCallback(
    (tabId: string) => {
      // Look up the tab before closing it
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (tab && isTerminalTab(tab) && tab.sessionId) {
        void window.electronAPI?.pty?.kill(tab.sessionId);
      }
      closeTab(tabId);
    },
    [closeTab],
  );

  // Patched tabManager passed to the dockview adapter so that panel close
  // triggers PTY kill before removing the tab from state.
  const tabManagerWithPtyCleanup = { ...tabManager, closeTab: handleCloseTabWithPtyCleanup };

  // --- Dockview adapter (bridges useTabManager ↔ dockview layout) ---
  const {
    handleDockviewReady,
    dockviewApi,
    splitEditor,
  } = useDockviewAdapter({ tabManager: tabManagerWithPtyCleanup });
  useDockviewPersistence({ dockviewApi });

  // --- New terminal tab callback ---
  const handleNewTerminalTab = useCallback(() => {
    if (isElectronRenderer()) {
      const ptyApi = window.electronAPI?.pty;
      if (!ptyApi) return;
      // Create the tab first (shows "connecting" state immediately)
      newTerminalTab();
      // Spawn the PTY session; update the tab's sessionId once we have it
      void (async () => {
        const result = await ptyApi.spawn();
        if ("error" in result) return;
        const { sessionId } = result;
        // Update the most recently created terminal tab with an empty sessionId
        const targetTab = tabsRef.current
          .slice()
          .reverse()
          .find((t) => isTerminalTab(t) && (t as TerminalTabState).sessionId === "");
        if (targetTab) {
          updateTerminalTabRef.current(targetTab.id, { sessionId, status: "running" });
        }
      })();
    } else {
      // Web: show desktop-only dialog since terminal requires native PTY
      setShowDesktopOnlyDialog(true);
    }
  }, [newTerminalTab]);

  // --- PTY exit event listener: update tab status when process exits ---
  useEffect(() => {
    if (!isElectronRenderer()) return;
    const ptyApi = window.electronAPI?.pty;
    if (!ptyApi) return;

    const unsubExit = ptyApi.onExit(({ sessionId, exitCode }) => {
      // Find the terminal tab with this sessionId and mark it as exited
      const tab = tabsRef.current.find(
        (t) => isTerminalTab(t) && (t as TerminalTabState).sessionId === sessionId,
      );
      if (tab) {
        updateTerminalTabRef.current(tab.id, { status: "exited", exitCode });
      }
    });

    return unsubExit;
  // Subscribe once on mount; use refs to avoid stale closures
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- TerminalTabContext value: exposes terminal tab state to dockview panel components ---
  const getTerminalTabBySessionId = useCallback(
    (sessionId: string) =>
      tabsRef.current.find(
        (t): t is TerminalTabState => isTerminalTab(t) && t.sessionId === sessionId,
      ),
    [],
  );
  const setTerminalTabExited = useCallback((sessionId: string, exitCode: number) => {
    const tab = tabsRef.current.find(
      (t): t is TerminalTabState => isTerminalTab(t) && t.sessionId === sessionId,
    );
    if (tab) {
      updateTerminalTabRef.current(tab.id, { status: "exited", exitCode });
    }
  }, []);
  const killTerminalSession = useCallback((sessionId: string) => {
    void window.electronAPI?.pty?.kill(sessionId);
  }, []);
  const terminalTabContextValue: TerminalTabContextValue = {
    getTerminalTabBySessionId,
    setTerminalTabExited,
    killTerminalSession,
  };

  // Derive editor mode from active tab's fileType
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeEditorTab = activeTab && isEditorTab(activeTab) ? activeTab : undefined;
  const activeFileType = activeEditorTab?.fileType ?? ".mdi";
  const mdiExtensionsEnabled = activeFileType === ".mdi";
  const gfmEnabled = activeFileType !== ".txt";

  // Stable ref so export / shortcut callbacks can read the current value without re-creating
  const isEditorTabActiveRef = useRef<boolean>(!!activeEditorTab);
  isEditorTabActiveRef.current = !!activeEditorTab;

  const contentRef = useRef<string>(content);
  const editorDomRef = useRef<HTMLDivElement>(null);
  const [showDesktopOnlyDialog, setShowDesktopOnlyDialog] = useState(false);
  const [dismissedRecovery, setDismissedRecovery] = useState(false);
  const [recoveryExiting, setRecoveryExiting] = useState(false);
  const [searchOpenTrigger, setSearchOpenTrigger] = useState(0);
  const [newFileTrigger, setNewFileTrigger] = useState(0);
  const [searchInitialTerm, setSearchInitialTerm] = useState<string | undefined>(undefined);
  const [selectedCharCount, setSelectedCharCount] = useState(0);
  const hasAutoRecoveredRef = useRef(false);
  const [editorViewInstance, setEditorViewInstance] = useState<EditorView | null>(null);
  const programmaticScrollRef = useRef(false);

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
      recentProjects, showCreateWizard, showPermissionPrompt, permissionPromptData,
      isRestoring, restoreError, confirmRemoveRecent,
    },
    handlers: {
      handleCreateProject, handleOpenProject, handleOpenStandaloneFile,
      handleOpenRecentProject, handleDeleteRecentProject, handleOpenAsProject,
      handleProjectCreated, handlePermissionGranted, handlePermissionDenied,
      handleUpgrade, handleUpgradeDismiss,
      setShowCreateWizard, setRestoreError, setConfirmRemoveRecent,
    },
    upgrade: { showUpgradeBanner, upgradeBannerDismissed },
  } = projectLifecycle;

  // Unsaved warning hook (project mode transitions only; tabs handle per-tab dirty checks)
  const anyDirty = tabs.some((t) => isEditorTab(t) && t.isDirty);
  const unsavedWarning = useUnsavedWarning(
    anyDirty,
    saveFile,
    currentFile?.name || null
  );

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

  const newFile = useCallback((fileType?: SupportedFileExtension) => {
    tabNewFile(fileType);
    incrementEditorKey();
  }, [tabNewFile, incrementEditorKey]);

  // Electron menu "New" and "Open" bindings (with safety checks)
  useElectronMenuHandlers(newFile, openFile);

  // Export hook: handles PDF/EPUB/DOCX export with notifications
  const getExportContent = useCallback(() => content, [content]);
  const getExportTitle = useCallback(() => {
    const tab = tabs.find((t) => t.id === activeTabId);
    const name = (tab && isEditorTab(tab) ? tab.file?.name : undefined) ?? "untitled";
    return name.replace(/\.[^.]+$/, "");
  }, [tabs, activeTabId]);

  const { exportAs } = useExport({
    getContent: getExportContent,
    getTitle: getExportTitle,
    getIsEditorTabActive: useCallback(() => isEditorTabActiveRef.current, []),
  });

  // System file open: tab manager handles loading; we just update editor key
  useEffect(() => {
    if (!onSystemFileOpen) return;
    onSystemFileOpen(() => {
      incrementEditorKey();
    });
  }, [onSystemFileOpen, incrementEditorKey]);

  // Clean up ?welcome and ?pending-file parameters from URL
  useEffect(() => {
    if (skipAutoRestore && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      let changed = false;
      if (params.has("welcome")) { params.delete("welcome"); changed = true; }
      if (params.has("pending-file")) { params.delete("pending-file"); changed = true; }
      if (changed) {
        const cleanUrl = window.location.pathname + (params.toString() ? `?${params}` : "");
        window.history.replaceState({}, "", cleanUrl);
      }
    }
  }, [skipAutoRestore]);

  // Pull pending file from main process (cold-start file association)
  // This uses a pull model to avoid the race condition where the main process
  // sends IPC before React hooks are mounted.
  useEffect(() => {
    if (!isElectron) return;
    const api = window.electronAPI;
    if (!api?.getPendingFile) return;

    void api.getPendingFile().then((result) => {
      if (!result) return;
      if (result.type === "project") {
        void handleOpenAsProject(result.projectPath, result.initialFile);
      } else {
        tabLoadSystemFile(result.path, result.content);
        incrementEditorKey();
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

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
  useGlobalShortcuts(
    !isElectron ? handleMenuAction : () => {},
    editorDomRef
  );

  // --- Save toast hook ---
  const { showSaveToast, saveToastExiting } = useSaveToast({ lastSavedTime, lastSaveWasAuto });

  // Recovery notification: fade-out after 5s, then dismiss
  useEffect(() => {
    if (wasAutoRecovered && !dismissedRecovery && !recoveryExiting) {
      const fadeoutTimer = setTimeout(() => {
        setRecoveryExiting(true);
      }, 5000);

      return () => clearTimeout(fadeoutTimer);
    }

    if (recoveryExiting) {
      const dismissTimer = setTimeout(() => {
        setDismissedRecovery(true);
      }, 300);

      return () => clearTimeout(dismissTimer);
    }
  }, [wasAutoRecovered, dismissedRecovery, recoveryExiting]);

  // Paste as plaintext
  const handlePasteAsPlaintext = useCallback(async () => {
    try {
      let text: string | null = null;

      if (isElectron && typeof window !== "undefined" && window.electronAPI) {
        if (navigator.clipboard && navigator.clipboard.readText) {
          text = await navigator.clipboard.readText();
        }
      } else {
        if (navigator.clipboard && navigator.clipboard.readText) {
          text = await navigator.clipboard.readText();
        }
      }

      if (text) {
        if (editorViewInstance) {
          const { state, dispatch } = editorViewInstance;
          const { from, to } = state.selection;
          const tr = state.tr.insertText(text, from, to);
          dispatch(tr);
        } else {
          // Fallback: append at end if editor view not available
          const currentContent = contentRef.current;
          const newContent = currentContent ? `${currentContent}\n\n${text}` : text;
          setContent(newContent);
          incrementEditorKey();
        }
      }
    } catch (error) {
      console.error("Failed to paste as plaintext:", error);
    }
  }, [isElectron, setContent, editorViewInstance, incrementEditorKey]);

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

  const handleInsertText = useCallback((text: string) => {
    if (editorViewInstance) {
      const { state, dispatch } = editorViewInstance;
      const { from, to } = state.selection;
      const tr = state.tr.insertText(text, from, to);
      dispatch(tr);
    } else {
      // Fallback: append at end if editor view not available
      const currentContent = contentRef.current;
      const newContent = currentContent ? `${currentContent}\n\n${text}` : text;
      setContent(newContent);
      incrementEditorKey();
    }
  }, [editorViewInstance, setContent, incrementEditorKey]);

  const handleChapterClick = (anchorId: string) => {
    if (!anchorId) return;

    const target = document.getElementById(anchorId) as HTMLElement | null;
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.focus();
  };

  // --- Text statistics hook ---
  const {
    charCount, paragraphCount, sentenceCount,
    charTypeAnalysis, charUsageRates, readabilityAnalysis,
  } = useTextStatistics(content);

  // --- Linting hook ---
  const { ruleRunner, lintIssues, isLinting, handleLintIssuesUpdated, handleNlpError, refreshLinting } = useLinting(
    lintingEnabled,
    lintingRuleConfigs,
    editorViewInstance,
    powerSaveMode,
    correctionConfig.guidelines,
    correctionConfig.mode,
  );

  // --- Ignored corrections hook ---
  const {
    ignoredCorrections,
    ignoreCorrection,
  } = useIgnoredCorrections(editorMode);

  // Sync ignoredCorrections to ProseMirror plugin
  useEffect(() => {
    if (!editorViewInstance) return;

    import("@/packages/milkdown-plugin-japanese-novel/linting-plugin").then(
      ({ updateLintingSettings }) => {
        updateLintingSettings(
          editorViewInstance,
          { ignoredCorrections },
          "ignored-correction",
        );
      },
    ).catch((err) => {
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
    handleApplyLintPreset,
    activeLintPresetId,
  } = useLintHandlers({
    editorViewInstance,
    lintIssues,
    lintingRuleConfigs,
    handleLintingRuleConfigsBatchChange,
    ignoreCorrection,
    triggerSwitchToCorrections,
    programmaticScrollRef,
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
    toggleExplorer: useCallback(() => setTopView(topView === "explorer" ? "none" : "explorer"), [setTopView, topView]),
    toggleSearch: useCallback(() => setTopView(topView === "search" ? "none" : "search"), [setTopView, topView]),
    toggleOutline: useCallback(() => setTopView(topView === "outline" ? "none" : "outline"), [setTopView, topView]),
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
        {!isElectron && <WebMenuBar onMenuAction={handleMenuAction} recentProjects={recentProjects} checkedState={{ compactMode }} />}

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
    programmaticScrollRef,
    editorViewInstance,
    dictionarySearchTrigger,
    currentFilePath: currentFile?.path ?? undefined,
    newFileTrigger,
    openProjectFile,
    incrementEditorKey,
    onWordSearch: (word: string) => {
      setSearchInitialTerm(word);
      setSearchOpenTrigger(prev => prev + 1);
    },
  } as const;

    return (
      <TerminalTabContext.Provider value={terminalTabContextValue}>
      <EditorSettingsProvider settings={settings} handlers={settingsHandlers}>
      <div className="h-screen flex flex-col overflow-hidden relative">
         {/* Dynamic title update */}
        <TitleUpdater currentFile={currentFile} isDirty={isDirty} />

        {/* Web menu bar (only for non-Electron environment) */}
        {!isElectron && <WebMenuBar onMenuAction={handleMenuAction} recentProjects={recentProjects} checkedState={{ compactMode }} />}

         {/* Unsaved warning dialog (project mode transitions) */}
        <UnsavedWarningDialog
          isOpen={unsavedWarning.showWarning}
          fileName={currentFile?.name || "新規ファイル"}
          onSave={unsavedWarning.handleSave}
          onDiscard={unsavedWarning.handleDiscard}
          onCancel={unsavedWarning.handleCancel}
        />

        {/* Unsaved warning dialog (tab close) */}
        <UnsavedWarningDialog
          isOpen={pendingCloseTabId !== null}
          fileName={pendingCloseFileName}
          onSave={handleCloseTabSave}
          onDiscard={handleCloseTabDiscard}
          onCancel={handleCloseTabCancel}
        />

        {/* Desktop-only feature dialog (shown to web users for terminal) */}
        <DesktopOnlyDialog
          isOpen={showDesktopOnlyDialog}
          onClose={() => setShowDesktopOnlyDialog(false)}
          featureName="ターミナル"
        />

        {/* 最近のプロジェクト削除確認ダイアログ */}
        <ConfirmDialog
          isOpen={confirmRemoveRecent !== null}
          title="プロジェクトが見つかりません"
          message={confirmRemoveRecent?.message ?? ""}
          confirmLabel="削除する"
          cancelLabel="キャンセル"
          dangerous={true}
          onConfirm={() => {
            if (confirmRemoveRecent) {
              const { projectId: pid } = confirmRemoveRecent;
              setConfirmRemoveRecent(null);
              void handleDeleteRecentProject(pid);
            }
          }}
          onCancel={() => setConfirmRemoveRecent(null)}
        />

        {/* UpgradeBanner for standalone mode */}
        {showUpgradeBanner && !upgradeBannerDismissed && isStandaloneMode(editorMode) && features.projectMode && (
          <UpgradeToProjectBanner
            onUpgrade={() => void handleUpgrade()}
            onDismiss={handleUpgradeDismiss}
          />
        )}

        <SettingsModal
          isOpen={showSettingsModal}
          onClose={() => {
            setShowSettingsModal(false);
            setSettingsInitialCategory(undefined);
          }}
          initialCategory={settingsInitialCategory}
        />

        {/* Ruby dialog */}
        <RubyDialog
          isOpen={showRubyDialog}
          onClose={() => setShowRubyDialog(false)}
          selectedText={rubySelectedText}
          onApply={handleApplyRuby}
        />

         {/* Auto-recovery notification (Web only, fixed position) */}
         {!isElectron && wasAutoRecovered && !dismissedRecovery && (
          <div className={`fixed left-0 top-10 right-0 z-50 bg-background-elevated border-b border-border px-4 py-3 flex items-center justify-between shadow-lg ${recoveryExiting ? 'animate-slide-out-up' : 'animate-slide-in-down'}`}>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-success rounded-full flex-shrink-0 animate-pulse-glow"></div>
              <p className="text-sm text-foreground">
                <span className="font-semibold text-foreground">✓ 前回編集したファイルを復元しました：</span> <span className="font-mono text-success">{currentFile?.name}</span>
              </p>
            </div>
            <button
              onClick={() => {
                setRecoveryExiting(true);
              }}
              className="text-foreground-secondary hover:text-foreground hover:bg-hover text-lg font-medium flex-shrink-0 ml-4 w-8 h-8 rounded flex items-center justify-center transition-all duration-200 hover:scale-110"
            >
              ✕
            </button>
          </div>
        )}

       <div className="flex-1 flex overflow-hidden">
         {/* Activity Bar */}
         <ActivityBar
           topView={topView}
           bottomView={bottomView}
           compactMode={compactMode}
           onTopViewChange={(view) => {
             if (view === "settings") {
               setShowSettingsModal(true);
             } else {
               setTopView(view);
             }
           }}
           onBottomViewChange={(view) => {
             if (view === "settings") {
               setShowSettingsModal(true);
             } else {
               setBottomView(view);
             }
           }}
         />

           {/* Left side panel */}
          {(topView !== "none" || bottomView !== "none") && (
            <ResizablePanel side="left" defaultWidth={compactMode ? 200 : 256} minWidth={compactMode ? 160 : 200} maxWidth={compactMode ? 320 : 400}>
              {(() => {
                const topPanel = topView !== "none" ? <SidebarPanel view={topView} {...sidebarPanelProps} /> : null;
                const bottomPanel = bottomView !== "none" ? <SidebarPanel view={bottomView} {...sidebarPanelProps} /> : null;

                if (topPanel && bottomPanel) {
                  return <SidebarSplitter top={topPanel} bottom={bottomPanel} />;
                }
                return topPanel || bottomPanel;
              })()}
          </ResizablePanel>
        )}

        <main className="flex-1 flex flex-col overflow-hidden min-h-0 relative bg-background">
          {tabs.length === 0 && (
            <div className="absolute inset-0 z-10">
              <EmptyEditorState
                onNewFile={() => {
                  if (isProjectMode(editorMode)) {
                    setTopView("files");
                    setNewFileTrigger(prev => prev + 1);
                  } else {
                    newTab();
                  }
                }}
                onOpenFile={() => void openFile()}
              />
            </div>
          )}
          <DockviewReact
            className="flex-1 dockview-theme-illusions"
            components={{
              editor: ({ api: panelApi, params: panelParams }) => {
                // Each dockview panel receives its own params.
                // Only the panel matching the active tab renders the full interactive editor;
                // other panels show a read-only content snapshot.
                const panelBufferId = panelParams?.bufferId ?? activeTabId;
                const isActivePanel = panelBufferId === activeTabId;

                if (editorDiff && isActivePanel) {
                  return (
                    <EditorDiffView
                      snapshotContent={editorDiff.snapshotContent}
                      currentContent={editorDiff.currentContent}
                      snapshotLabel={editorDiff.label}
                      onClose={() => setEditorDiff(null)}
                    />
                  );
                }

                if (isActivePanel) {
                  return (
                    <ErrorBoundary sectionName="エディタ">
                      <div ref={editorDomRef} className="h-full">
                        <NovelEditor
                          key={`tab-${panelBufferId}-${editorKey}`}
                          initialContent={content}
                          onChange={handleChange}
                          onInsertText={handleInsertText}
                          onSelectionChange={setSelectedCharCount}
                          searchOpenTrigger={searchOpenTrigger}
                          searchInitialTerm={searchInitialTerm}
                          onEditorViewReady={setEditorViewInstance}
                          programmaticScrollRef={programmaticScrollRef}
                          onShowAllSearchResults={handleShowAllSearchResults}
                          lintingRuleRunner={ruleRunner}
                          onLintIssuesUpdated={handleLintIssuesUpdated}
                          onNlpError={handleNlpError}
                          onOpenRubyDialog={handleOpenRubyDialog}
                          onToggleTcy={handleToggleTcy}
                          onOpenDictionary={handleOpenDictionary}
                          onShowLintHint={handleShowLintHint}
                          onIgnoreCorrection={handleIgnoreCorrection}
                          mdiExtensionsEnabled={mdiExtensionsEnabled}
                          gfmEnabled={gfmEnabled}
                        />
                      </div>
                    </ErrorBoundary>
                  );
                }

                // Non-active panel: render a lightweight read-only editor
                // that activates the tab when clicked
                const panelTab = tabs.find((t) => t.id === panelBufferId);
                const panelEditorTab = panelTab && isEditorTab(panelTab) ? panelTab : undefined;
                const panelFileType = panelEditorTab?.fileType ?? ".mdi";
                return (
                  <div
                    className="h-full cursor-pointer"
                    onClick={() => {
                      switchTab(panelBufferId);
                      panelApi.setActive();
                    }}
                  >
                    <ErrorBoundary sectionName="エディタ">
                      <NovelEditor
                        key={`tab-${panelBufferId}-inactive`}
                        initialContent={panelEditorTab?.lastSavedContent ?? ""}
                        mdiExtensionsEnabled={panelFileType === ".mdi"}
                        gfmEnabled={panelFileType !== ".txt"}
                      />
                    </ErrorBoundary>
                  </div>
                );
              },
              // Placeholder components for Phase 2/4 implementation
              terminal: TerminalPanel,
              diff: DiffPanel,
            }}
            tabComponents={dockviewTabComponents}
            onReady={handleDockviewReady}
          />

           {/* Save complete toast */}
          {showSaveToast && (
            <div
              className={`fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-background-elevated border border-border rounded-lg shadow-lg flex items-center gap-2 z-50 ${
                saveToastExiting ? 'animate-save-toast-out' : 'animate-save-toast-in'
              }`}
            >
              <span className="text-success text-sm font-medium">✓</span>
              <span className="text-foreground-secondary text-sm">保存完了</span>
            </div>
           )}
         </main>

          {/* Right side panel: statistics (always visible) */}
          <ResizablePanel
            side="right"
            defaultWidth={compactMode ? 200 : 256}
            minWidth={compactMode ? 160 : 200}
            maxWidth={compactMode ? 320 : 400}
            collapsible={true}
            isCollapsed={isRightPanelCollapsed}
            onToggleCollapse={() => setIsRightPanelCollapsed(!isRightPanelCollapsed)}
          >
          <ErrorBoundary sectionName="インスペクタ">
          {activeEditorTab ? (
            <Inspector
              compactMode={compactMode}
              charCount={charCount}
              selectedCharCount={selectedCharCount}
              paragraphCount={paragraphCount}
              fileName={fileName}
              isDirty={isDirty}
              isSaving={isSaving}
              lastSavedTime={lastSavedTime}
              onSaveFile={saveFile}
              onFileNameChange={updateFileName}
              sentenceCount={sentenceCount}
              charTypeAnalysis={charTypeAnalysis}
              charUsageRates={charUsageRates}
              readabilityAnalysis={readabilityAnalysis}
              onOpenPosHighlightSettings={handleOpenPosHighlightSettings}
              activeFileName={currentFile?.name}
              currentContent={content}
              onHistoryRestore={(restoredContent: string) => {
                setContent(restoredContent);
                incrementEditorKey();
              }}
              onCompareInEditor={setEditorDiff}
              lintIssues={enrichedLintIssues}
              onNavigateToIssue={handleNavigateToIssue}
              onApplyFix={handleApplyFix}
              onIgnoreCorrection={handleIgnoreCorrection}
              onRefreshLinting={refreshLinting}
              isLinting={isLinting}
              activeLintIssueIndex={activeLintIssueIndex}
              onOpenLintingSettings={handleOpenLintingSettings}
              onApplyLintPreset={handleApplyLintPreset}
              activeLintPresetId={activeLintPresetId}
              switchToCorrectionsTrigger={switchToCorrectionsTrigger}
            />
          ) : (
            // Non-editor tab (terminal / diff): inspector is unavailable
            <div className="h-full flex items-center justify-center p-4">
              <p className="text-foreground-secondary text-sm text-center">
                インスペクタはエディタタブでのみ使用できます
              </p>
            </div>
          )}
          </ErrorBoundary>
        </ResizablePanel>
      </div>
    </div>
      </EditorSettingsProvider>
      </TerminalTabContext.Provider>
  );
}
