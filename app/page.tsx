"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTheme } from "@/contexts/ThemeContext";
import Explorer, { FilesPanel } from "@/components/Explorer";
import Inspector from "@/components/Inspector";
import NovelEditor from "@/components/Editor";
import EditorDiffView from "@/components/EditorDiffView";
import ResizablePanel from "@/components/ResizablePanel";
import TitleUpdater from "@/components/TitleUpdater";
import ActivityBar, { type ActivityBarView, isBottomView } from "@/components/ActivityBar";
import SidebarSplitter from "@/components/SidebarSplitter";
import SearchResults from "@/components/SearchResults";
import UnsavedWarningDialog from "@/components/UnsavedWarningDialog";
import UpgradeToProjectBanner from "@/components/UpgradeToProjectBanner";
import { getProjectUpgradeService } from "@/lib/project-upgrade";
import WordFrequency from "@/components/WordFrequency";
import Characters from "@/components/Characters";
import Dictionary from "@/components/Dictionary";
import Outline from "@/components/Outline";
import WelcomeScreen from "@/components/WelcomeScreen";
import CreateProjectWizard from "@/components/CreateProjectWizard";
import PermissionPrompt from "@/components/PermissionPrompt";
import SettingsModal from "@/components/SettingsModal";
import RubyDialog from "@/components/RubyDialog";
import { useTabManager } from "@/lib/use-tab-manager";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";
import TabBar from "@/components/TabBar";
import { useElectronMenuHandlers } from "@/lib/use-electron-menu-handlers";
import { useWebMenuHandlers } from "@/lib/use-web-menu-handlers";
import { useGlobalShortcuts } from "@/lib/use-global-shortcuts";
import { isElectronRenderer } from "@/lib/runtime-env";
import ElectronStorageProvider from "@/lib/electron-storage";
import WebMenuBar from "@/components/WebMenuBar";
import { fetchAppState, persistAppState } from "@/lib/app-state-manager";
import { useEditorMode } from "@/contexts/EditorModeContext";
import { getProjectService } from "@/lib/project-service";
import { getProjectManager } from "@/lib/project-manager";
import { getAvailableFeatures } from "@/lib/feature-detection";
import { getVFS } from "@/lib/vfs";
import { isProjectMode, isStandaloneMode } from "@/lib/project-types";
import {
  countSentences,
  analyzeCharacterTypes,
  calculateCharacterUsageRates,
  calculateReadabilityScore,
} from "@/lib/utils";

import type { ProjectMode, SupportedFileExtension } from "@/lib/project-types";

/** Recent project entry for WelcomeScreen display */
interface RecentProjectEntry {
  projectId: string;
  name: string;
  lastAccessedAt: number;
  rootDirName?: string;
}

/** Permission prompt state for re-opening a stored project */
interface PermissionPromptState {
  projectName: string;
  handle: FileSystemDirectoryHandle;
  projectId: string;
}

function chars(s: string) {
  return s.replace(/\s/g, "").length;
}

