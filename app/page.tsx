"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTheme } from "@/contexts/ThemeContext";
import Explorer, { FilesPanel } from "@/components/Explorer";
import Inspector from "@/components/Inspector";
import NovelEditor from "@/components/Editor";
import EditorDiffView from "@/components/EditorDiffView";
import ResizablePanel from "@/components/ResizablePanel";
import TitleUpdater from "@/components/TitleUpdater";
import ActivityBar, { type ActivityBarView } from "@/components/ActivityBar";
import SidebarSplitter from "@/components/SidebarSplitter";
import SearchResults from "@/components/SearchResults";
import UnsavedWarningDialog from "@/components/UnsavedWarningDialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import UpgradeToProjectBanner from "@/components/UpgradeToProjectBanner";
import WordFrequency from "@/components/WordFrequency";
import Characters from "@/components/Characters";
import Dictionary from "@/components/Dictionary";
import Outline from "@/components/Outline";
import WelcomeScreen from "@/components/WelcomeScreen";
import CreateProjectWizard from "@/components/CreateProjectWizard";
import PermissionPrompt from "@/components/PermissionPrompt";
import SettingsModal from "@/components/SettingsModal";
import type { SettingsCategory } from "@/components/SettingsModal";
import { LINT_PRESETS, LINT_RULES_META, LINT_DEFAULT_CONFIGS } from "@/lib/linting/lint-presets";
import RubyDialog from "@/components/RubyDialog";
import { useTabManager } from "@/lib/use-tab-manager";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";
import TabBar from "@/components/TabBar";
import { useElectronMenuHandlers } from "@/lib/use-electron-menu-handlers";
import { useWebMenuHandlers } from "@/lib/use-web-menu-handlers";
import { useGlobalShortcuts } from "@/lib/use-global-shortcuts";
import { isElectronRenderer } from "@/lib/runtime-env";
import WebMenuBar from "@/components/WebMenuBar";
import { useEditorMode } from "@/contexts/EditorModeContext";
import { getAvailableFeatures } from "@/lib/feature-detection";
import { isProjectMode, isStandaloneMode } from "@/lib/project-types";
import { useTextStatistics } from "@/lib/editor-page/use-text-statistics";
import { useEditorSettings } from "@/lib/editor-page/use-editor-settings";
import { useElectronEvents } from "@/lib/editor-page/use-electron-events";
import { useProjectLifecycle } from "@/lib/editor-page/use-project-lifecycle";
import { useLinting } from "@/lib/editor-page/use-linting";

import type { EditorView } from "@milkdown/prose/view";
import type { LintIssue } from "@/lib/linting/types";
import type { SupportedFileExtension } from "@/lib/project-types";

// Module-level flag: persists across React StrictMode/HMR remounts,
// but resets on page refresh (module re-evaluated).
// Each Electron BrowserWindow has its own JS context, so no cross-window contamination.
let _skipAutoRestoreDetected: boolean | null = null;

