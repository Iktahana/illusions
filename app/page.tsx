"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Explorer, { FilesPanel } from "@/components/Explorer";
import Inspector from "@/components/Inspector";
import NovelEditor from "@/components/Editor";
import ResizablePanel from "@/components/ResizablePanel";
import TitleUpdater from "@/components/TitleUpdater";
import ActivityBar, { type ActivityBarView, isBottomView } from "@/components/ActivityBar";
import SidebarSplitter from "@/components/SidebarSplitter";
import SearchResults from "@/components/SearchResults";
import UnsavedWarningDialog from "@/components/UnsavedWarningDialog";
import FileConflictDialog from "@/components/FileConflictDialog";
import UpgradeToProjectBanner from "@/components/UpgradeToProjectBanner";
import { getProjectUpgradeService } from "@/lib/project-upgrade";
import WordFrequency from "@/components/WordFrequency";
import Characters from "@/components/Characters";
import Dictionary from "@/components/Dictionary";
import WelcomeScreen from "@/components/WelcomeScreen";
import CreateProjectWizard from "@/components/CreateProjectWizard";
import PermissionPrompt from "@/components/PermissionPrompt";
import { useMdiFile } from "@/lib/use-mdi-file";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";
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
import { createFileWatcher } from "@/lib/file-watcher";
import { getVFS } from "@/lib/vfs";
import { isProjectMode, isStandaloneMode } from "@/lib/project-types";
import {
  countSentences,
  analyzeCharacterTypes,
  calculateCharacterUsageRates,
  calculateReadabilityScore,
  analyzeParticleUsage,
} from "@/lib/utils";

import type { ProjectMode } from "@/lib/project-types";
import type { FileWatcher } from "@/lib/file-watcher";

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

