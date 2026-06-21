"use client";
/* eslint-disable react-hooks/rules-of-hooks, @typescript-eslint/no-unused-vars */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTheme } from "@/contexts/ThemeContext";
import EditorLayout from "@/components/EditorLayout";
import WelcomeScreen from "@/components/WelcomeScreen";
import PopoutEditorWindow from "@/components/PopoutEditorWindow";
import CreateProjectWizard from "@/components/CreateProjectWizard";
import PermissionPrompt from "@/components/PermissionPrompt";
import WebSunsetNotice from "@/components/WebSunsetNotice";
import { useRubyTcy } from "@/lib/editor-page/use-ruby-tcy";
import {
  subscribeWindowActivity,
  getWindowActivitySnapshot,
} from "@/lib/editor-page/window-activity";
import { useLintHandlers } from "@/lib/editor-page/use-lint-handlers";
import { useTabManager } from "@/lib/tab-manager";
import { useUnsavedWarning } from "@/lib/hooks/use-unsaved-warning";
import { useDockviewAdapter } from "@/lib/dockview/use-dockview-adapter";
import { useDockviewPersistence } from "@/lib/dockview/use-dockview-persistence";
import "@/lib/dockview/dockview-theme.css";
import { useElectronMenuHandlers } from "@/lib/menu/use-electron-menu-handlers";
import { useExport } from "@/lib/export/use-export";
import { openWebPrintPreview } from "@/lib/export/web-print-preview";
import TxtExportDialog from "@/components/TxtExportDialog";
import type { TxtIndentOptions } from "@/lib/export/txt-exporter";
import type { ExportMetadata } from "@/lib/export/types";
import type { PdfExportSettings } from "@/lib/export/pdf-export-settings";
import type { DocxExportSettings } from "@/lib/export/docx-export-settings";
import type { EpubExportOptions } from "@/lib/export/epub-shared";
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
import { CORRECTION_MODES } from "@/lib/linting/correction-modes";
import { buildModeRuleConfigsFromRules } from "@/lib/linting/mode-rule-configs";
import { useInstalledRuleMetas } from "@/lib/editor-page/use-installed-rule-metas";
import { useModeConfigMigration } from "@/lib/editor-page/use-mode-config-migration";
import type { CorrectionModeId } from "@/lib/linting/correction-config";
import { usePowerSaving } from "@/lib/editor-page/use-power-saving";
import { useIgnoredCorrections } from "@/lib/editor-page/use-ignored-corrections";
import { useKeyboardShortcuts } from "@/lib/editor-page/use-keyboard-shortcuts";
import { usePanelState } from "@/lib/editor-page/use-panel-state";
import { findSearchMatches, type SearchRange } from "@/lib/editor-page/find-search-matches";
import { useSearchHighlight, isEditorViewAlive } from "@/lib/editor-page/use-search-highlight";
import { useSaveToast } from "@/lib/editor-page/use-save-toast";
import { useTerminalTabs } from "@/lib/editor-page/use-terminal-tabs";
import { useDiffTabs } from "@/lib/editor-page/use-diff-tabs";
import { useContextMenu } from "@/lib/hooks/use-context-menu";
import { usePreviousDayStats } from "@/lib/editor-page/use-previous-day-stats";

import type { EditorView } from "@milkdown/prose/view";
import type { SupportedFileExtension } from "@/lib/project/project-types";