function words(s: string) {
  return s.split(/\s+/).filter(Boolean).length;
}

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

  // Welcome screen / wizard / permission prompt state
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [permissionPromptData, setPermissionPromptData] = useState<PermissionPromptState | null>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProjectEntry[]>([]);
  // Auto-restore state: suppress WelcomeScreen flash during restore attempt
  const [isRestoring, setIsRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const isAutoRestoringRef = useRef(false);
  const [autoSave, setAutoSave] = useState(true); // Auto-save on by default

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
  const [editorKey, setEditorKey] = useState(0);
  const [searchOpenTrigger, setSearchOpenTrigger] = useState(0);
  const [searchInitialTerm, setSearchInitialTerm] = useState<string | undefined>(undefined);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [saveToastExiting, setSaveToastExiting] = useState(false);
   const [selectedCharCount, setSelectedCharCount] = useState(0);
   // (fileSessionRef removed: tab switching via activeTabId handles editor remount)
  const prevLastSavedTimeRef = useRef<number | null>(null);
  const hasAutoRecoveredRef = useRef(false);

  // UpgradeBanner trigger state
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(false);
  const [upgradeBannerDismissed, setUpgradeBannerDismissed] = useState(false);
  const standaloneSaveCountRef = useRef(0);

  const isElectron = typeof window !== "undefined" && isElectronRenderer();

  // 未保存警告の Hook (project mode transitions only; tabs handle per-tab dirty checks)
  const anyDirty = tabs.some((t) => t.isDirty);
  const unsavedWarning = useUnsavedWarning(
    anyDirty,
    saveFile,
    currentFile?.name || null
  );

   // 自動復元（ページ再読み込み）時はエディタを再マウント
   useEffect(() => {
    if (wasAutoRecovered && !hasAutoRecoveredRef.current) {
      hasAutoRecoveredRef.current = true;
      setEditorKey(prev => prev + 1);
    }
  }, [wasAutoRecovered]);

   // With tabs, open/new don't need unsaved warnings (they create new tabs)
   const openFile = useCallback(async () => {
     await tabOpenFile();
     setEditorKey(prev => prev + 1);
   }, [tabOpenFile]);

  const newFile = useCallback((fileType?: SupportedFileExtension) => {
    tabNewFile(fileType);
    setEditorKey(prev => prev + 1);
  }, [tabNewFile]);

  // Electron メニューの「新規」と「開く」をバインド（安全チェック付き）
  useElectronMenuHandlers(newFile, openFile);

  // System file open: tab manager handles loading; we just update editor key
  useEffect(() => {
    if (!onSystemFileOpen) return;
    onSystemFileOpen(() => {
      setEditorKey(prev => prev + 1);
    });
  }, [onSystemFileOpen]);

  // エディタ表示設定
  const [fontScale, setFontScale] = useState(100); // 100% = Standard size
  const [lineHeight, setLineHeight] = useState(1.8);
  const [paragraphSpacing, setParagraphSpacing] = useState(0.5); // 0.5em = Standard spacing
  const [textIndent, setTextIndent] = useState(1);
  const [fontFamily, setFontFamily] = useState('Noto Serif JP');
  const [charsPerLine, setCharsPerLine] = useState(40); // max 40
  const [autoCharsPerLine, setAutoCharsPerLine] = useState(true); // auto mode on by default
  const [showParagraphNumbers, setShowParagraphNumbers] = useState(true);
  const [posHighlightEnabled, setPosHighlightEnabled] = useState(false); // POS coloring (default: disabled)
  const [posHighlightColors, setPosHighlightColors] = useState<Record<string, string>>({}); // Per-POS color settings
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [verticalScrollBehavior, setVerticalScrollBehavior] = useState<"auto" | "mouse" | "trackpad">("auto");
  const [scrollSensitivity, setScrollSensitivity] = useState(1.0);
  const [compactMode, setCompactMode] = useState(false);
  const [showRubyDialog, setShowRubyDialog] = useState(false);
  const [rubySelectedText, setRubySelectedText] = useState("");
  const rubySelectionRef = useRef<{ from: number; to: number } | null>(null);
  const [editorDiff, setEditorDiff] = useState<{ snapshotContent: string; currentContent: string; label: string } | null>(null);
  const [topView, setTopView] = useState<ActivityBarView>("explorer");
  const [bottomView, setBottomView] = useState<ActivityBarView>("none");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editorViewInstance, setEditorViewInstance] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [searchResults, setSearchResults] = useState<{matches: any[], searchTerm: string} | null>(null);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);

  // Ref to forward callbacks (defined later) to useWebMenuHandlers
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

   // lastSavedTime が更新されたら「保存完了」トーストを表示
   // ただし、自動保存時（負の値）は表示しない
   useEffect(() => {
     if (lastSavedTime && prevLastSavedTimeRef.current !== lastSavedTime) {
       // 初回読み込みでは表示しない
       if (prevLastSavedTimeRef.current !== null) {
        // Only show toast for manual saves (positive timestamp)
        if (lastSavedTime > 0) {
          setShowSaveToast(true);
          setSaveToastExiting(false);

          const hideTimer = setTimeout(() => {
            setSaveToastExiting(true);
            setTimeout(() => {
              setShowSaveToast(false);
              setSaveToastExiting(false);
            }, 150); // Match animation duration
          }, 1200);

          prevLastSavedTimeRef.current = lastSavedTime;
          return () => clearTimeout(hideTimer);
        }
      }
      prevLastSavedTimeRef.current = lastSavedTime;
    }
  }, [lastSavedTime]);

  // Track save count to trigger UpgradeBanner in standalone mode
  useEffect(() => {
    if (!lastSavedTime || prevLastSavedTimeRef.current === null) return;
    if (!isStandaloneMode(editorMode) || upgradeBannerDismissed) return;

    standaloneSaveCountRef.current += 1;
    // Show banner on 1st save or 3rd save
    if (standaloneSaveCountRef.current >= 1) {
      setShowUpgradeBanner(true);
    }
  }, [lastSavedTime, editorMode, upgradeBannerDismissed]);

  // Track character count to trigger UpgradeBanner at 5,000 characters
  useEffect(() => {
    if (!isStandaloneMode(editorMode) || upgradeBannerDismissed) return;
    if (chars(content) >= 5000) {
      setShowUpgradeBanner(true);
    }
  }, [content, editorMode, upgradeBannerDismissed]);

  // Reset save count tracking when editor mode changes
  useEffect(() => {
    standaloneSaveCountRef.current = 0;
  }, [editorMode]);

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
        // Force editor rebuild to apply restored settings (e.g. custom font)
        setEditorKey(prev => prev + 1);
      } catch (error) {
        console.error("設定の読み込みに失敗しました:", error);
      }
    };

    void loadSettings();

    return () => {
      mounted = false;
    };
  }, []);

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

  // ID of the most recent project to auto-restore
  const [autoRestoreProjectId, setAutoRestoreProjectId] = useState<string | null>(null);

  // Load recent projects on mount (for WelcomeScreen)
  useEffect(() => {
    let mounted = true;

    const loadRecentProjects = async () => {
      try {
        if (isElectron) {
          // Electron: load from SQLite via storage provider
          const storage = new ElectronStorageProvider();
          await storage.initialize();
          const projects = await storage.getRecentProjects();
          if (!mounted) return;

          const entries: RecentProjectEntry[] = projects.map((p) => ({
            projectId: p.id,
            name: p.name,
            lastAccessedAt: Date.now(),
            rootDirName: p.rootPath.split("/").pop(),
          }));
          setRecentProjects(entries);

          // Mark the most recent project for auto-restore (sorted by updated_at DESC)
          if (!skipAutoRestore && projects.length > 0) {
            setAutoRestoreProjectId(projects[0].id);
          } else {
            setIsRestoring(false);
          }
        } else {
          // Web: attempt auto-restore of most recent project handle from IndexedDB
          const projectManager = getProjectManager();
          const handles = await projectManager.listProjectHandles();
          if (!mounted) return;

          const entries: RecentProjectEntry[] = handles.map((h) => ({
            projectId: h.projectId,
            name: h.name ?? h.rootDirName ?? h.projectId,
            lastAccessedAt: h.lastAccessedAt,
            rootDirName: h.rootDirName,
          }));
          setRecentProjects(entries);

          // Auto-restore the most recently accessed project
          if (!skipAutoRestore && handles.length > 0) {
            setAutoRestoreProjectId(handles[0].projectId);
          } else {
            setIsRestoring(false);
          }
        }
      } catch (error) {
        console.error("最近のプロジェクト一覧の読み込みに失敗しました:", error);
        setIsRestoring(false);
      }
    };

    void loadRecentProjects();

    return () => {
      mounted = false;
    };
  }, [isElectron, skipAutoRestore]);

  /** Delete a recent project from the list */
  const handleDeleteRecentProject = useCallback(async (projectId: string) => {
    try {
      if (isElectron) {
        const storage = new ElectronStorageProvider();
        await storage.initialize();
        await storage.removeRecentProject(projectId);

        const updatedProjects = await storage.getRecentProjects();
        const entries: RecentProjectEntry[] = updatedProjects.map((p) => ({
          projectId: p.id,
          name: p.name,
          lastAccessedAt: Date.now(),
          rootDirName: p.rootPath.split("/").pop(),
        }));
        setRecentProjects(entries);
      } else {
        const projectManager = getProjectManager();
        await projectManager.removeProjectHandle(projectId);

        const handles = await projectManager.listProjectHandles();
        const entries: RecentProjectEntry[] = handles.map((h) => ({
          projectId: h.projectId,
          name: h.name ?? h.rootDirName ?? h.projectId,
          lastAccessedAt: h.lastAccessedAt,
          rootDirName: h.rootDirName,
        }));
        setRecentProjects(entries);
      }
    } catch (error) {
      console.error("最近のプロジェクトの削除に失敗しました:", error);
    }
  }, [isElectron]);

  const handleFontScaleChange = useCallback((value: number) => {
    setFontScale(value);
    setEditorKey(prev => prev + 1);
    void persistAppState({ fontScale: value }).catch((error) => {
      console.error("フォントサイズの保存に失敗しました:", error);
    });
  }, []);

  const handleLineHeightChange = useCallback((value: number) => {
    setLineHeight(value);
    setEditorKey(prev => prev + 1);
    void persistAppState({ lineHeight: value }).catch((error) => {
      console.error("行間の保存に失敗しました:", error);
    });
  }, []);

  const handleParagraphSpacingChange = useCallback((value: number) => {
    setParagraphSpacing(value);
    setEditorKey(prev => prev + 1);
    void persistAppState({ paragraphSpacing: value }).catch((error) => {
      console.error("段落間隔の保存に失敗しました:", error);
    });
  }, []);

  const handleTextIndentChange = useCallback((value: number) => {
    setTextIndent(value);
    setEditorKey(prev => prev + 1);
    void persistAppState({ textIndent: value }).catch((error) => {
      console.error("字下げの保存に失敗しました:", error);
    });
  }, []);

  const handleFontFamilyChange = useCallback((value: string) => {
    setFontFamily(value);
    setEditorKey(prev => prev + 1);
    void persistAppState({ fontFamily: value }).catch((error) => {
      console.error("フォントの保存に失敗しました:", error);
    });
  }, []);

  const handleCharsPerLineChange = useCallback((value: number) => {
    const clamped = Math.max(1, value);
    setCharsPerLine(clamped);
    setEditorKey(prev => prev + 1);
    void persistAppState({ charsPerLine: clamped }).catch((error) => {
      console.error("1行あたり文字数の保存に失敗しました:", error);
    });
  }, []);

  const handleAutoCharsPerLineChange = useCallback((value?: boolean) => {
    setAutoCharsPerLine(prev => {
      const next = value !== undefined ? value : !prev;
      void persistAppState({ autoCharsPerLine: next }).catch((error) => {
        console.error("自動文字数の保存に失敗しました:", error);
      });
      return next;
    });
  }, []);

  const handleShowParagraphNumbersChange = useCallback((value: boolean) => {
    setShowParagraphNumbers(value);
    void persistAppState({ showParagraphNumbers: value }).catch((error) => {
      console.error("段落番号の設定保存に失敗しました:", error);
    });
  }, []);

  const handleAutoSaveChange = useCallback((value: boolean) => {
    setAutoSave(value);
    void persistAppState({ autoSave: value }).catch((error) => {
      console.error("自動保存の設定保存に失敗しました:", error);
    });
  }, []);

  const handlePosHighlightEnabledChange = useCallback((value: boolean) => {
    setPosHighlightEnabled(value);
    void persistAppState({ posHighlightEnabled: value }).catch((error) => {
      console.error("品詞着色の設定保存に失敗しました:", error);
    });
  }, []);

  const handlePosHighlightColorsChange = useCallback((value: Record<string, string>) => {
    setPosHighlightColors(value);
    void persistAppState({ posHighlightColors: value }).catch((error) => {
      console.error("品詞色設定の保存に失敗しました:", error);
    });
  }, []);

  const handleVerticalScrollBehaviorChange = useCallback((value: "auto" | "mouse" | "trackpad") => {
    setVerticalScrollBehavior(value);
    void persistAppState({ verticalScrollBehavior: value }).catch((error) => {
      console.error("縦書きスクロール設定の保存に失敗しました:", error);
    });
  }, []);

  const handleScrollSensitivityChange = useCallback((value: number) => {
    setScrollSensitivity(value);
    void persistAppState({ scrollSensitivity: value }).catch((error) => {
      console.error("スクロール感度の保存に失敗しました:", error);
    });
  }, []);

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

  /** Wrap selected text with tcy (縦中横) syntax: ^text^ */
  const handleToggleTcy = useCallback(() => {
    if (!editorViewInstance) return;
    const { state, dispatch } = editorViewInstance;
    const { from, to } = state.selection;
    if (from === to) return;
    const text = state.doc.textBetween(from, to);
    if (!text.trim()) return;
    // Toggle: if already wrapped in ^...^, unwrap
    const tr = state.tr.insertText(`^${text}^`, from, to);
    dispatch(tr);
  }, [editorViewInstance]);

  /** Open the dictionary panel in the sidebar with optional search term */
  const [dictionarySearchTrigger, setDictionarySearchTrigger] = useState<{ term: string; id: number }>({ term: "", id: 0 });
  const handleOpenDictionary = useCallback((searchTerm?: string) => {
    if (searchTerm) {
      setDictionarySearchTrigger(prev => ({ term: searchTerm, id: prev.id + 1 }));
    }
    setTopView("dictionary");
  }, []);

  const handleToggleCompactMode = useCallback(() => {
    setCompactMode(prev => {
      const next = !prev;
      void persistAppState({ compactMode: next }).catch((error) => {
        console.error("コンパクトモードの保存に失敗しました:", error);
      });
      return next;
    });
  }, []);

    // 復元通知は5秒後に fadeout アニメーション開始、アニメーション完了後に削除
    useEffect(() => {
     if (wasAutoRecovered && !dismissedRecovery && !recoveryExiting) {
       // 5秒後にアニメーション開始
       const fadeoutTimer = setTimeout(() => {
         setRecoveryExiting(true);
       }, 5000);

       return () => clearTimeout(fadeoutTimer);
     }

     // アニメーション中の場合、アニメーション完了後に実際に削除
     if (recoveryExiting) {
       const dismissTimer = setTimeout(() => {
         setDismissedRecovery(true);
       }, 300); // Match animation duration

       return () => clearTimeout(dismissTimer);
     }
   }, [wasAutoRecovered, dismissedRecovery, recoveryExiting]);

    // プレーンテキストとして貼り付け
    const handlePasteAsPlaintext = useCallback(async () => {
      try {
        let text: string | null = null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (isElectron && typeof window !== "undefined" && (window as any).electronAPI) {
           // Electron: use standard clipboard API if available
           if (navigator.clipboard && navigator.clipboard.readText) {
             text = await navigator.clipboard.readText();
           }
         } else {
           // Web: get plaintext from clipboard API
           if (navigator.clipboard && navigator.clipboard.readText) {
             text = await navigator.clipboard.readText();
           }
         }

        if (text) {
          const currentContent = contentRef.current;
          const newContent = currentContent ? `${currentContent}\n\n${text}` : text;
          setContent(newContent);
          setEditorKey(prev => prev + 1);
        }
       } catch (error) {
         console.error("プレーンテキストとして貼り付けできませんでした:", error);
       }
     }, [isElectron, setContent]);

    // メニューの「プレーンテキストで貼り付け」を受け取る（Electronのみ）
    useEffect(() => {
     if (!isElectron || typeof window === "undefined") return;

     // eslint-disable-next-line @typescript-eslint/no-explicit-any
     const unsubscribe = (window as any).electronAPI?.onPasteAsPlaintext?.(() => {
       void handlePasteAsPlaintext();
     });

     return () => {
       unsubscribe?.();
     };
   }, [isElectron, handlePasteAsPlaintext]);

    // メニューの「コンパクトモード」トグルを受け取る（Electronのみ）
    useEffect(() => {
      if (!isElectron || typeof window === "undefined") return;
      const cleanup = window.electronAPI?.onToggleCompactMode?.(() => {
        handleToggleCompactMode();
      });
      return () => { cleanup?.(); };
    }, [isElectron, handleToggleCompactMode]);

    // メニューの「書式」設定変更を受け取る（Electronのみ）
    useEffect(() => {
      if (!isElectron || typeof window === "undefined") return;
      const cleanup = window.electronAPI?.onFormatChange?.((setting: string, action: string) => {
        switch (setting) {
          case "lineHeight": {
            setLineHeight(prev => {
              const next = action === "increase"
                ? Math.min(3.0, +(prev + 0.1).toFixed(1))
                : Math.max(1.0, +(prev - 0.1).toFixed(1));
              setEditorKey(k => k + 1);
              void persistAppState({ lineHeight: next });
              return next;
            });
            break;
          }
          case "paragraphSpacing": {
            setParagraphSpacing(prev => {
              const next = action === "increase"
                ? Math.min(3.0, +(prev + 0.1).toFixed(1))
                : Math.max(0, +(prev - 0.1).toFixed(1));
              setEditorKey(k => k + 1);
              void persistAppState({ paragraphSpacing: next });
              return next;
            });
            break;
          }
          case "textIndent": {
            setTextIndent(prev => {
              const next = action === "none" ? 0
                : action === "increase" ? Math.min(5, prev + 1)
                : Math.max(0, prev - 1);
              setEditorKey(k => k + 1);
              void persistAppState({ textIndent: next });
              return next;
            });
            break;
          }
          case "charsPerLine": {
            if (action === "auto") {
              handleAutoCharsPerLineChange();
              break;
            }
            // Manual adjustments only when auto is off
            setCharsPerLine(prev => {
              const next = action === "increase" ? prev + 5
                : Math.max(1, prev - 5);
              setEditorKey(k => k + 1);
              void persistAppState({ charsPerLine: next });
              return next;
            });
            break;
          }
          case "paragraphNumbers": {
            setShowParagraphNumbers(prev => {
              const next = !prev;
              void persistAppState({ showParagraphNumbers: next });
              return next;
            });
            break;
          }
        }
      });
      return () => { cleanup?.(); };
    }, [isElectron]);

    // メニューの「ダークモード」切り替えを受け取る（Electronのみ）
    useEffect(() => {
      if (!isElectron || typeof window === "undefined") return;
      const cleanup = window.electronAPI?.onThemeChange?.((mode) => {
        setThemeMode(mode);
      });
      return () => { cleanup?.(); };
    }, [isElectron, setThemeMode]);

    // メニューのチェック状態を同期する（Electronのみ）
    useEffect(() => {
      if (!isElectron || typeof window === "undefined") return;
      void window.electronAPI?.syncMenuUiState?.({
        compactMode,
        showParagraphNumbers,
        themeMode,
        autoCharsPerLine,
      });
    }, [isElectron, compactMode, showParagraphNumbers, themeMode, autoCharsPerLine]);

    // メニューの「プロジェクトフォルダを開く」を受け取る（Electronのみ）
    useEffect(() => {
      if (!isElectron || typeof window === "undefined") return;

      const cleanup = window.electronAPI?.onMenuShowInFileManager?.(() => {
        const vfs = getVFS();
        const rootPath = vfs.getRootPath?.();
        if (rootPath) {
          void window.electronAPI?.showInFileManager?.(rootPath);
        }
      });

      return () => {
        cleanup?.();
      };
    }, [isElectron]);


  contentRef.current = content;

  const handleChange = (markdown: string) => {
    contentRef.current = markdown;
    setContent(markdown);
  };

   const handleInsertText = (text: string) => {
     const currentContent = contentRef.current;
     const newContent = currentContent ? `${currentContent}\n\n${text}` : text;
     // Heading anchors are managed by the editor, no extra processing needed here
     setContent(newContent);
     // Re-mount the editor to ensure the new content is reflected
     setEditorKey(prev => prev + 1);
   };

   const handleChapterClick = (anchorId: string) => {
    if (!anchorId) return;

    const target = document.getElementById(anchorId) as HTMLElement | null;
    if (!target) return;

    // Scroll to target
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Focus for visual guidance
    target.focus();
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleShowAllSearchResults = (matches: any[], searchTerm: string) => {
    setSearchResults({ matches, searchTerm });
    // "search" belongs to top group
    setTopView("search");
  };

  const handleCloseSearchResults = () => {
    setSearchResults(null);
    setTopView("explorer");
  };

   const wordCount = useMemo(() => words(content), [content]);
   const charCount = useMemo(() => chars(content), [content]);

   // 段落数を計算（空行で区切る）
   const paragraphCount = useMemo(
     () => content ? content.split(/\n\n+/).filter(p => p.trim().length > 0).length : 0,
     [content],
   );

   // 日本語テキストの詳細統計を算出
   const sentenceCount = useMemo(() => countSentences(content), [content]);
   const charTypeAnalysis = useMemo(() => analyzeCharacterTypes(content), [content]);
   const charUsageRates = useMemo(() => calculateCharacterUsageRates(charTypeAnalysis), [charTypeAnalysis]);
   const readabilityAnalysis = useMemo(() => calculateReadabilityScore(content), [content]);

   // ファイル名は currentFile.name のみを使用（isDirtyに基づく*の追加はInspectorコンポーネント側で処理）
   const fileName = currentFile?.name ?? "新規ファイル";

   // キーボードショートカット: Cmd/Ctrl+S=保存、Cmd/Ctrl+F=検索
   useEffect(() => {
     const handleKeyDown = (event: KeyboardEvent) => {
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
       const nav = navigator as any;
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

       // Shift+Cmd+T (macOS) / Shift+Ctrl+T (Windows/Linux): Tcy (縦中横)
       const isTcyShortcut = isMac
         ? event.shiftKey && event.metaKey && event.key === "t"
         : event.shiftKey && event.ctrlKey && event.key === "t";

       // Tab shortcuts (Web only; Electron handles Cmd+W/T via menu)
       // Ctrl+Tab: Next tab
       const isNextTab = event.ctrlKey && !event.shiftKey && event.key === "Tab";
       // Ctrl+Shift+Tab: Previous tab
       const isPrevTab = event.ctrlKey && event.shiftKey && event.key === "Tab";
       // Cmd+T (macOS) / Ctrl+T (Windows/Linux): New tab (Web only, Electron menu handles it)
       const isNewTabShortcut = !isElectron && (isMac
         ? event.metaKey && !event.shiftKey && event.key === "t"
         : event.ctrlKey && !event.shiftKey && event.key === "t");
       // Cmd+W (macOS) / Ctrl+W (Windows/Linux): Close tab (Web only, Electron menu handles it)
       const isCloseTabShortcut = !isElectron && (isMac
         ? event.metaKey && event.key === "w"
         : event.ctrlKey && event.key === "w");
       // Cmd+1~9 (macOS) / Ctrl+1~9 (Windows/Linux): Jump to tab N
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
         setEditorKey(prev => prev + 1);
       } else if (isPrevTab) {
         event.preventDefault();
         prevTab();
         setEditorKey(prev => prev + 1);
       } else if (isNewTabShortcut) {
         event.preventDefault();
         newTab();
         setEditorKey(prev => prev + 1);
       } else if (isCloseTabShortcut) {
         event.preventDefault();
         // Single empty clean tab → close window
         if (tabs.length === 1 && !tabs[0].file && !tabs[0].isDirty) {
           window.close();
           return;
         }
         closeTab(activeTabId);
       } else if (isTabJump) {
         event.preventDefault();
         const idx = parseInt(event.key, 10) - 1; // Cmd+1 = index 0
         switchToIndex(idx);
         setEditorKey(prev => prev + 1);
       }
     };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [saveFile, handlePasteAsPlaintext, handleToggleCompactMode, handleOpenRubyDialog, handleToggleTcy, isElectron, nextTab, prevTab, newTab, closeTab, tabs, activeTabId, switchToIndex]);

  // --- WelcomeScreen callbacks ---

  /** Load a project's main file content into the editor */
  const loadProjectContent = useCallback(async (project: ProjectMode) => {
    try {
      const projectService = getProjectService();
      const mainContent = await projectService.readProjectContent(project);
      const mainFileName = project.metadata.mainFile;

      if (isElectron && project.rootPath) {
        tabLoadSystemFile(
          `${project.rootPath}/${mainFileName}`,
          mainContent
        );
      } else {
        tabLoadSystemFile(mainFileName, mainContent);
      }

      setEditorKey((prev) => prev + 1);
    } catch (error) {
      console.error(
        "プロジェクトのメインファイルの読み込みに失敗しました:",
        error
      );
    }
  }, [isElectron, tabLoadSystemFile]);

  /** Show the CreateProjectWizard dialog */
  const handleCreateProject = useCallback(() => {
    setShowCreateWizard(true);
  }, []);

  /** Open an existing project from directory picker */
  const handleOpenProject = useCallback(async () => {
    try {
      const projectService = getProjectService();
      const project = await projectService.openProject();
      setProjectMode(project);
      await loadProjectContent(project);

      // Save to recent projects in Electron
      if (isElectron && project.rootPath) {
        const storage = new ElectronStorageProvider();
        await storage.initialize();
        await storage.addRecentProject({
          id: project.projectId,
          rootPath: project.rootPath,
          name: project.name,
        });
        // Rebuild native menu to include the new project
        void window.electronAPI?.rebuildMenu?.();
      }
    } catch (error) {
      // User may have cancelled the directory picker
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      if (error instanceof Error && error.message.includes("cancelled")) {
        return;
      }
      console.error("プロジェクトを開くのに失敗しました:", error);
    }
  }, [setProjectMode, isElectron, loadProjectContent]);

  // メニューの「プロジェクトを開く」を受け取る（Electronのみ）
  useEffect(() => {
    if (!isElectron || typeof window === "undefined") return;
    const cleanup = window.electronAPI?.onMenuOpenProject?.(() => {
      void handleOpenProject();
    });
    return () => { cleanup?.(); };
  }, [isElectron, handleOpenProject]);

  /** Open a standalone file via the existing file-open flow */
  const handleOpenStandaloneFile = useCallback(async () => {
    try {
      const projectService = getProjectService();
      const standalone = await projectService.openStandaloneFile();
      setStandaloneMode(standalone);
    } catch (error) {
      // User may have cancelled the file picker
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      console.error("ファイルを開くのに失敗しました:", error);
    }
  }, [setStandaloneMode]);

  /** Read project.json from a restored directory handle and enter project mode */
  const openRestoredProject = useCallback(async (handle: FileSystemDirectoryHandle) => {
    try {
      const illusionsDir = await handle.getDirectoryHandle(".illusions");
      const projectJsonHandle = await illusionsDir.getFileHandle("project.json");
      const projectJsonFile = await projectJsonHandle.getFile();
      const metadataText = await projectJsonFile.text();
      const metadata = JSON.parse(metadataText) as ProjectMode["metadata"];

      // Read workspace.json (defaults if missing)
      let workspaceState: ProjectMode["workspaceState"];
      try {
        const workspaceJsonHandle = await illusionsDir.getFileHandle("workspace.json");
        const workspaceJsonFile = await workspaceJsonHandle.getFile();
        const workspaceText = await workspaceJsonFile.text();
        workspaceState = JSON.parse(workspaceText) as ProjectMode["workspaceState"];
      } catch {
        const { getDefaultWorkspaceState } = await import("@/lib/project-types");
        workspaceState = getDefaultWorkspaceState();
      }

      // Get main file handle
      const mainFileHandle = await handle.getFileHandle(metadata.mainFile);

      const project: ProjectMode = {
        type: "project",
        projectId: metadata.projectId,
        name: metadata.name,
        rootHandle: handle,
        mainFileHandle,
        metadata,
        workspaceState,
      };

      setProjectMode(project);
      await loadProjectContent(project);
    } catch (error) {
      console.error("復元したプロジェクトの読み込みに失敗しました:", error);
    }
  }, [setProjectMode, loadProjectContent]);

  /** Open a recently-stored project by its ID */
  const handleOpenRecentProject = useCallback(async (projectId: string) => {
    try {
      // Electron: restore from SQLite using VFS with stored rootPath
      if (isElectron) {
        const storage = new ElectronStorageProvider();
        await storage.initialize();
        const projects = await storage.getRecentProjects();
        const project = projects.find((p) => p.id === projectId);
        if (!project) {
          if (!isAutoRestoringRef.current) {
            window.alert("このプロジェクトが見つかりませんでした。");
          }
          return;
        }

        try {
          // Set the VFS root to the stored path and open the project
          const vfs = getVFS();
          if ("setRootPath" in vfs) {
            (vfs as { setRootPath: (p: string) => void }).setRootPath(project.rootPath);
          }
          const rootDirHandle = await vfs.getDirectoryHandle("");
          const illusionsDir = await rootDirHandle.getDirectoryHandle(".illusions");
          const projectJsonHandle = await illusionsDir.getFileHandle("project.json");
          const metadataText = await projectJsonHandle.read();
          const metadata = JSON.parse(metadataText) as ProjectMode["metadata"];

          let workspaceState: ProjectMode["workspaceState"];
          try {
            const wsHandle = await illusionsDir.getFileHandle("workspace.json");
            const wsText = await wsHandle.read();
            workspaceState = JSON.parse(wsText) as ProjectMode["workspaceState"];
          } catch {
            const { getDefaultWorkspaceState } = await import("@/lib/project-types");
            workspaceState = getDefaultWorkspaceState();
          }

          const mainFileHandle = await rootDirHandle.getFileHandle(metadata.mainFile);
          // In Electron, VFS handles are IPC-backed wrappers. Cast them for ProjectMode.
          const nativeMainFileHandle = (mainFileHandle as unknown as FileSystemFileHandle);
          const nativeRootHandle = (rootDirHandle as unknown as FileSystemDirectoryHandle);

          const restoredProject: ProjectMode = {
            type: "project",
            projectId: metadata.projectId,
            name: metadata.name,
            rootHandle: nativeRootHandle,
            mainFileHandle: nativeMainFileHandle,
            metadata,
            workspaceState,
            rootPath: project.rootPath,
          };

          setProjectMode(restoredProject);
          await loadProjectContent(restoredProject);
        } catch (error) {
          console.error("プロジェクトの読み込みに失敗しました:", error);
          console.error("プロジェクトパス:", project.rootPath);

          // Check if it's a file not found error
          const isFileNotFound = error && typeof error === 'object' &&
            ('code' in error && (error as { code: string }).code === 'ENOENT');

          const message = isFileNotFound
            ? `プロジェクトが見つかりませんでした。\n\nパス: ${project.rootPath}\n\nフォルダが移動または削除された可能性があります。\n最近のプロジェクト一覧から削除しますか?`
            : "このプロジェクトを開けませんでした。フォルダが移動または削除された可能性があります。";

          // During auto-restore, suppress blocking dialogs (banner will show instead)
          if (!isAutoRestoringRef.current) {
            if (isFileNotFound && window.confirm(message)) {
              const storage = new ElectronStorageProvider();
              await storage.initialize();
              await storage.removeRecentProject(projectId);

              const updatedProjects = await storage.getRecentProjects();
              const entries: RecentProjectEntry[] = updatedProjects.map((p) => ({
                projectId: p.id,
                name: p.name,
                lastAccessedAt: Date.now(),
                rootDirName: p.rootPath.split("/").pop(),
              }));
              setRecentProjects(entries);
            } else if (!isFileNotFound) {
              window.alert(message);
            }
          }
        }
        return;
      }

      // Web: restore from IndexedDB project handles
      const projectManager = getProjectManager();
      const restoreResult = await projectManager.restoreProjectHandle(projectId);

      if (!restoreResult.success || !restoreResult.handle) {
        console.error("保存されたプロジェクトハンドルの復元に失敗しました:", restoreResult.error);
        if (!isAutoRestoringRef.current) {
          window.alert("このプロジェクトを開けませんでした。「プロジェクトを開く」から再度選択してください。");
        }
        return;
      }

      // If permission needs to be re-requested, show the PermissionPrompt
      if (restoreResult.permissionStatus.status === "prompt-required") {
        setPermissionPromptData({
          projectName: projectId,
          handle: restoreResult.handle,
          projectId,
        });
        setShowPermissionPrompt(true);
        return;
      }

      // Permission already granted; open the project by reading its config
      await openRestoredProject(restoreResult.handle);
    } catch (error) {
      console.error("最近のプロジェクトを開くのに失敗しました:", error);
    }
  }, [isElectron, setProjectMode, openRestoredProject, loadProjectContent]);

  /** Open a project from a file system path (when .mdi file is double-clicked in a project directory) */
  const handleOpenAsProject = useCallback(async (projectPath: string, initialFile: string) => {
    try {
      // Set VFS root to project directory
      const vfs = getVFS();
      if ("setRootPath" in vfs) {
        (vfs as { setRootPath: (p: string) => void }).setRootPath(projectPath);
      }

      // Read project metadata
      const rootDirHandle = await vfs.getDirectoryHandle("");
      const illusionsDir = await rootDirHandle.getDirectoryHandle(".illusions");
      const projectJsonHandle = await illusionsDir.getFileHandle("project.json");
      const metadataText = await projectJsonHandle.read();
      const metadata = JSON.parse(metadataText) as ProjectMode["metadata"];

      // Try to load workspace state
      let workspaceState: ProjectMode["workspaceState"];
      try {
        const wsHandle = await illusionsDir.getFileHandle("workspace.json");
        const wsText = await wsHandle.read();
        workspaceState = JSON.parse(wsText) as ProjectMode["workspaceState"];
      } catch {
        const { getDefaultWorkspaceState } = await import("@/lib/project-types");
        workspaceState = getDefaultWorkspaceState();
      }

      // Open the initial file (the one that was double-clicked)
      const initialFileHandle = await rootDirHandle.getFileHandle(initialFile);

      // Cast VFS handles for ProjectMode compatibility
      const nativeMainFileHandle = (initialFileHandle as unknown as FileSystemFileHandle);
      const nativeRootHandle = (rootDirHandle as unknown as FileSystemDirectoryHandle);

      // Create project mode
      const project: ProjectMode = {
        type: "project",
        projectId: metadata.projectId,
        name: metadata.name,
        rootHandle: nativeRootHandle,
        mainFileHandle: nativeMainFileHandle,
        metadata,
        workspaceState,
        rootPath: projectPath,
      };

      setProjectMode(project);
      await loadProjectContent(project);

      // Add to recent projects
      const storage = new ElectronStorageProvider();
      await storage.initialize();
      await storage.addRecentProject({
        id: project.projectId,
        rootPath: projectPath,
        name: project.name,
      });

      // Rebuild menu to show in recent projects
      void window.electronAPI?.rebuildMenu?.();
    } catch (error) {
      console.error("[Open as Project] Failed to open project:", error);
      window.alert("プロジェクトを開けませんでした。.illusionsフォルダが正しく設定されているか確認してください。");
    }
  }, [setProjectMode, loadProjectContent]);

  // Keep ref in sync so useWebMenuHandlers can call it
  openRecentProjectRef.current = (projectId: string) => void handleOpenRecentProject(projectId);
  fontScaleChangeRef.current = handleFontScaleChange;
  toggleCompactModeRef.current = handleToggleCompactMode;

  // メニューの「最近のプロジェクトを開く」を受け取る（Electronのみ）
  // → 指定されたプロジェクトIDで直接プロジェクトを開く
  useEffect(() => {
    if (!isElectron || typeof window === "undefined") return;
    const cleanup = window.electronAPI?.onMenuOpenRecentProject?.((projectId: string) => {
      void handleOpenRecentProject(projectId);
    });
    return () => { cleanup?.(); };
  }, [isElectron, handleOpenRecentProject]);

  // システムから.mdiファイルをプロジェクトとして開く（.illusionsフォルダ検出時）
  useEffect(() => {
    if (!isElectron || typeof window === "undefined") return;
    const cleanup = window.electronAPI?.onOpenAsProject?.(({ projectPath, initialFile }) => {
      void unsavedWarning.confirmBeforeAction(() => handleOpenAsProject(projectPath, initialFile));
    });
    return () => { cleanup?.(); };
  }, [isElectron, unsavedWarning, handleOpenAsProject]);

  // Auto-restore the last opened project on startup
  const autoRestoreTriggeredRef = useRef(false);
  useEffect(() => {
    if (!autoRestoreProjectId || autoRestoreTriggeredRef.current) return;
    autoRestoreTriggeredRef.current = true;

    isAutoRestoringRef.current = true;
    void (async () => {
      try {
        await handleOpenRecentProject(autoRestoreProjectId);
      } catch {
        // handleOpenRecentProject catches its own errors internally
      }
      isAutoRestoringRef.current = false;
      // After the attempt, if we're still restoring, stop and show error.
      // A short delay lets React process any state updates from the handler.
      // On Web, skip the error because the user may see a PermissionPrompt
      // or simply the WelcomeScreen with the recent projects list.
      setTimeout(() => {
        setIsRestoring((prev) => {
          if (prev && isElectron) {
            setRestoreError("前回のプロジェクトを開けませんでした。フォルダが移動または削除された可能性があります。");
          }
          return false;
        });
      }, 200);
    })();
  }, [autoRestoreProjectId, handleOpenRecentProject]);

  /** Called when the CreateProjectWizard successfully creates a project */
  const handleProjectCreated = useCallback(async (project: ProjectMode) => {
    setProjectMode(project);
    setShowCreateWizard(false);
    await loadProjectContent(project);

    // Save to recent projects in Electron
    if (isElectron && project.rootPath) {
      const storage = new ElectronStorageProvider();
      await storage.initialize();
      await storage.addRecentProject({
        id: project.projectId,
        rootPath: project.rootPath,
        name: project.name,
      });
      // Rebuild native menu to include the new project
      void window.electronAPI?.rebuildMenu?.();
    }
  }, [setProjectMode, isElectron, loadProjectContent]);

  /** Called when permission is granted for a restored project */
  const handlePermissionGranted = useCallback(() => {
    if (permissionPromptData) {
      void openRestoredProject(permissionPromptData.handle);
    }
    setShowPermissionPrompt(false);
    setPermissionPromptData(null);
  }, [permissionPromptData, openRestoredProject]);

  /** Called when permission is denied for a restored project */
  const handlePermissionDenied = useCallback(() => {
    setShowPermissionPrompt(false);
    setPermissionPromptData(null);
  }, []);

  // --- UpgradeBanner handlers ---

  /** Handle upgrading from standalone to project mode */
  const handleUpgrade = useCallback(async () => {
    if (!isStandaloneMode(editorMode)) return;
    try {
      const upgradeService = getProjectUpgradeService();
      const project = await upgradeService.upgradeToProject(editorMode, content);
      setProjectMode(project);
      setShowUpgradeBanner(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return; // User cancelled directory picker
      }
      console.error("プロジェクトへのアップグレードに失敗しました:", error);
    }
  }, [editorMode, content, setProjectMode]);

  /** Dismiss the upgrade banner for this session */
  const handleUpgradeDismiss = useCallback(() => {
    setShowUpgradeBanner(false);
    setUpgradeBannerDismissed(true);
  }, []);

  // Detect feature availability after mount to avoid SSR hydration mismatch
  // (browser APIs like showDirectoryPicker are unavailable during SSR)
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
         {/* 動的なタイトル更新 */}
        <TitleUpdater currentFile={currentFile} isDirty={isDirty} />

        {/* Web menu bar (only for non-Electron environment) */}
        {!isElectron && <WebMenuBar onMenuAction={handleMenuAction} recentProjects={recentProjects} checkedState={{ compactMode }} />}

         {/* 未保存警告ダイアログ (project mode transitions) */}
        <UnsavedWarningDialog
          isOpen={unsavedWarning.showWarning}
          fileName={currentFile?.name || "新規ファイル"}
          onSave={unsavedWarning.handleSave}
          onDiscard={unsavedWarning.handleDiscard}
          onCancel={unsavedWarning.handleCancel}
        />

        {/* 未保存警告ダイアログ (tab close) */}
        <UnsavedWarningDialog
          isOpen={pendingCloseTabId !== null}
          fileName={pendingCloseFileName}
          onSave={handleCloseTabSave}
          onDiscard={handleCloseTabDiscard}
          onCancel={handleCloseTabCancel}
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
          onClose={() => setShowSettingsModal(false)}
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
        />

        {/* ルビ設定ダイアログ */}
        <RubyDialog
          isOpen={showRubyDialog}
          onClose={() => setShowRubyDialog(false)}
          selectedText={rubySelectedText}
          onApply={handleApplyRuby}
        />

         {/* 自動復元の通知（Webのみ・固定表示） */}
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

           {/* 左サイドパネル */}
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
                                setEditorKey(prev => prev + 1);
                              }}
                              onFileDoubleClick={(vfsPath) => {
                                void openProjectFile(vfsPath, { preview: false });
                                setEditorKey(prev => prev + 1);
                              }}
                              onFileMiddleClick={(vfsPath) => {
                                void openProjectFile(vfsPath, { preview: false });
                                setEditorKey(prev => prev + 1);
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
              setEditorKey(prev => prev + 1);
            }}
            onCloseTab={closeTab}
            onNewTab={(fileType) => {
              newTab(fileType);
              setEditorKey(prev => prev + 1);
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
                onShowAllSearchResults={handleShowAllSearchResults}
                posHighlightEnabled={posHighlightEnabled}
                posHighlightColors={posHighlightColors}
                verticalScrollBehavior={verticalScrollBehavior}
                scrollSensitivity={scrollSensitivity}
                onOpenRubyDialog={handleOpenRubyDialog}
                onToggleTcy={handleToggleTcy}
                onOpenDictionary={handleOpenDictionary}
                onFontScaleChange={handleFontScaleChange}
                onLineHeightChange={handleLineHeightChange}
                onParagraphSpacingChange={handleParagraphSpacingChange}
                mdiExtensionsEnabled={mdiExtensionsEnabled}
                gfmEnabled={gfmEnabled}
              />
            )}
          </div>

           {/* 保存完了トースト */}
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

          {/* 右サイドパネル：統計情報（常に表示） */}
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
            wordCount={wordCount}
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
            activeFileName={currentFile?.name}
            currentContent={content}
            onHistoryRestore={(restoredContent: string) => {
              setContent(restoredContent);
              setEditorKey(prev => prev + 1);
            }}
            onCompareInEditor={setEditorDiff}
          />
        </ResizablePanel>
      </div>
    </div>
  );
}