export default function EditorPage() {
  const { editorMode, setProjectMode, setStandaloneMode, resetMode } = useEditorMode();

  // Welcome screen / wizard / permission prompt state
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [permissionPromptData, setPermissionPromptData] = useState<PermissionPromptState | null>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProjectEntry[]>([]);
  // Auto-restore state: suppress WelcomeScreen flash during restore attempt
  const [isRestoring, setIsRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const isAutoRestoringRef = useRef(false);

  const mdiFile = useMdiFile();
  const { content, setContent, currentFile, isDirty, isSaving, lastSavedTime, openFile: originalOpenFile, saveFile, saveAsFile, newFile: originalNewFile, updateFileName, wasAutoRecovered, onSystemFileOpen, _loadSystemFile } =
    mdiFile;

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
   // File session ID (updated only on new file creation or file switch)
   const fileSessionRef = useRef(0);
  const prevLastSavedTimeRef = useRef<number | null>(null);
  const hasAutoRecoveredRef = useRef(false);

  // UpgradeBanner trigger state
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(false);
  const [upgradeBannerDismissed, setUpgradeBannerDismissed] = useState(false);
  const standaloneSaveCountRef = useRef(0);

  // File conflict detection state (external file change)
  const [showFileConflict, setShowFileConflict] = useState(false);
  const [conflictData, setConflictData] = useState<{ fileName: string; lastModified: number; content: string } | null>(null);
  const fileWatcherRef = useRef<FileWatcher | null>(null);
  // Standalone polling timer ref for external change detection
  const standalonePollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const standaloneLastModifiedRef = useRef<number>(0);

  const isElectron = typeof window !== "undefined" && isElectronRenderer();

  // 未保存警告の Hook を初期化
  const unsavedWarning = useUnsavedWarning(
    isDirty,
    saveFile,
    currentFile?.name || null
  );

  // --- File conflict detection ---

  /** Handle conflict resolution: keep local or load remote content */
  const handleConflictResolve = useCallback((resolution: "local" | "remote") => {
    if (resolution === "remote" && conflictData) {
      // Load disk content into editor
      setContent(conflictData.content);
      setEditorKey(prev => prev + 1);
    }
    // "local" => keep editor content, dismiss dialog
    setShowFileConflict(false);
    setConflictData(null);
  }, [conflictData, setContent]);

  /**
   * Start/stop file watcher when currentFile or editorMode changes.
   * Polls FileSystemFileHandle.getFile() every 5 seconds and compares
   * lastModified to detect external changes. Works for both project mode
   * (mainFileHandle) and standalone mode (fileHandle).
   *
   * ファイルまたはエディタモードが変わったら監視を開始/停止する。
   * FileSystemFileHandle.getFile() を5秒ごとにポーリングし、
   * lastModified を比較して外部変更を検出する。
   */
  useEffect(() => {
    // Clean up any previous watcher / polling
    if (fileWatcherRef.current) {
      fileWatcherRef.current.stop();
      fileWatcherRef.current = null;
    }
    if (standalonePollingRef.current !== null) {
      clearInterval(standalonePollingRef.current);
      standalonePollingRef.current = null;
    }

    // Only watch when in an active editor mode with a file open
    if (editorMode === null || !currentFile) {
      return;
    }

    // Determine the FileSystemFileHandle to poll.
    // Project mode: use mainFileHandle. Standalone mode: use fileHandle.
    // Electron mode: use VFS-based watcher with absolute path instead.
    let fileHandle: FileSystemFileHandle | null = null;
    if (isProjectMode(editorMode)) {
      // Electron: use VFS-based watcher (works with absolute path)
      if (isElectron && currentFile.path) {
        const relativePath = editorMode.metadata.mainFile;
        const watcher = createFileWatcher({
          path: relativePath,
          onChanged: (newContent: string) => {
            if (newContent !== contentRef.current) {
              setConflictData({
                fileName: currentFile.name,
                lastModified: Date.now(),
                content: newContent,
              });
              setShowFileConflict(true);
            }
          },
        });
        fileWatcherRef.current = watcher;
        watcher.start();
        // Return cleanup; skip the polling path below
        return () => {
          watcher.stop();
          fileWatcherRef.current = null;
        };
      }
      // Web: poll mainFileHandle directly
      fileHandle = editorMode.mainFileHandle;
    } else if (isStandaloneMode(editorMode)) {
      fileHandle = editorMode.fileHandle;
    }

    if (!fileHandle) {
      return;
    }

    // Direct FileSystemFileHandle polling (Web)
    const handleToWatch = fileHandle;
    standaloneLastModifiedRef.current = 0;

    // Initialize lastModified baseline
    void (async () => {
      try {
        const file = await handleToWatch.getFile();
        standaloneLastModifiedRef.current = file.lastModified;
      } catch {
        // File may not be accessible initially
      }
    })();

    // Poll every 5 seconds
    const POLL_INTERVAL_MS = 5000;
    standalonePollingRef.current = setInterval(() => {
      void (async () => {
        try {
          const file = await handleToWatch.getFile();
          if (file.lastModified > standaloneLastModifiedRef.current && standaloneLastModifiedRef.current > 0) {
            standaloneLastModifiedRef.current = file.lastModified;
            const newContent = await file.text();
            // Only show conflict if content differs from editor
            if (newContent !== contentRef.current) {
              setConflictData({
                fileName: currentFile.name,
                lastModified: file.lastModified,
                content: newContent,
              });
              setShowFileConflict(true);
            }
          } else if (standaloneLastModifiedRef.current === 0) {
            // First successful read, set baseline
            standaloneLastModifiedRef.current = file.lastModified;
          }
        } catch {
          // File may be inaccessible; skip this poll cycle
        }
      })();
    }, POLL_INTERVAL_MS);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (standalonePollingRef.current !== null) {
        clearInterval(standalonePollingRef.current);
        standalonePollingRef.current = null;
      }
    };
  }, [editorMode, currentFile, isElectron]);

   // 自動復元（ページ再読み込み）時はエディタを再マウント
   useEffect(() => {
    if (wasAutoRecovered && !hasAutoRecoveredRef.current) {
      hasAutoRecoveredRef.current = true;
      fileSessionRef.current += 1;
      setEditorKey(prev => prev + 1);
    }
  }, [wasAutoRecovered]);

   // openFile/newFile をラップしてセッションIDを進める（安全チェック付き）
   const openFile = useCallback(async () => {
     await unsavedWarning.confirmBeforeAction(async () => {
       await originalOpenFile();

       // content の状態更新を反映してからエディタを再マウント
       // setTimeout で originalOpenFile 由来の状態更新を React に先に処理させる
       setTimeout(() => {
        fileSessionRef.current += 1;
        setEditorKey(prev => prev + 1);
      }, 0);
    });
  }, [originalOpenFile, unsavedWarning]);

  const newFile = useCallback(() => {
    void unsavedWarning.confirmBeforeAction(() => {
      originalNewFile();
      fileSessionRef.current += 1;
      setEditorKey(prev => prev + 1);
    });
  }, [originalNewFile, unsavedWarning]);

  // Electron メニューの「新規」と「開く」をバインド（安全チェック付き）
  useElectronMenuHandlers(newFile, openFile);

  // システムからファイルを開く処理（安全チェック付き）
  useEffect(() => {
    if (!onSystemFileOpen) return;

    onSystemFileOpen((path: string, fileContent: string) => {
      void unsavedWarning.confirmBeforeAction(() => {
        // ファイルを直接読み込む
        _loadSystemFile(path, fileContent);

        // エディタを再マウント
        setTimeout(() => {
          fileSessionRef.current += 1;
          setEditorKey(prev => prev + 1);
        }, 0);
      });
    });
  }, [onSystemFileOpen, unsavedWarning, _loadSystemFile]);

  // エディタ表示設定
  const [fontScale, setFontScale] = useState(100); // 100% = Standard size
  const [lineHeight, setLineHeight] = useState(1.8);
  const [paragraphSpacing, setParagraphSpacing] = useState(0.5); // 0.5em = Standard spacing
  const [textIndent, setTextIndent] = useState(1);
  const [fontFamily, setFontFamily] = useState('Noto Serif JP');
  const [charsPerLine, setCharsPerLine] = useState(40); // 0 = no limit (default 40)
  const [showParagraphNumbers, setShowParagraphNumbers] = useState(true);
  const [posHighlightEnabled, setPosHighlightEnabled] = useState(false); // POS coloring (default: disabled)
  const [posHighlightColors, setPosHighlightColors] = useState<Record<string, string>>({}); // Per-POS color settings
  const [topView, setTopView] = useState<ActivityBarView>("explorer");
  const [bottomView, setBottomView] = useState<ActivityBarView>("none");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editorViewInstance, setEditorViewInstance] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [searchResults, setSearchResults] = useState<{matches: any[], searchTerm: string} | null>(null);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);

  // Web menu handlers
  const { handleMenuAction } = useWebMenuHandlers({
    onNew: newFile,
    onOpen: openFile,
    onSave: saveFile,
    onSaveAs: saveAsFile,
    onOpenProject: () => void handleOpenProject(),
    onOpenRecentProject: () => resetMode(),
    onCloseWindow: () => window.close(),
    editorView: editorViewInstance,
  });

  // Global shortcuts for Web (only when not in Electron)
  useGlobalShortcuts(
    !isElectron ? handleMenuAction : () => {},
    editorDomRef
  );

   // lastSavedTime が更新されたら「保存完了」トーストを表示
   useEffect(() => {
     if (lastSavedTime && prevLastSavedTimeRef.current !== lastSavedTime) {
       // 初回読み込みでは表示しない
       if (prevLastSavedTimeRef.current !== null) {
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
        if (typeof appState.paragraphSpacing === "number") {
          setParagraphSpacing(appState.paragraphSpacing);
        }
        if (typeof appState.showParagraphNumbers === "boolean") {
          setShowParagraphNumbers(appState.showParagraphNumbers);
        }
        if (typeof appState.posHighlightEnabled === "boolean") {
          setPosHighlightEnabled(appState.posHighlightEnabled);
        }
        if (appState.posHighlightColors && typeof appState.posHighlightColors === "object") {
          setPosHighlightColors(appState.posHighlightColors);
        }
      } catch (error) {
        console.error("設定の読み込みに失敗しました:", error);
      }
    };

    void loadSettings();

    return () => {
      mounted = false;
    };
  }, []);

  // ID of the most recent project to auto-restore
  const [autoRestoreProjectId, setAutoRestoreProjectId] = useState<string | null>(null);

  // Load recent projects on mount (for WelcomeScreen)
  useEffect(() => {
    let mounted = true;

    // Detect ?welcome parameter: skip auto-restore and show welcome page
    // Check here (inside useEffect) to guarantee window is available (avoid SSR issues)
    const params = new URLSearchParams(window.location.search);
    const skipAutoRestore = params.has("welcome");
    if (skipAutoRestore) {
      // Clean up URL so a later page refresh will auto-restore normally
      params.delete("welcome");
      const cleanUrl = window.location.pathname + (params.toString() ? `?${params}` : "");
      window.history.replaceState({}, "", cleanUrl);
    }

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
  }, [isElectron]);

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

  const handleParagraphSpacingChange = useCallback((value: number) => {
    setParagraphSpacing(value);
    void persistAppState({ paragraphSpacing: value }).catch((error) => {
      console.error("段落間隔の保存に失敗しました:", error);
    });
  }, []);

  const handleShowParagraphNumbersChange = useCallback((value: boolean) => {
    setShowParagraphNumbers(value);
    void persistAppState({ showParagraphNumbers: value }).catch((error) => {
      console.error("段落番号の設定保存に失敗しました:", error);
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

   const wordCount = words(content);
   const charCount = chars(content);

   // 段落数を計算（空行で区切る）
   const paragraphCount = content ? content.split(/\n\n+/).filter(p => p.trim().length > 0).length : 0;

   // 日本語テキストの詳細統計を算出
   const sentenceCount = countSentences(content);
   const charTypeAnalysis = analyzeCharacterTypes(content);
   const charUsageRates = calculateCharacterUsageRates(charTypeAnalysis);
   const readabilityAnalysis = calculateReadabilityScore(content);
   const particleAnalysis = analyzeParticleUsage(content);

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

       if (isSaveShortcut) {
         event.preventDefault();
         void saveFile();
       } else if (isSearchShortcut) {
         event.preventDefault();
         setSearchOpenTrigger(prev => prev + 1);
       } else if (isPasteAsPlaintextShortcut) {
         event.preventDefault();
         void handlePasteAsPlaintext();
       }
     };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [saveFile, handlePasteAsPlaintext]);

  // --- WelcomeScreen callbacks ---

  /** Load a project's main file content into the editor */
  const loadProjectContent = useCallback(async (project: ProjectMode) => {
    try {
      const projectService = getProjectService();
      const mainContent = await projectService.readProjectContent(project);
      const mainFileName = project.metadata.mainFile;

      if (isElectron && project.rootPath) {
        _loadSystemFile(
          `${project.rootPath}/${mainFileName}`,
          mainContent
        );
      } else {
        _loadSystemFile(mainFileName, mainContent);
      }

      fileSessionRef.current += 1;
      setEditorKey((prev) => prev + 1);
    } catch (error) {
      console.error(
        "プロジェクトのメインファイルの読み込みに失敗しました:",
        error
      );
    }
  }, [isElectron, _loadSystemFile]);

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

  // メニューの「最近のプロジェクトを開く」を受け取る（Electronのみ）
  // → WelcomeScreenに戻る
  useEffect(() => {
    if (!isElectron || typeof window === "undefined") return;
    const cleanup = window.electronAPI?.onMenuOpenRecentProject?.(() => {
      resetMode();
    });
    return () => { cleanup?.(); };
  }, [isElectron, resetMode]);

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
          console.log("[Open Recent] Attempting to open project at:", project.rootPath);
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
        {!isElectron && <WebMenuBar onMenuAction={handleMenuAction} />}

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
        {!isElectron && <WebMenuBar onMenuAction={handleMenuAction} />}

         {/* 未保存警告ダイアログ */}
        <UnsavedWarningDialog
          isOpen={unsavedWarning.showWarning}
          fileName={currentFile?.name || "新規ファイル"}
          onSave={unsavedWarning.handleSave}
          onDiscard={unsavedWarning.handleDiscard}
          onCancel={unsavedWarning.handleCancel}
        />

        {/* 外部ファイル変更の競合解決ダイアログ */}
        {showFileConflict && conflictData && (
          <FileConflictDialog
            isOpen={showFileConflict}
            fileName={conflictData.fileName}
            lastModified={conflictData.lastModified}
            onResolve={handleConflictResolve}
          />
        )}

        {/* UpgradeBanner for standalone mode */}
        {showUpgradeBanner && !upgradeBannerDismissed && isStandaloneMode(editorMode) && features.projectMode && (
          <UpgradeToProjectBanner
            onUpgrade={() => void handleUpgrade()}
            onDismiss={handleUpgradeDismiss}
          />
        )}

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
           onTopViewChange={setTopView}
           onBottomViewChange={setBottomView}
         />

           {/* 左サイドパネル */}
          {(topView !== "none" || bottomView !== "none") && (
            <ResizablePanel side="left" defaultWidth={256} minWidth={200} maxWidth={400}>
              {(() => {
                const renderPanel = (view: ActivityBarView) => {
                  switch (view) {
                    case "files":
                      return (
                        <aside className="h-full bg-background border-r border-border flex flex-col">
                          <div className="p-4 flex-1 overflow-y-auto">
                            <FilesPanel projectName={isProjectMode(editorMode) ? editorMode.name : undefined} />
                          </div>
                        </aside>
                      );
                    case "explorer":
                      return (
                        <Explorer
                          content={content}
                          onChapterClick={handleChapterClick}
                          onInsertText={handleInsertText}
                          fontScale={fontScale}
                          onFontScaleChange={setFontScale}
                          lineHeight={lineHeight}
                          onLineHeightChange={setLineHeight}
                          paragraphSpacing={paragraphSpacing}
                          onParagraphSpacingChange={handleParagraphSpacingChange}
                          textIndent={textIndent}
                          onTextIndentChange={setTextIndent}
                          fontFamily={fontFamily}
                          onFontFamilyChange={setFontFamily}
                          charsPerLine={charsPerLine}
                          onCharsPerLineChange={setCharsPerLine}
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
                        <div className="h-full bg-background-secondary border-r border-border p-4">
                          <h2 className="text-lg font-semibold text-foreground mb-4">アウトライン</h2>
                          <p className="text-sm text-foreground-secondary">アウトライン機能は開発中です</p>
                        </div>
                      );
                    case "characters":
                      return <Characters content={content} />;
                    case "dictionary":
                      return <Dictionary content={content} />;
                    case "settings":
                      return (
                        <div className="h-full bg-background-secondary border-r border-border p-4">
                          <h2 className="text-lg font-semibold text-foreground mb-4">設定</h2>
                          <p className="text-sm text-foreground-secondary">設定機能は開発中です</p>
                        </div>
                      );
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

        <main className="flex-1 flex flex-col overflow-hidden min-h-0 relative">
          <div ref={editorDomRef} className="flex-1 min-h-0">
            <NovelEditor
              key={`file-${fileSessionRef.current}-${editorKey}`}
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
              searchOpenTrigger={searchOpenTrigger}
              searchInitialTerm={searchInitialTerm}
              showParagraphNumbers={showParagraphNumbers}
              onEditorViewReady={setEditorViewInstance}
              onShowAllSearchResults={handleShowAllSearchResults}
              posHighlightEnabled={posHighlightEnabled}
              posHighlightColors={posHighlightColors}
            />
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
            defaultWidth={256}
            minWidth={200}
            maxWidth={400}
            collapsible={true}
            isCollapsed={isRightPanelCollapsed}
            onToggleCollapse={() => setIsRightPanelCollapsed(!isRightPanelCollapsed)}
          >
          <Inspector
            wordCount={wordCount}
            charCount={charCount}
            selectedCharCount={selectedCharCount}
            paragraphCount={paragraphCount}
            fileName={fileName}
            isDirty={isDirty}
            isSaving={isSaving}
            lastSavedTime={lastSavedTime}
            onOpenFile={openFile}
            onNewFile={newFile}
            onSaveFile={saveFile}
            onFileNameChange={updateFileName}
            sentenceCount={sentenceCount}
            charTypeAnalysis={charTypeAnalysis}
            charUsageRates={charUsageRates}
            readabilityAnalysis={readabilityAnalysis}
            particleAnalysis={particleAnalysis}
            posHighlightEnabled={posHighlightEnabled}
            onPosHighlightEnabledChange={handlePosHighlightEnabledChange}
            posHighlightColors={posHighlightColors}
            onPosHighlightColorsChange={handlePosHighlightColorsChange}
            onHistoryRestore={(restoredContent: string) => {
              setContent(restoredContent);
              setEditorKey(prev => prev + 1);
            }}
          />
        </ResizablePanel>
      </div>
    </div>
  );
}