export default function EditorPage() {
  const { editorMode, setProjectMode, setStandaloneMode, resetMode } = useEditorMode();
  const { themeMode, setThemeMode } = useTheme();

  // Detect ?welcome parameter: skip auto-restore and show welcome page
  const [skipAutoRestore] = useState(() => {
    if (typeof window === "undefined") return false;
    if (_skipAutoRestoreDetected !== null) return _skipAutoRestoreDetected;

    const params = new URLSearchParams(window.location.search);
    _skipAutoRestoreDetected = params.has("welcome");
    return _skipAutoRestoreDetected;
  });

  const [editorKey, setEditorKey] = useState(0);
  const incrementEditorKey = useCallback(() => {
    setEditorKey(prev => prev + 1);
  }, []);

  // --- Editor settings hook ---
  const { settings, handlers: settingsHandlers, setters: settingsSetters } = useEditorSettings(incrementEditorKey);
  const {
    fontScale, lineHeight, paragraphSpacing, textIndent, fontFamily,
    charsPerLine, autoCharsPerLine, showParagraphNumbers, autoSave,
    posHighlightEnabled, posHighlightColors, verticalScrollBehavior,
    scrollSensitivity, compactMode, showSettingsModal,
    lintingEnabled, lintingRuleConfigs,
    llmEnabled, llmModelId,
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
    handleLlmEnabledChange, handleLlmModelIdChange,
  } = settingsHandlers;

  const tabManager = useTabManager({ skipAutoRestore, autoSave });
  const {
    content, setContent, currentFile, isDirty, isSaving, lastSavedTime,
    openFile: tabOpenFile, saveFile, saveAsFile,
    newFile: tabNewFile, updateFileName, wasAutoRecovered, onSystemFileOpen,
    _loadSystemFile: tabLoadSystemFile,
    tabs, activeTabId, newTab, closeTab, switchTab, nextTab, prevTab, switchToIndex,
    openProjectFile, pinTab,
    pendingCloseTabId, pendingCloseFileName, handleCloseTabSave, handleCloseTabDiscard, handleCloseTabCancel,
  } = tabManager;

  // Derive editor mode from active tab's fileType
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeFileType = activeTab?.fileType ?? ".mdi";
  const mdiExtensionsEnabled = activeFileType === ".mdi";
  const gfmEnabled = activeFileType !== ".txt";

  const contentRef = useRef<string>(content);
  const editorDomRef = useRef<HTMLDivElement>(null);
  const [dismissedRecovery, setDismissedRecovery] = useState(false);
  const [recoveryExiting, setRecoveryExiting] = useState(false);
  const [searchOpenTrigger, setSearchOpenTrigger] = useState(0);
  const [searchInitialTerm, setSearchInitialTerm] = useState<string | undefined>(undefined);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [saveToastExiting, setSaveToastExiting] = useState(false);
  const [selectedCharCount, setSelectedCharCount] = useState(0);
  const prevLastSavedTimeRef = useRef<number | null>(null);
  const hasAutoRecoveredRef = useRef(false);
  const [editorViewInstance, setEditorViewInstance] = useState<EditorView | null>(null);
  const programmaticScrollRef = useRef(false);

  const isElectron = typeof window !== "undefined" && isElectronRenderer();

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
  const anyDirty = tabs.some((t) => t.isDirty);
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

  // System file open: tab manager handles loading; we just update editor key
  useEffect(() => {
    if (!onSystemFileOpen) return;
    onSystemFileOpen(() => {
      incrementEditorKey();
    });
  }, [onSystemFileOpen, incrementEditorKey]);

  // Clean up ?welcome parameter from URL
  useEffect(() => {
    if (skipAutoRestore && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.has("welcome")) {
        params.delete("welcome");
        const cleanUrl = window.location.pathname + (params.toString() ? `?${params}` : "");
        window.history.replaceState({}, "", cleanUrl);
      }
    }
  }, [skipAutoRestore]);

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
    editorView: editorViewInstance,
    fontScale,
    onFontScaleChange: (scale: number) => fontScaleChangeRef.current(scale),
  });

  // Global shortcuts for Web (only when not in Electron)
  useGlobalShortcuts(
    !isElectron ? handleMenuAction : () => {},
    editorDomRef
  );

  // Save toast: show when lastSavedTime updates (skip auto-save / initial load)
  useEffect(() => {
    if (lastSavedTime && prevLastSavedTimeRef.current !== lastSavedTime) {
      if (prevLastSavedTimeRef.current !== null) {
        // Only show toast for manual saves (positive timestamp)
        if (lastSavedTime > 0) {
          setShowSaveToast(true);
          setSaveToastExiting(false);

          let exitTimer: ReturnType<typeof setTimeout> | null = null;
          const hideTimer = setTimeout(() => {
            setSaveToastExiting(true);
            exitTimer = setTimeout(() => {
              setShowSaveToast(false);
              setSaveToastExiting(false);
            }, 150);
          }, 1200);

          prevLastSavedTimeRef.current = lastSavedTime;
          return () => {
            clearTimeout(hideTimer);
            if (exitTimer) clearTimeout(exitTimer);
          };
        }
      }
      prevLastSavedTimeRef.current = lastSavedTime;
    }
  }, [lastSavedTime]);

  const [showRubyDialog, setShowRubyDialog] = useState(false);
  const [rubySelectedText, setRubySelectedText] = useState("");
  const rubySelectionRef = useRef<{ from: number; to: number } | null>(null);
  const [editorDiff, setEditorDiff] = useState<{ snapshotContent: string; currentContent: string; label: string } | null>(null);
  const [topView, setTopView] = useState<ActivityBarView>("explorer");
  const [bottomView, setBottomView] = useState<ActivityBarView>("none");
  const [searchResults, setSearchResults] = useState<{matches: { from: number; to: number }[], searchTerm: string} | null>(null);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);

  /** Open the Ruby dialog with current editor selection */
  const handleOpenRubyDialog = useCallback(() => {
    if (!editorViewInstance) return;
    const { state } = editorViewInstance;
    const { from, to } = state.selection;
    if (from === to) return; // No selection
    const text = state.doc.textBetween(from, to);
    if (!text.trim()) return;
    rubySelectionRef.current = { from, to };
    setRubySelectedText(text);
    setShowRubyDialog(true);
  }, [editorViewInstance]);

  /** Apply Ruby markup by replacing the editor selection */
  const handleApplyRuby = useCallback((rubyMarkup: string) => {
    if (!editorViewInstance) return;
    const sel = rubySelectionRef.current;
    if (!sel) return;
    const { state, dispatch } = editorViewInstance;
    const tr = state.tr.insertText(rubyMarkup, sel.from, sel.to);
    dispatch(tr);
    rubySelectionRef.current = null;
  }, [editorViewInstance]);

  /** Wrap selected text with tcy syntax: ^text^ */
  const handleToggleTcy = useCallback(() => {
    if (!editorViewInstance) return;
    const { state, dispatch } = editorViewInstance;
    const { from, to } = state.selection;
    if (from === to) return;
    const text = state.doc.textBetween(from, to);
    if (!text.trim()) return;
    // Toggle: if already wrapped in ^...^, unwrap; otherwise wrap
    if (text.startsWith("^") && text.endsWith("^") && text.length >= 2) {
      const unwrapped = text.slice(1, -1);
      const tr = state.tr.insertText(unwrapped, from, to);
      dispatch(tr);
    } else {
      const tr = state.tr.insertText(`^${text}^`, from, to);
      dispatch(tr);
    }
  }, [editorViewInstance]);

  /** Open the dictionary panel in the sidebar with optional search term */
  const [dictionarySearchTrigger, setDictionarySearchTrigger] = useState<{ term: string; id: number }>({ term: "", id: 0 });
  const handleOpenDictionary = useCallback((searchTerm?: string) => {
    if (searchTerm) {
      setDictionarySearchTrigger(prev => ({ term: searchTerm, id: prev.id + 1 }));
    }
    setTopView("dictionary");
  }, []);

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

  const handleShowAllSearchResults = (matches: { from: number; to: number }[], searchTerm: string) => {
    setSearchResults({ matches, searchTerm });
    setTopView("search");
  };

  const handleCloseSearchResults = () => {
    setSearchResults(null);
    setTopView("explorer");
  };

  // --- Text statistics hook ---
  const {
    charCount, paragraphCount, sentenceCount,
    charTypeAnalysis, charUsageRates, readabilityAnalysis,
  } = useTextStatistics(content);

  // --- Linting hook ---
  const { ruleRunner, lintIssues, isLinting, handleLintIssuesUpdated, refreshLinting } = useLinting(
    lintingEnabled,
    lintingRuleConfigs,
    editorViewInstance,
    llmEnabled,
  );

  // Enrich lint issues with original text from the document
  const enrichedLintIssues = useMemo(() => {
    if (!editorViewInstance || lintIssues.length === 0) return lintIssues;
    const doc = editorViewInstance.state.doc;
    return lintIssues.map((issue: LintIssue) => {
      try {
        const originalText = doc.textBetween(
          issue.from,
          Math.min(issue.to, doc.content.size),
        );
        return { ...issue, originalText };
      } catch {
        return issue;
      }
    });
  }, [editorViewInstance, lintIssues]);

  // Cursor → issue sync: track which issue the cursor is on
  const [activeLintIssueIndex, setActiveLintIssueIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!editorViewInstance || enrichedLintIssues.length === 0) {
      setActiveLintIssueIndex(null);
      return;
    }
    const dom = editorViewInstance.dom as HTMLElement;
    const handler = () => {
      const pos = editorViewInstance.state.selection.from;
      const idx = enrichedLintIssues.findIndex(
        (i: LintIssue) => pos >= i.from && pos <= i.to,
      );
      setActiveLintIssueIndex(idx >= 0 ? idx : null);
    };
    dom.addEventListener("mouseup", handler);
    dom.addEventListener("keyup", handler);
    return () => {
      dom.removeEventListener("mouseup", handler);
      dom.removeEventListener("keyup", handler);
    };
  }, [editorViewInstance, enrichedLintIssues]);

  // Settings modal: track which category to open on
  const [settingsInitialCategory, setSettingsInitialCategory] = useState<SettingsCategory | undefined>(undefined);

  // Trigger to switch Inspector to corrections tab (monotonically increasing)
  const [switchToCorrectionsTrigger, setSwitchToCorrectionsTrigger] = useState(0);

  /** Navigate to a lint issue in the editor */
  const handleNavigateToIssue = useCallback((issue: LintIssue) => {
    if (!editorViewInstance) return;
    void import("@milkdown/prose/state").then(({ TextSelection }) => {
      const { state, dispatch } = editorViewInstance;
      const clampedTo = Math.min(issue.to, state.doc.content.size);
      const clampedFrom = Math.min(issue.from, clampedTo);
      const selection = TextSelection.create(state.doc, clampedFrom, clampedTo);

      // Allow the scroll protection to accept our programmatic scroll
      programmaticScrollRef.current = true;

      dispatch(state.tr.setSelection(selection).scrollIntoView());

      // DOM-level scroll for vertical writing mode
      try {
        const coords = editorViewInstance.coordsAtPos(clampedFrom);
        const scrollContainer = editorViewInstance.dom.closest(
          ".flex-1.bg-background-secondary"
        ) as HTMLElement | null;
        if (scrollContainer) {
          const containerRect = scrollContainer.getBoundingClientRect();
          const offsetY = coords.top - containerRect.top + scrollContainer.scrollTop;
          const offsetX = coords.left - containerRect.left + scrollContainer.scrollLeft;
          scrollContainer.scrollTo({
            left: offsetX - containerRect.width / 2,
            top: offsetY - containerRect.height / 2,
            behavior: "smooth",
          });
        }
      } catch {
        // fallback
        try {
          const domResult = editorViewInstance.domAtPos(clampedFrom);
          const target = domResult.node instanceof HTMLElement
            ? domResult.node
            : domResult.node.parentElement;
          target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        } catch {
          // ignore
        }
      }

      // Reset the flag after smooth scroll completes
      setTimeout(() => {
        programmaticScrollRef.current = false;
      }, 500);

      editorViewInstance.focus();
    });
  }, [editorViewInstance]);

  /** Navigate to a lint issue from context menu (also switches Inspector to corrections tab) */
  const handleShowLintHint = useCallback((issue: LintIssue) => {
    setSwitchToCorrectionsTrigger((n) => n + 1);
    handleNavigateToIssue(issue);
  }, [handleNavigateToIssue]);

  /** Apply a lint fix by replacing the text range */
  const handleApplyFix = useCallback((issue: LintIssue) => {
    if (!editorViewInstance || !issue.fix) return;
    const { state, dispatch } = editorViewInstance;
    const clampedTo = Math.min(issue.to, state.doc.content.size);
    const clampedFrom = Math.min(issue.from, clampedTo);
    const tr = state.tr.insertText(issue.fix.replacement, clampedFrom, clampedTo);
    dispatch(tr);
  }, [editorViewInstance]);

  /** Open SettingsModal directly on the linting tab */
  const handleOpenLintingSettings = useCallback(() => {
    setSettingsInitialCategory("linting");
    setShowSettingsModal(true);
  }, [setShowSettingsModal]);

  /** Open SettingsModal directly on the POS highlight tab */
  const handleOpenPosHighlightSettings = useCallback(() => {
    setSettingsInitialCategory("pos-highlight");
    setShowSettingsModal(true);
  }, [setShowSettingsModal]);

  /** Apply a lint preset from the Inspector dropdown */
  const handleApplyLintPreset = useCallback((presetId: string) => {
    const preset = LINT_PRESETS[presetId];
    if (preset) {
      handleLintingRuleConfigsBatchChange({ ...preset.configs });
    }
  }, [handleLintingRuleConfigsBatchChange]);

  /** Detect which preset matches the current linting config */
  const activeLintPresetId = useMemo(() => {
    for (const [id, preset] of Object.entries(LINT_PRESETS)) {
      const allMatch = LINT_RULES_META.every((rule) => {
        const current = lintingRuleConfigs[rule.id] ?? LINT_DEFAULT_CONFIGS[rule.id] ?? { enabled: true, severity: "warning" };
        const presetCfg = preset.configs[rule.id];
        if (!presetCfg) return false;
        return current.enabled === presetCfg.enabled && current.severity === presetCfg.severity;
      });
      if (allMatch) return id;
    }
    return "";
  }, [lintingRuleConfigs]);

  const fileName = currentFile?.name ?? "新規ファイル";

  // Keep refs in sync so useWebMenuHandlers can call them
  openRecentProjectRef.current = (projectId: string) => void handleOpenRecentProject(projectId);
  fontScaleChangeRef.current = handleFontScaleChange;
  toggleCompactModeRef.current = handleToggleCompactMode;

  // Keyboard shortcuts: Cmd/Ctrl+S=save, Cmd/Ctrl+F=search, etc.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
      const isMac = nav.userAgentData
        ? nav.userAgentData.platform === "macOS"
        : /mac/i.test(navigator.userAgent);

      // Cmd+, (macOS) / Ctrl+, (Windows/Linux): Settings
      const isSettingsShortcut = isMac
        ? event.metaKey && event.key === ","
        : event.ctrlKey && event.key === ",";

      // Cmd+S (macOS) / Ctrl+S (Windows/Linux): Save
      const isSaveShortcut = isMac
        ? event.metaKey && event.key === "s"
        : event.ctrlKey && event.key === "s";

      // Cmd+F (macOS) / Ctrl+F (Windows/Linux): Search
      const isSearchShortcut = isMac
        ? event.metaKey && event.key === "f"
        : event.ctrlKey && event.key === "f";

      // Shift+Cmd+V (macOS) / Shift+Ctrl+V (Windows/Linux): Paste as plaintext
      const isPasteAsPlaintextShortcut = isMac
        ? event.shiftKey && event.metaKey && event.key === "v"
        : event.shiftKey && event.ctrlKey && event.key === "v";

      // Shift+Cmd+M (macOS) / Shift+Ctrl+M (Windows/Linux): Compact mode toggle
      const isCompactModeShortcut = isMac
        ? event.shiftKey && event.metaKey && event.key === "m"
        : event.shiftKey && event.ctrlKey && event.key === "m";

      // Shift+Cmd+R (macOS) / Shift+Ctrl+R (Windows/Linux): Ruby dialog
      const isRubyShortcut = isMac
        ? event.shiftKey && event.metaKey && event.key === "r"
        : event.shiftKey && event.ctrlKey && event.key === "r";

      // Shift+Cmd+T (macOS) / Shift+Ctrl+T (Windows/Linux): Tcy
      const isTcyShortcut = isMac
        ? event.shiftKey && event.metaKey && event.key === "t"
        : event.shiftKey && event.ctrlKey && event.key === "t";

      // Tab shortcuts (Web only; Electron handles Cmd+W/T via menu)
      const isNextTab = event.ctrlKey && !event.shiftKey && event.key === "Tab";
      const isPrevTab = event.ctrlKey && event.shiftKey && event.key === "Tab";
      const isNewTabShortcut = !isElectron && (isMac
        ? event.metaKey && !event.shiftKey && event.key === "t"
        : event.ctrlKey && !event.shiftKey && event.key === "t");
      const isCloseTabShortcut = !isElectron && (isMac
        ? event.metaKey && event.key === "w"
        : event.ctrlKey && event.key === "w");
      const isTabJump = (isMac ? event.metaKey : event.ctrlKey) &&
        !event.shiftKey && event.key >= "1" && event.key <= "9";

      if (isTcyShortcut) {
        event.preventDefault();
        handleToggleTcy();
      } else if (isRubyShortcut) {
        event.preventDefault();
        handleOpenRubyDialog();
      } else if (isCompactModeShortcut) {
        event.preventDefault();
        handleToggleCompactMode();
      } else if (isSettingsShortcut) {
        event.preventDefault();
        setShowSettingsModal(true);
      } else if (isSaveShortcut) {
        event.preventDefault();
        void saveFile();
      } else if (isSearchShortcut) {
        event.preventDefault();
        setSearchOpenTrigger(prev => prev + 1);
      } else if (isPasteAsPlaintextShortcut) {
        event.preventDefault();
        void handlePasteAsPlaintext();
      } else if (isNextTab) {
        event.preventDefault();
        nextTab();
        incrementEditorKey();
      } else if (isPrevTab) {
        event.preventDefault();
        prevTab();
        incrementEditorKey();
      } else if (isNewTabShortcut) {
        event.preventDefault();
        newTab();
        incrementEditorKey();
      } else if (isCloseTabShortcut) {
        event.preventDefault();
        if (tabs.length === 1 && !tabs[0].file && !tabs[0].isDirty) {
          window.close();
          return;
        }
        closeTab(activeTabId);
      } else if (isTabJump) {
        event.preventDefault();
        const idx = parseInt(event.key, 10) - 1;
        switchToIndex(idx);
        incrementEditorKey();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [saveFile, handlePasteAsPlaintext, handleToggleCompactMode, handleOpenRubyDialog, handleToggleTcy, isElectron, nextTab, prevTab, newTab, closeTab, tabs, activeTabId, switchToIndex, setShowSettingsModal, incrementEditorKey]);

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
    return (
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
          fontScale={fontScale}
          onFontScaleChange={handleFontScaleChange}
          lineHeight={lineHeight}
          onLineHeightChange={handleLineHeightChange}
          paragraphSpacing={paragraphSpacing}
          onParagraphSpacingChange={handleParagraphSpacingChange}
          textIndent={textIndent}
          onTextIndentChange={handleTextIndentChange}
          fontFamily={fontFamily}
          onFontFamilyChange={handleFontFamilyChange}
          charsPerLine={charsPerLine}
          onCharsPerLineChange={handleCharsPerLineChange}
          autoCharsPerLine={autoCharsPerLine}
          onAutoCharsPerLineChange={handleAutoCharsPerLineChange}
          showParagraphNumbers={showParagraphNumbers}
          onShowParagraphNumbersChange={handleShowParagraphNumbersChange}
          autoSave={autoSave}
          onAutoSaveChange={handleAutoSaveChange}
          verticalScrollBehavior={verticalScrollBehavior}
          onVerticalScrollBehaviorChange={handleVerticalScrollBehaviorChange}
          scrollSensitivity={scrollSensitivity}
          onScrollSensitivityChange={handleScrollSensitivityChange}
          posHighlightEnabled={posHighlightEnabled}
          onPosHighlightEnabledChange={handlePosHighlightEnabledChange}
          posHighlightColors={posHighlightColors}
          onPosHighlightColorsChange={handlePosHighlightColorsChange}
          lintingEnabled={lintingEnabled}
          onLintingEnabledChange={handleLintingEnabledChange}
          lintingRuleConfigs={lintingRuleConfigs}
          onLintingRuleConfigChange={handleLintingRuleConfigChange}
          onLintingRuleConfigsBatchChange={handleLintingRuleConfigsBatchChange}
          llmEnabled={llmEnabled}
          onLlmEnabledChange={handleLlmEnabledChange}
          llmModelId={llmModelId}
          onLlmModelIdChange={handleLlmModelIdChange}
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
                const renderPanel = (view: ActivityBarView) => {
                  switch (view) {
                    case "files":
                      return (
                        <aside className="h-full bg-background border-r border-border flex flex-col">
                          <div className="p-4 flex-1 overflow-y-auto">
                            <FilesPanel
                              projectName={isProjectMode(editorMode) ? editorMode.name : undefined}
                              onFileClick={(vfsPath) => {
                                void openProjectFile(vfsPath, { preview: true });
                                incrementEditorKey();
                              }}
                              onFileDoubleClick={(vfsPath) => {
                                void openProjectFile(vfsPath, { preview: false });
                                incrementEditorKey();
                              }}
                              onFileMiddleClick={(vfsPath) => {
                                void openProjectFile(vfsPath, { preview: false });
                                incrementEditorKey();
                              }}
                            />
                          </div>
                        </aside>
                      );
                    case "explorer":
                      return (
                        <Explorer
                          compactMode={compactMode}
                          content={content}
                          onChapterClick={handleChapterClick}
                          onInsertText={handleInsertText}
                          fontScale={fontScale}
                          onFontScaleChange={handleFontScaleChange}
                          lineHeight={lineHeight}
                          onLineHeightChange={handleLineHeightChange}
                          paragraphSpacing={paragraphSpacing}
                          onParagraphSpacingChange={handleParagraphSpacingChange}
                          textIndent={textIndent}
                          onTextIndentChange={handleTextIndentChange}
                          fontFamily={fontFamily}
                          onFontFamilyChange={handleFontFamilyChange}
                          charsPerLine={charsPerLine}
                          onCharsPerLineChange={handleCharsPerLineChange}
                          autoCharsPerLine={autoCharsPerLine}
                          onAutoCharsPerLineChange={handleAutoCharsPerLineChange}
                          showParagraphNumbers={showParagraphNumbers}
                          onShowParagraphNumbersChange={handleShowParagraphNumbersChange}
                        />
                      );
                    case "search":
                      return (
                        <SearchResults
                          editorView={editorViewInstance}
                          matches={searchResults?.matches}
                          searchTerm={searchResults?.searchTerm}
                          onClose={handleCloseSearchResults}
                        />
                      );
                    case "outline":
                      return (
                        <Outline
                          content={content}
                          onHeadingClick={handleChapterClick}
                        />
                      );
                    case "characters":
                      return <Characters content={content} />;
                    case "dictionary":
                      return <Dictionary content={content} initialSearchTerm={dictionarySearchTrigger.term} searchTriggerId={dictionarySearchTrigger.id} />;
                    case "wordfreq":
                      return <WordFrequency content={content} filePath={currentFile?.path ?? undefined} onWordSearch={(word) => {
                        setSearchInitialTerm(word);
                        setSearchOpenTrigger(prev => prev + 1);
                      }} />;
                    default:
                      return null;
                  }
                };

                const topPanel = topView !== "none" ? renderPanel(topView) : null;
                const bottomPanel = bottomView !== "none" ? renderPanel(bottomView) : null;

                if (topPanel && bottomPanel) {
                  return <SidebarSplitter top={topPanel} bottom={bottomPanel} />;
                }
                return topPanel || bottomPanel;
              })()}
          </ResizablePanel>
        )}

        <main className="flex-1 flex flex-col overflow-hidden min-h-0 relative bg-background">
          <TabBar
            compactMode={compactMode}
            tabs={tabs}
            activeTabId={activeTabId}
            onSwitchTab={(tabId) => {
              switchTab(tabId);
              incrementEditorKey();
            }}
            onCloseTab={closeTab}
            onNewTab={(fileType) => {
              newTab(fileType);
              incrementEditorKey();
            }}
            onPinTab={pinTab}
          />
          <div ref={editorDomRef} className="flex-1 min-h-0">
            {editorDiff ? (
              <EditorDiffView
                snapshotContent={editorDiff.snapshotContent}
                currentContent={editorDiff.currentContent}
                snapshotLabel={editorDiff.label}
                onClose={() => setEditorDiff(null)}
                fontScale={fontScale}
                lineHeight={lineHeight}
                fontFamily={fontFamily}
                charsPerLine={charsPerLine}
                textIndent={textIndent}
                paragraphSpacing={paragraphSpacing}
              />
            ) : (
              <NovelEditor
                key={`tab-${activeTabId}-${editorKey}`}
                initialContent={content}
                onChange={handleChange}
                onInsertText={handleInsertText}
                onSelectionChange={setSelectedCharCount}
                fontScale={fontScale}
                lineHeight={lineHeight}
                paragraphSpacing={paragraphSpacing}
                textIndent={textIndent}
                fontFamily={fontFamily}
                charsPerLine={charsPerLine}
                onCharsPerLineChange={autoCharsPerLine ? handleCharsPerLineChange : undefined}
                searchOpenTrigger={searchOpenTrigger}
                searchInitialTerm={searchInitialTerm}
                showParagraphNumbers={showParagraphNumbers}
                onEditorViewReady={setEditorViewInstance}
                programmaticScrollRef={programmaticScrollRef}
                onShowAllSearchResults={handleShowAllSearchResults}
                posHighlightEnabled={posHighlightEnabled}
                posHighlightColors={posHighlightColors}
                lintingEnabled={lintingEnabled}
                lintingRuleRunner={ruleRunner}
                onLintIssuesUpdated={handleLintIssuesUpdated}
                verticalScrollBehavior={verticalScrollBehavior}
                scrollSensitivity={scrollSensitivity}
                onOpenRubyDialog={handleOpenRubyDialog}
                onToggleTcy={handleToggleTcy}
                onOpenDictionary={handleOpenDictionary}
                onShowLintHint={handleShowLintHint}
                onFontScaleChange={handleFontScaleChange}
                onLineHeightChange={handleLineHeightChange}
                onParagraphSpacingChange={handleParagraphSpacingChange}
                mdiExtensionsEnabled={mdiExtensionsEnabled}
                gfmEnabled={gfmEnabled}
              />
            )}
          </div>

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
            posHighlightEnabled={posHighlightEnabled}
            onPosHighlightEnabledChange={handlePosHighlightEnabledChange}
            posHighlightColors={posHighlightColors}
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
            onRefreshLinting={refreshLinting}
            isLinting={isLinting}
            activeLintIssueIndex={activeLintIssueIndex}
            onOpenLintingSettings={handleOpenLintingSettings}
            onApplyLintPreset={handleApplyLintPreset}
            activeLintPresetId={activeLintPresetId}
            switchToCorrectionsTrigger={switchToCorrectionsTrigger}
          />
        </ResizablePanel>
      </div>
    </div>
  );
}