// Selections larger than this are never treated as a single-word dictionary
// lookup. Caps the synchronous textBetween() cost on段落/全選択 and avoids
// pointless Genji lookups while dragging across大量のテキスト (#1639).
const SELECTED_WORD_MAX_CHARS = 30;

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

  // #1840 / #1885: holds the active editor's on-demand live-content flush.
  // Declared early so incrementEditorKeyWithFlush (used by useEditorSettings)
  // can close over it. MilkdownEditor registers itself via registerFlush below.
  const flushActiveEditorRef = useRef<(() => string | null) | null>(null);

  // #1885: display-setting changes that trigger incrementEditorKey() remount the
  // editor, cancelling the Milkdown listener's 200ms debounce and losing the last
  // typed characters. Flush live content into React state first so the new editor
  // instance initialises with currentContentRef containing the latest keystrokes.
  const incrementEditorKeyWithFlush = useCallback(() => {
    flushActiveEditorRef.current?.();
    incrementEditorKey();
  }, [incrementEditorKey]);

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
    settingsHydrated,
  } = useEditorSettings(incrementEditorKeyWithFlush);
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
    lintingModeConfigVersion,
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
    handleLintingModeConfigVersionChange,
    handlePowerSaveModeChange,
    handleAutoPowerSaveOnBatteryChange,
    handleCorrectionConfigChange,
  } = settingsHandlers;

  const isElectron = typeof window !== "undefined" && isElectronRenderer();

  // Rule metas of every installed external ruleset (all lint rules now live in
  // external rulesets). The inspector's correction-mode dropdown derives its
  // per-rule config map from these, mirroring the settings ModeSelector (#1817).
  const loadedRules = useInstalledRuleMetas();

  // One-time recovery: re-derive the rule-config map from the current mode for
  // installs whose persisted config predates mode-aware derivation (fresh
  // installs with an empty map, AND existing users left with a COMPLETE
  // all-enabled map by the #1809/#1810 regression + "すべて有効"). Gated by a
  // persisted version so it runs exactly once and never clobbers later manual
  // edits. See use-mode-config-migration.ts.
  useModeConfigMigration({
    hydrated: settingsHydrated,
    loadedRules,
    currentMode: correctionConfig.mode,
    configVersion: lintingModeConfigVersion,
    applyConfigs: handleLintingRuleConfigsBatchChange,
    setConfigVersion: handleLintingModeConfigVersionChange,
  });

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
    // Suggest (never force) power-save on battery, so the user stays in
    // control and the mode can always be turned off (#1402 follow-up).
    onSuggestPowerSave: () => {
      notificationManager.showMessage(
        "バッテリー駆動です。省電力モードにすると校正・AI 機能を一時停止してバッテリーを節約できます。",
        {
          type: "info",
          duration: 12000,
          actions: [
            {
              label: "省電力モードにする",
              onClick: () => void handlePowerSaveModeChange(true),
            },
          ],
        },
      );
    },
  });

  // --- Panel state hook ---
  const { state: panelState, handlers: panelHandlers } = usePanelState({ setShowSettingsModal });
  const {
    topView,
    bottomView,
    searchTerm,
    caseSensitive,
    regexSearch,
    wholeWordSearch,
    normalizeVariants,
    excludeComments,
    searchTarget,
    selectionOnly,
    currentMatchIndex,
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
    setSearchTerm,
    setCaseSensitive,
    setRegexSearch,
    setWholeWordSearch,
    setNormalizeVariants,
    setExcludeComments,
    setSearchTarget,
    setSelectionOnly,
    setCurrentMatchIndex,
    handleShowAllSearchResults,
    handleCloseSearchResults,
    handleOpenLintingSettings,
    handleOpenPosHighlightSettings,
    handleOpenPowerSettings,
    triggerSwitchToCorrections,
  } = panelHandlers;

  // #1840: save flows call flushActiveEditorRef right before persisting so they
  // never write debounce-lagged content. The mounted MilkdownEditor registers
  // itself here; unmount clears it. (Ref declared early above for #1885.)
  const registerFlush = useCallback((flush: (() => string | null) | null) => {
    flushActiveEditorRef.current = flush;
  }, []);

  // #1840 (Codex F-02 mitigation): the dirty/clean decision on close/quit reads
  // `tab.isDirty`, which lags the live editor by the 200ms listener debounce.
  // Flush the live content whenever the window loses focus or becomes hidden
  // (e.g. the user clicks away, or the in-app update dialog steals focus before
  // "今すぐ再起動"), so `tab.content`/`isDirty` are current before any close
  // decision. This only syncs state (never loses data). The full fix — a main →
  // renderer close-preflight that flushes before deciding — is tracked separately.
  useEffect(() => {
    let prev = getWindowActivitySnapshot();
    return subscribeWindowActivity((next) => {
      const lostFocus = prev.isWindowFocused && !next.isWindowFocused;
      const becameHidden = prev.isDocumentVisible && !next.isDocumentVisible;
      prev = next;
      if (lostFocus || becameHidden) {
        flushActiveEditorRef.current?.();
      }
    });
  }, []);

  const tabManager = useTabManager({
    skipAutoRestore,
    autoSave,
    powerSaveMode,
    vfsReadyPromise: vfsGate.promise,
    flushLayoutState: stableFlushLayoutState,
    windowKey,
    onEditorRemountNeeded: incrementEditorKey,
    flushActiveEditorRef,
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
    restoreProjectTabs,
  } = tabManager;

  // Keep a live tabs ref for dockview panel renderers captured by stale closures.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const handleProjectSearchBufferChange = useCallback(
    (path: string, nextContent: string) => {
      const tab = tabsRef.current.find(
        (candidate) => isEditorTab(candidate) && candidate.file?.path === path,
      );
      if (!tab || !isEditorTab(tab)) return;
      updateTab(tab.id, {
        content: nextContent,
        isDirty: true,
        fileSyncStatus: "dirty",
        pendingExternalContent: nextContent,
      });
    },
    [updateTab],
  );

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
  // フローティング検索窓（SearchDialog）が開いているか。dockview pane 内の Editor から
  // 報告される。ハイライトの visibility ゲート（要求2）に使う。
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false);

  // Derive project dockview layout from workspace state (already loaded at project open)
  const projectDockviewLayout = isProjectMode(editorMode)
    ? editorMode.workspaceState.dockviewLayout
    : null;

  // --- Dockview adapter (bridges useTabManager ↔ dockview layout) ---
  const { handleDockviewReady, dockviewApi, splitEditor } = useDockviewAdapter({
    tabManager: tabManagerWithPtyCleanup,
    editorKey,
    searchOpenTrigger,
    searchInitialTerm,
    windowKey,
    projectLayout: projectDockviewLayout,
  });
  const { flushLayoutState } = useDockviewPersistence({
    dockviewApi,
    tabs: tabManagerWithPtyCleanup.tabs,
    windowKey,
    isProject: isProjectMode(editorMode),
  });
  flushLayoutStateRef.current = flushLayoutState;

  // Derive editor mode from active tab's fileType
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeEditorTab = activeTab && isEditorTab(activeTab) ? activeTab : undefined;
  const projectSearchBuffers = useMemo(
    () =>
      new Map(
        tabs.flatMap((tab) =>
          isEditorTab(tab) && tab.file?.path ? [[tab.file.path, tab.content] as const] : [],
        ),
      ),
    [tabs],
  );
  const activeFileType = activeEditorTab?.fileType ?? ".mdi";
  const mdiExtensionsEnabled = activeFileType === ".mdi";
  const gfmEnabled = activeFileType !== ".txt";

  // Stable ref so export / shortcut callbacks can read the current value without re-creating
  const isEditorTabActiveRef = useRef<boolean>(!!activeEditorTab);
  isEditorTabActiveRef.current = !!activeEditorTab;
  // Stable ref to the active tab's file type, so dialog-request callbacks (deps:
  // []) can snapshot the true file type for export normalization.
  const activeFileTypeRef = useRef<SupportedFileExtension>(activeFileType);
  activeFileTypeRef.current = activeFileType;

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
  const [selectedManuscriptCells, setSelectedManuscriptCells] = useState(0);
  const [selectedManuscriptPages, setSelectedManuscriptPages] = useState(0);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [searchSelectionRange, setSearchSelectionRange] = useState<SearchRange | null>(null);
  const { menu: tabBarMenu, show: showTabBarMenu, close: closeTabBarMenu } = useContextMenu();
  const hasAutoRecoveredRef = useRef(false);
  const [editorViewInstance, setEditorViewInstanceRaw] = useState<EditorView | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const setEditorViewInstance = useCallback((view: EditorView | null) => {
    editorViewRef.current = view; // ref FIRST so sync consumers see fresh value
    setEditorViewInstanceRaw(view);
  }, []);

  // --- 検索ハイライトの単一ソース ---
  // いずれかの検索 UI が表示中か。両方非表示ならハイライトを消す（要求2）。
  const isSearchVisible = isSearchDialogOpen || topView === "search";
  // 共有 searchTerm/options からマッチを算出（唯一の計算箇所）。
  // `content` を依存に含め、置換や編集で doc が変わった時に再計算させる。
  // 非表示・空語の時は計算をスキップし空配列を返す。
  const searchMatches = useMemo(() => {
    if (!isSearchVisible || !searchTerm || !isEditorViewAlive(editorViewInstance)) {
      return [];
    }
    return findSearchMatches(editorViewInstance.state.doc, searchTerm, {
      caseSensitive,
      regex: regexSearch,
      wholeWord: wholeWordSearch,
      normalizeVariants,
      excludeComments,
      searchTarget,
      range: selectionOnly ? (searchSelectionRange ?? undefined) : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    editorViewInstance,
    searchTerm,
    caseSensitive,
    regexSearch,
    wholeWordSearch,
    normalizeVariants,
    excludeComments,
    searchTarget,
    selectionOnly,
    searchSelectionRange,
    isSearchVisible,
    content,
  ]);

  // #1857: 明示的ナビゲーション（次へ/前へ/結果クリック）のたびに増加するカウンター。
  // コンテンツ編集で matches が再計算されても nonce は変わらないため、
  // useSearchHighlight 内でカーソル誤移動が起きない。
  const [searchNavigationNonce, setSearchNavigationNonce] = useState(0);

  // 明示的ナビゲーション専用ハンドラー。setCurrentMatchIndex と同時に nonce を増やす。
  // setSearchTerm（検索語変更時リセット）は直接 setCurrentMatchIndex を呼ぶためナビゲーションとして扱わない。
  const handleNavigateToMatch = useCallback(
    (index: number | ((prev: number) => number)) => {
      setCurrentMatchIndex(index);
      setSearchNavigationNonce((n) => n + 1);
    },
    [setCurrentMatchIndex],
  );

  useSearchHighlight({
    editorView: editorViewInstance,
    matches: searchMatches,
    currentMatchIndex,
    searchTerm,
    isSearchVisible,
    navigationNonce: searchNavigationNonce,
  });

  // フローティング検索窓は <main> のトップレベル（dockview パネル外）でレンダリングし、
  // 開閉状態を page 側で持つ。dockview パネル内に置くと、パネルのクロージャが
  // マウント時に凍結され searchTerm/matches など変化する値が pane へ届かず、入力が
  // 反映されない（editorDiff 比較ビューを <main> へ移したのと同じ理由）。
  const openSearchDialog = useCallback(() => setIsSearchDialogOpen(true), []);
  const closeSearchDialog = useCallback(() => setIsSearchDialogOpen(false), []);
  const toggleSearchDialog = useCallback(() => setIsSearchDialogOpen((v) => !v), []);

  // ⌘F・辞書語検索などの外部トリガーで検索窓を開く（カウンタ増加で発火）。
  useEffect(() => {
    if (searchOpenTrigger > 0) {
      setIsSearchDialogOpen(true);
    }
  }, [searchOpenTrigger]);

  // --- Ruby/TCY hook ---
  const { handleOpenRubyDialog, handleApplyRuby, handleToggleTcy } = useRubyTcy({
    editorViewRef,
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
    restoreProjectTabs,
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

  // Export hook: handles PDF/EPUB/DOCX export with notifications.
  // #1840: flush the live editor doc first so export/print never use
  // debounce-lagged content (falls back to React state when no editor).
  const getExportContent = useCallback(() => {
    const live = flushActiveEditorRef.current?.();
    return live ?? content;
  }, [content]);
  const getExportTitle = useCallback(() => {
    const tab = tabs.find((t) => t.id === activeTabId);
    const name = (tab && isEditorTab(tab) ? tab.file?.name : undefined) ?? "untitled";
    return name.replace(/\.[^.]+$/, "");
  }, [tabs, activeTabId]);
  // Source of truth for export normalization: the active tab's actual file
  // type. Read freshly (like getExportTitle) rather than inferred from the
  // extension-stripped display title.
  const getExportFileType = useCallback((): SupportedFileExtension => {
    const tab = tabs.find((t) => t.id === activeTabId);
    return (tab && isEditorTab(tab) ? tab.fileType : undefined) ?? ".mdi";
  }, [tabs, activeTabId]);

  // Export dialog state (PDF / DOCX share a single state slot)
  interface ExportDialogState {
    format: "pdf" | "docx" | "epub";
    content: string;
    metadata: ExportMetadata;
    /** Snapshot of the active tab's file type at the moment the dialog opened. */
    fileType: SupportedFileExtension;
  }
  const [exportDialogState, setExportDialogState] = useState<ExportDialogState | null>(null);
  const exportDialogStateRef = useRef<ExportDialogState | null>(null);

  // Print dialog state
  interface PrintDialogState {
    content: string;
    metadata: ExportMetadata;
    fileType: SupportedFileExtension;
  }
  const [printDialogState, setPrintDialogState] = useState<PrintDialogState | null>(null);

  const handlePrintDialogRequest = useCallback((content: string, metadata: ExportMetadata) => {
    setPrintDialogState({ content, metadata, fileType: activeFileTypeRef.current });
  }, []);

  // TXT export 字下げ dialog. The export hook awaits the user's choice via a
  // promise resolved when the dialog is confirmed (options) or cancelled (null).
  const [txtDialogFormat, setTxtDialogFormat] = useState<"txt" | "txt-ruby" | null>(null);
  const txtOptionsResolverRef = useRef<((options: TxtIndentOptions | null) => void) | null>(null);

  const handleRequestTxtExportOptions = useCallback(
    (format: "txt" | "txt-ruby"): Promise<TxtIndentOptions | null> =>
      new Promise<TxtIndentOptions | null>((resolve) => {
        // If a previous request is still pending (e.g. the dialog was re-opened
        // before being answered), cancel it so its awaiting export does not hang.
        txtOptionsResolverRef.current?.(null);
        txtOptionsResolverRef.current = resolve;
        setTxtDialogFormat(format);
      }),
    [],
  );

  const resolveTxtExportOptions = useCallback((options: TxtIndentOptions | null) => {
    setTxtDialogFormat(null);
    const resolve = txtOptionsResolverRef.current;
    txtOptionsResolverRef.current = null;
    resolve?.(options);
  }, []);

  const handleExportDialogRequest = useCallback(
    (format: "pdf" | "docx" | "epub", content: string, metadata: ExportMetadata) => {
      const state: ExportDialogState = {
        format,
        content,
        metadata,
        fileType: activeFileTypeRef.current,
      };
      exportDialogStateRef.current = state;
      setExportDialogState(state);
    },
    [],
  );

  const handlePdfExportConfirm = useCallback(async (settings: PdfExportSettings) => {
    const dialogState = exportDialogStateRef.current;
    if (!dialogState) return;

    // Electron path: use IPC
    if (window.electronAPI?.exportPDF) {
      setExportDialogState(null);

      const progressId = notificationManager.showProgress("PDFをエクスポート中...", {
        type: "info",
      });

      try {
        const result = await window.electronAPI.exportPDF(dialogState.content, {
          metadata: dialogState.metadata,
          verticalWriting: settings.verticalWriting,
          pageSize: settings.pageSize,
          landscape: settings.landscape,
          margins: settings.margins,
          charsPerLine: settings.charsPerLine,
          linesPerPage: settings.linesPerPage,
          fontFamily: settings.fontFamily,
          showPageNumbers: settings.showPageNumbers,
          pageNumberFormat: settings.pageNumberFormat,
          pageNumberPosition: settings.pageNumberPosition,
          textIndent: settings.textIndent,
          fullwidthSpaceIndent: settings.fullwidthSpaceIndent,
          googleFontFamily: settings.googleFontFamily,
          // Thread the active tab's snapshotted file type so the HTML pipeline
          // un-escapes MDI macros only for ".mdi" and preserves \[\[blank]]
          // literals authored in ".md"/".txt".
          fileType: dialogState.fileType,
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
        const message = error instanceof Error ? error.message : "不明なエラー";
        notificationManager.error(`PDFのエクスポートに失敗しました: ${message}`);
      }
      return;
    }

    // Web path: browser print preview (static import — no await before window.open)
    try {
      const opened = await openWebPrintPreview(
        dialogState.content,
        dialogState.metadata,
        settings,
        dialogState.fileType,
      );
      if (!opened) {
        notificationManager.warning(
          "ポップアップがブロックされました。ブラウザの設定を確認してください。",
        );
        return;
      }
      // Close dialog — print preview is open. No success toast (browser print gives no result).
      setExportDialogState(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "不明なエラー";
      notificationManager.error(`PDFのエクスポートに失敗しました: ${message}`);
    }
  }, []);

  const handlePrintConfirm = useCallback(
    async (settings: PdfExportSettings) => {
      if (!printDialogState) return;

      // Electron path: use IPC
      if (window.electronAPI?.printDocument) {
        try {
          const result = await window.electronAPI.printDocument(printDialogState.content, {
            metadata: printDialogState.metadata,
            verticalWriting: settings.verticalWriting,
            pageSize: settings.pageSize,
            landscape: settings.landscape,
            margins: settings.margins,
            charsPerLine: settings.charsPerLine,
            linesPerPage: settings.linesPerPage,
            fontFamily: settings.fontFamily,
            showPageNumbers: settings.showPageNumbers,
            pageNumberFormat: settings.pageNumberFormat,
            pageNumberPosition: settings.pageNumberPosition,
            textIndent: settings.textIndent,
            fullwidthSpaceIndent: settings.fullwidthSpaceIndent,
            googleFontFamily: settings.googleFontFamily,
            // Pass the snapshotted file type so the HTML pipeline correctly
            // handles .md/.txt literals vs .mdi MDI macros (#1882).
            fileType: printDialogState.fileType,
          });
          if (
            result !== null &&
            result !== undefined &&
            typeof result === "object" &&
            "success" in result &&
            !result.success
          ) {
            notificationManager.error(`印刷に失敗しました: ${(result as { error: string }).error}`);
            return;
          }
          setPrintDialogState(null);
        } catch (error) {
          const message = error instanceof Error ? error.message : "不明なエラー";
          notificationManager.error(`印刷に失敗しました: ${message}`);
        }
        return;
      }

      // Web path: browser print preview
      try {
        const opened = await openWebPrintPreview(
          printDialogState.content,
          printDialogState.metadata,
          settings,
        );
        if (!opened) {
          notificationManager.warning(
            "ポップアップがブロックされました。ブラウザの設定を確認してください。",
          );
          return;
        }
        setPrintDialogState(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "不明なエラー";
        notificationManager.error(`印刷に失敗しました: ${message}`);
      }
    },
    [printDialogState],
  );

  const handleDocxExportConfirm = useCallback(async (settings: DocxExportSettings) => {
    const dialogState = exportDialogStateRef.current;
    if (!dialogState) return;

    // Electron path: use IPC
    if (window.electronAPI?.exportDOCX) {
      setExportDialogState(null);

      const progressId = notificationManager.showProgress("DOCXをエクスポート中...", {
        type: "info",
      });

      try {
        const result = await window.electronAPI.exportDOCX(dialogState.content, {
          metadata: dialogState.metadata,
          settings,
          // Thread the active tab's snapshotted file type so the main-process
          // generateDocx un-escapes macros only for ".mdi". Without this, the
          // handler defaults to ".mdi" and silently drops author-written
          // \[\[blank]] literals in ".md"/".txt" on the installed desktop app.
          fileType: dialogState.fileType,
        });

        notificationManager.dismiss(progressId);

        if (result === null || result === undefined) return;

        if (typeof result === "object" && "success" in result && !result.success) {
          notificationManager.error(
            `DOCXのエクスポートに失敗しました: ${(result as { error: string }).error}`,
          );
          return;
        }

        notificationManager.success("DOCXをエクスポートしました");
      } catch (error) {
        notificationManager.dismiss(progressId);
        const message = error instanceof Error ? error.message : "不明なエラー";
        notificationManager.error(`DOCXのエクスポートに失敗しました: ${message}`);
      }
      return;
    }

    // Web path: generate DOCX blob and download
    const progressId = notificationManager.showProgress("DOCXをエクスポート中...", {
      type: "info",
    });

    try {
      const { generateDocxBlob } = await import("@/lib/export/docx-exporter");
      // Use the active tab's actual file type (snapshotted when the dialog
      // opened) so macro un-escaping only applies to ".mdi" documents. Inferring
      // from the title is wrong — the display title is extension-stripped, which
      // would silently drop author-written \[\[blank]] literals in ".md"/".txt".
      const blob = await generateDocxBlob(dialogState.content, {
        metadata: dialogState.metadata,
        settings,
        fileType: dialogState.fileType,
      });
      const baseName = (dialogState.metadata.title || "untitled").replace(/\.[^.]+$/, "");
      const { saveBlobFile } = await import("@/lib/export/save-blob-file");
      const saved = await saveBlobFile(blob, `${baseName}.docx`, false);

      notificationManager.dismiss(progressId);

      if (saved) {
        setExportDialogState(null);
        notificationManager.success("DOCXをエクスポートしました");
      }
    } catch (error) {
      notificationManager.dismiss(progressId);
      const message = error instanceof Error ? error.message : "不明なエラー";
      notificationManager.error(`DOCXのエクスポートに失敗しました: ${message}`);
    }
  }, []);

  const handleEpubExportConfirm = useCallback(async (options: EpubExportOptions) => {
    const dialogState = exportDialogStateRef.current;
    if (!dialogState) return;

    // Thread the active tab's snapshotted file type so the HTML pipeline
    // un-escapes MDI macros only for ".mdi" and preserves \[\[blank]] literals
    // authored in ".md"/".txt".
    const epubOptions: EpubExportOptions = { ...options, fileType: dialogState.fileType };

    // Electron path: use IPC
    if (window.electronAPI?.exportEPUB) {
      setExportDialogState(null);

      const progressId = notificationManager.showProgress("EPUBをエクスポート中...", {
        type: "info",
      });

      try {
        // Electron IPC serializes Uint8Array automatically
        const result = await window.electronAPI.exportEPUB(dialogState.content, epubOptions);

        notificationManager.dismiss(progressId);

        if (result === null || result === undefined) return;

        if (typeof result === "object" && "success" in result && !result.success) {
          notificationManager.error(
            `EPUBのエクスポートに失敗しました: ${(result as { error: string }).error}`,
          );
          return;
        }

        notificationManager.success("EPUBをエクスポートしました");
      } catch (error) {
        notificationManager.dismiss(progressId);
        const message = error instanceof Error ? error.message : "不明なエラー";
        notificationManager.error(`EPUBのエクスポートに失敗しました: ${message}`);
      }
      return;
    }

    // Web path: generate EPUB blob and download
    const progressId = notificationManager.showProgress("EPUBをエクスポート中...", {
      type: "info",
    });

    try {
      const { generateEpubBlob } = await import("@/lib/export/epub-web");
      const blob = await generateEpubBlob(dialogState.content, epubOptions);
      const baseName = (options.metadata.title || "untitled")
        .replace(/[<>:"/\\|?*]/g, "_")
        .replace(/\.[^.]+$/, "");
      const { saveBlobFile } = await import("@/lib/export/save-blob-file");
      const saved = await saveBlobFile(blob, `${baseName}.epub`, false);

      notificationManager.dismiss(progressId);

      if (saved) {
        setExportDialogState(null);
        notificationManager.success("EPUBをエクスポートしました");
      }
    } catch (error) {
      notificationManager.dismiss(progressId);
      const message = error instanceof Error ? error.message : "不明なエラー";
      notificationManager.error(`EPUBのエクスポートに失敗しました: ${message}`);
    }
  }, []);

  const { exportAs, printDocument } = useExport({
    getContent: getExportContent,
    getTitle: getExportTitle,
    getFileType: getExportFileType,
    getIsEditorTabActive: useCallback(() => isEditorTabActiveRef.current, []),
    onExportDialogRequest: handleExportDialogRequest,
    onPrintDialogRequest: handlePrintDialogRequest,
    onRequestTxtExportOptions: handleRequestTxtExportOptions,
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
    onPrint: () => printDocument(),
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
  } = useTextStatistics(content, activeFileType);

  // charCount は旧インターフェース互換用エイリアス（可視本文文字数）
  const charCount = visibleTextCharCount;

  // --- Previous day comparison ---
  const previousDayStats = usePreviousDayStats(
    currentFile?.path ?? undefined,
    isProjectMode(editorMode),
  );

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
  const { ignoredCorrections, ignoreCorrection, unignoreCorrection, clearIgnoredCorrections } =
    useIgnoredCorrections(editorMode);

  const ignoredCorrectionsContextValue = useMemo(
    () => ({
      items: ignoredCorrections,
      clear: clearIgnoredCorrections,
      unignore: unignoreCorrection,
    }),
    [ignoredCorrections, clearIgnoredCorrections, unignoreCorrection],
  );

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
        {/* Web版サービス終了の告知（Web版でのみ毎回表示） */}
        <WebSunsetNotice />

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
    // 共有検索 state（SearchResults を controlled 化）
    searchTerm,
    caseSensitive,
    regexSearch,
    wholeWordSearch,
    normalizeVariants,
    excludeComments,
    searchTarget,
    selectionOnly,
    hasSearchSelection: searchSelectionRange !== null,
    searchMatches,
    currentMatchIndex,
    onSearchTermChange: setSearchTerm,
    onCaseSensitiveChange: setCaseSensitive,
    onRegexSearchChange: setRegexSearch,
    onWholeWordSearchChange: setWholeWordSearch,
    onNormalizeVariantsChange: setNormalizeVariants,
    onExcludeCommentsChange: setExcludeComments,
    onSearchTargetChange: setSearchTarget,
    onSelectionOnlyChange: setSelectionOnly,
    onCurrentMatchIndexChange: handleNavigateToMatch,
    onCloseSearchResults: handleCloseSearchResults,
    editorViewInstance,
    dictionarySearchTrigger,
    currentFilePath: currentFile?.path ?? undefined,
    projectSearchBuffers,
    onProjectBufferChange: handleProjectSearchBufferChange,
    newFileTrigger,
    openProjectFile,
    incrementEditorKey,
    onWordSearch: (word: string) => {
      // 共有検索語へ反映し、フローティング検索窓を開く。
      setSearchTerm(word);
      setSearchOpenTrigger((prev) => prev + 1);
    },
  } as const;

  const inspectorProps = {
    compactMode,
    charCount,
    selectedCharCount,
    selectedManuscriptCells,
    selectedManuscriptPages,
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
    onOpenPowerSettings: handleOpenPowerSettings,
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
        const editorTab = currentTab && isEditorTab(currentTab) ? currentTab : null;
        const lastSaved = editorTab ? (editorTab.lastSavedContent ?? "") : "";
        const fileTypeOpts = editorTab ? { fileType: editorTab.fileType } : undefined;
        const isClean =
          sanitizeMdiContent(restoredContent, fileTypeOpts) ===
          sanitizeMdiContent(lastSaved, fileTypeOpts);
        updateTab(activeTabId, {
          fileSyncStatus: isClean ? "clean" : "dirty",
          // #1845: keep isDirty consistent with fileSyncStatus so the tab ●
          // shows, close-confirm fires, and auto-save picks up the restore.
          // Editor remount (incrementEditorKey) sets the value via
          // defaultValueCtx and never fires markdownUpdated, so isDirty would
          // otherwise stay false after a restore.
          isDirty: !isClean,
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
      handleLintingRuleConfigsBatchChange(buildModeRuleConfigsFromRules(modeId, loadedRules));
    },
    switchToCorrectionsTrigger,
    previousDayStats,
    selectedWord,
  } as const;

  return (
    <>
      {/* Web版サービス終了の告知（Web版でのみ毎回表示） */}
      <WebSunsetNotice />
      <EditorLayout
        providers={{
          diffTabContextValue,
          terminalTabContextValue,
          settings,
          settingsHandlers,
          ignoredCorrectionsContextValue,
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
          exportDialog: {
            state: exportDialogState,
            onClose: () => setExportDialogState(null),
            onPdfExport: handlePdfExportConfirm,
            onDocxExport: handleDocxExportConfirm,
            onEpubExport: handleEpubExportConfirm,
            content: exportDialogState?.content ?? "",
            metadata: exportDialogState?.metadata ?? { title: "" },
            fileType: exportDialogState?.fileType,
          },
          printDialog: {
            state: printDialogState,
            onClose: () => setPrintDialogState(null),
            onPrint: handlePrintConfirm,
            content: printDialogState?.content ?? "",
            metadata: printDialogState?.metadata ?? { title: "" },
          },
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
          onSelectionChange: (count: number, cells: number, pages: number) => {
            setSelectedCharCount(count);
            setSelectedManuscriptCells(cells);
            setSelectedManuscriptPages(pages);
            // 選択語を幻辞ルックアップ用に保持する。
            // 大きな選択（段落・全選択）では textBetween が O(n) で重く、語の辞書引きにも
            // 不向きなので閾値を超えたら早期に null。実際の辞書引きの debounce は
            // useGenjiWordInfo 側で行う（選択ドラッグ中の連続 IPC を抑制）。
            if (count > 0 && count <= SELECTED_WORD_MAX_CHARS && editorViewRef.current) {
              const { selection, doc } = editorViewRef.current.state;
              const text = doc.textBetween(selection.from, selection.to, "").trim();
              // 単語単位（空白区切り）の先頭語、または選択全体（日本語は空白なし）
              const word = text.split(/\s+/)[0] ?? null;
              setSelectedWord(word || null);
            } else {
              setSelectedWord(null);
            }
          },
          onSelectionRangeChange: (range: SearchRange | null) => {
            setSearchSelectionRange(range);
            if (!range) setSelectionOnly(false);
          },
          searchOpenTrigger,
          searchInitialTerm,
          // 共有検索 state（SearchDialog は <main> でレンダリング）
          searchTerm,
          caseSensitive,
          searchMatches,
          currentMatchIndex,
          isSearchDialogOpen,
          onSearchTermChange: setSearchTerm,
          onCaseSensitiveChange: setCaseSensitive,
          onCurrentMatchIndexChange: handleNavigateToMatch,
          onOpenSearchDialog: openSearchDialog,
          onCloseSearchDialog: closeSearchDialog,
          onToggleSearchDialog: toggleSearchDialog,
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
          registerFlush,
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
      <TxtExportDialog
        isOpen={txtDialogFormat != null}
        format={txtDialogFormat ?? "txt"}
        onConfirm={(options) => resolveTxtExportOptions(options)}
        onCancel={() => resolveTxtExportOptions(null)}
      />
    </>
  );
}
