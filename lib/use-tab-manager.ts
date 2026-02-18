"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  openMdiFile,
  saveMdiFile,
  type MdiFileDescriptor,
} from "./mdi-file";
import { isElectronRenderer } from "./runtime-env";
import { getStorageService } from "./storage-service";
import { fetchAppState, persistAppState } from "./app-state-manager";
import { getRandomillusionstory } from "./illusion-stories";
import { getHistoryService } from "./history-service";
import { getVFS } from "./vfs";
import { useEditorMode } from "@/contexts/EditorModeContext";
import type { TabId, TabState, TabPersistenceState, SerializedTab } from "./tab-types";

const AUTO_SAVE_INTERVAL = 5000;
const TAB_PERSIST_DEBOUNCE = 1000;
const DEMO_FILE_NAME = "鏡地獄.mdi";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextTabCounter = 0;
function generateTabId(): TabId {
  return `tab-${++nextTabCounter}-${Date.now()}`;
}

function createNewTab(content?: string): TabState {
  const c = content ?? getRandomillusionstory();
  return {
    id: generateTabId(),
    file: null,
    content: c,
    lastSavedContent: c,
    isDirty: false,
    lastSavedTime: null,
    isSaving: false,
  };
}

/**
 * Sanitize MDI content before saving.
 * Converts/removes HTML tags that should not appear in .mdi files.
 */
function sanitizeMdiContent(content: string): string {
  let result = content;
  result = result.replace(/<br\s*\/?>/gi, "\n");
  result = result.replace(/<(\w+)[^>]*>(.*?)<\/\1>/gi, "$2");
  result = result.replace(/<[^>]+>/g, "");
  return result;
}

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "不明なエラー";
  let message = error.message;
  const errorCode = (error as NodeJS.ErrnoException).code;
  if (errorCode === "EACCES" || errorCode === "EPERM") {
    message =
      "ファイルへのアクセス権限がありません。ファイルが他のプログラムで開かれていないか、または書き込み権限があるかを確認してください。";
  } else if (errorCode === "ENOSPC") {
    message = "ディスクの空き容量が不足しています。";
  } else if (errorCode === "ENOENT") {
    message = "保存先のフォルダが見つかりません。";
  } else if (errorCode === "EINVAL") {
    message =
      "ファイル名またはパスが無効です。使用できない文字が含まれている可能性があります。";
  } else if (errorCode === "ENAMETOOLONG") {
    message = "ファイル名またはパスが長すぎます。";
  }
  return message;
}

async function loadDemoContent(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const paths = ["demo/鏡地獄.mdi", "/demo/鏡地獄.mdi", "./demo/鏡地獄.mdi"];
    for (const p of paths) {
      try {
        const url = new URL(p, window.location.href);
        const response = await fetch(url.toString());
        if (response.ok) {
          return await response.text();
        }
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseTabManagerReturn {
  // Backward-compatible surface (superset of useMdiFile)
  currentFile: MdiFileDescriptor | null;
  content: string;
  setContent: (content: string) => void;
  isDirty: boolean;
  isSaving: boolean;
  lastSavedTime: number | null;
  openFile: () => Promise<void>;
  saveFile: (isAutoSave?: boolean) => Promise<void>;
  saveAsFile: () => Promise<void>;
  newFile: () => void;
  updateFileName: (newName: string) => void;
  wasAutoRecovered?: boolean;
  onSystemFileOpen?: (handler: (path: string, content: string) => void) => void;
  _loadSystemFile: (path: string, content: string) => void;

  // Tab management
  tabs: TabState[];
  activeTabId: TabId;
  newTab: () => void;
  closeTab: (tabId: TabId) => void;
  switchTab: (tabId: TabId) => void;
  nextTab: () => void;
  prevTab: () => void;
  switchToIndex: (index: number) => void;

  // Close-tab unsaved warning flow
  pendingCloseTabId: TabId | null;
  pendingCloseFileName: string;
  handleCloseTabSave: () => Promise<void>;
  handleCloseTabDiscard: () => void;
  handleCloseTabCancel: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTabManager(options?: {
  skipAutoRestore?: boolean;
  autoSave?: boolean;
}): UseTabManagerReturn {
  const isElectron =
    typeof window !== "undefined" && isElectronRenderer();
  const { isProject } = useEditorMode();
  const skipAutoRestore = options?.skipAutoRestore ?? false;
  const autoSaveEnabled = options?.autoSave ?? true;

  // --- Core state -----------------------------------------------------------

  const [initialTab] = useState(() => createNewTab());
  const [tabs, setTabs] = useState<TabState[]>([initialTab]);
  const [activeTabId, setActiveTabId] = useState<TabId>(initialTab.id);
  const [wasAutoRecovered, setWasAutoRecovered] = useState(false);
  const [pendingCloseTabId, setPendingCloseTabId] = useState<TabId | null>(
    null,
  );

  // --- Refs (latest-value access for async / timer callbacks) ---------------

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  const isProjectRef = useRef(isProject);
  isProjectRef.current = isProject;
  const isSavingRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const systemFileOpenHandlerRef = useRef<
    ((path: string, content: string) => void) | null
  >(null);

  // --- Derived state from active tab ----------------------------------------

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const currentFile = activeTab?.file ?? null;
  const content = activeTab?.content ?? "";
  const isDirty = activeTab?.isDirty ?? false;
  const isSaving = activeTab?.isSaving ?? false;
  const lastSavedTime = activeTab?.lastSavedTime ?? null;

  const contentRef = useRef(content);
  contentRef.current = content;

  // --- Helpers --------------------------------------------------------------

  const updateTab = useCallback(
    (tabId: TabId, updates: Partial<TabState>) => {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === tabId ? { ...tab, ...updates } : tab,
        ),
      );
    },
    [],
  );

  const findTabByPath = useCallback(
    (path: string): TabState | undefined =>
      tabsRef.current.find((t) => t.file?.path === path),
    [],
  );

  // --- Auto-snapshot (project mode) -----------------------------------------

  const tryAutoSnapshot = useCallback(
    async (sourceFileName: string, savedContent: string) => {
      if (!isProjectRef.current) return;
      if (!getVFS().isRootOpen()) return;
      try {
        const historyService = getHistoryService();
        const shouldCreate =
          await historyService.shouldCreateSnapshot(sourceFileName);
        if (shouldCreate) {
          await historyService.createSnapshot({
            sourceFile: sourceFileName,
            content: savedContent,
            type: "auto",
          });
        }
      } catch (error) {
        console.warn("自動スナップショットの作成に失敗しました:", error);
      }
    },
    [],
  );

  // --- Persist helpers ------------------------------------------------------

  const persistLastOpenedPath = useCallback(async (path: string) => {
    try {
      await persistAppState({ lastOpenedMdiPath: path });
    } catch (error) {
      console.error("最後に開いたパスの保存に失敗しました:", error);
    }
  }, []);

  const persistFileReference = useCallback(
    async (descriptor: MdiFileDescriptor, fileContent: string) => {
      try {
        if (isElectron && descriptor.path) {
          await persistLastOpenedPath(descriptor.path);
        } else if (!isElectron && descriptor.handle) {
          const storage = getStorageService();
          await storage.initialize();
          await storage.saveEditorBuffer({
            content: fileContent,
            timestamp: Date.now(),
            fileHandle: descriptor.handle,
          });
        }
      } catch (error) {
        console.error("ファイル参照の保存に失敗しました:", error);
      }
    },
    [isElectron, persistLastOpenedPath],
  );

  // =========================================================================
  // Tab management functions
  // =========================================================================

  const newTab = useCallback(() => {
    const tab = createNewTab();
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  }, []);

  // Alias: newFile === newTab for backward compat with page.tsx
  const newFile = newTab;

  const switchTab = useCallback((tabId: TabId) => {
    if (tabsRef.current.some((t) => t.id === tabId)) {
      setActiveTabId(tabId);
    }
  }, []);

  const nextTabFn = useCallback(() => {
    const idx = tabsRef.current.findIndex(
      (t) => t.id === activeTabIdRef.current,
    );
    if (idx === -1) return;
    const next = (idx + 1) % tabsRef.current.length;
    setActiveTabId(tabsRef.current[next].id);
  }, []);

  const prevTabFn = useCallback(() => {
    const idx = tabsRef.current.findIndex(
      (t) => t.id === activeTabIdRef.current,
    );
    if (idx === -1) return;
    const prev =
      (idx - 1 + tabsRef.current.length) % tabsRef.current.length;
    setActiveTabId(tabsRef.current[prev].id);
  }, []);

  const switchToIndex = useCallback((index: number) => {
    const cur = tabsRef.current;
    if (cur.length === 0) return;
    // Cmd+9 → last tab
    const target = index >= cur.length ? cur.length - 1 : Math.max(0, index);
    setActiveTabId(cur[target].id);
  }, []);

  // Force-close (skips dirty check)
  const forceCloseTab = useCallback((tabId: TabId) => {
    const current = tabsRef.current;
    const index = current.findIndex((t) => t.id === tabId);
    if (index === -1) return;

    const remaining = current.filter((t) => t.id !== tabId);
    if (remaining.length === 0) {
      const emptyTab = createNewTab();
      setTabs([emptyTab]);
      setActiveTabId(emptyTab.id);
      return;
    }

    setTabs(remaining);
    if (tabId === activeTabIdRef.current) {
      const newIndex = Math.min(index, remaining.length - 1);
      setActiveTabId(remaining[newIndex].id);
    }
  }, []);

  // Close with dirty check → shows warning dialog via pendingCloseTabId
  const closeTab = useCallback(
    (tabId: TabId) => {
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (!tab) return;
      if (tab.isDirty) {
        setPendingCloseTabId(tabId);
        return;
      }
      forceCloseTab(tabId);
    },
    [forceCloseTab],
  );

  // --- Pending close-tab dialog handlers ------------------------------------

  const pendingCloseTab = pendingCloseTabId
    ? tabs.find((t) => t.id === pendingCloseTabId)
    : null;
  const pendingCloseFileName =
    pendingCloseTab?.file?.name ?? "新規ファイル";

  const handleCloseTabSave = useCallback(async () => {
    if (!pendingCloseTabId) return;
    const tab = tabsRef.current.find((t) => t.id === pendingCloseTabId);
    if (!tab) return;

    try {
      const sanitized = sanitizeMdiContent(tab.content);

      if (isProjectRef.current && tab.file?.path) {
        const vfs = getVFS();
        await vfs.writeFile(tab.file.path, sanitized);
      } else {
        const result = await saveMdiFile({
          descriptor: tab.file,
          content: sanitized,
        });
        if (!result) {
          // User cancelled save dialog → keep tab open
          setPendingCloseTabId(null);
          return;
        }
        updateTab(pendingCloseTabId, {
          file: result.descriptor,
          lastSavedContent: sanitized,
          isDirty: false,
        });
      }
    } catch (error) {
      console.error("保存に失敗しました:", error);
      const message = getErrorMessage(error);
      window.alert(`保存に失敗しました: ${message}`);
      return;
    }

    forceCloseTab(pendingCloseTabId);
    setPendingCloseTabId(null);
  }, [pendingCloseTabId, updateTab, forceCloseTab]);

  const handleCloseTabDiscard = useCallback(() => {
    if (pendingCloseTabId) {
      forceCloseTab(pendingCloseTabId);
      setPendingCloseTabId(null);
    }
  }, [pendingCloseTabId, forceCloseTab]);

  const handleCloseTabCancel = useCallback(() => {
    setPendingCloseTabId(null);
  }, []);

  // =========================================================================
  // Content management
  // =========================================================================

  const setContent = useCallback((newContent: string) => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== activeTabIdRef.current) return tab;
        return {
          ...tab,
          content: newContent,
          isDirty: newContent !== tab.lastSavedContent,
        };
      }),
    );
  }, []);

  const updateFileName = useCallback((newName: string) => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== activeTabIdRef.current) return tab;
        const file: MdiFileDescriptor = tab.file
          ? { ...tab.file, name: newName }
          : { path: null, handle: null, name: newName };
        return { ...tab, file };
      }),
    );
  }, []);

  // =========================================================================
  // File operations
  // =========================================================================

  /** Open a file via system dialog → new tab (or reuse untitled clean tab) */
  const openFile = useCallback(async () => {
    const result = await openMdiFile();
    if (!result) return;

    const { descriptor, content: fileContent } = result;

    // Deduplicate: switch to existing tab if same path
    if (descriptor.path) {
      const existing = findTabByPath(descriptor.path);
      if (existing) {
        setActiveTabId(existing.id);
        return;
      }
    }

    // Reuse current tab if untitled and clean
    const cur = tabsRef.current.find(
      (t) => t.id === activeTabIdRef.current,
    );
    if (cur && !cur.file && !cur.isDirty) {
      updateTab(cur.id, {
        file: descriptor,
        content: fileContent,
        lastSavedContent: fileContent,
        isDirty: false,
        lastSavedTime: Date.now(),
      });
    } else {
      const tab: TabState = {
        id: generateTabId(),
        file: descriptor,
        content: fileContent,
        lastSavedContent: fileContent,
        isDirty: false,
        lastSavedTime: Date.now(),
        isSaving: false,
      };
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
    }

    void persistFileReference(descriptor, fileContent);
  }, [findTabByPath, updateTab, persistFileReference]);

  /** Save the active tab */
  const saveFile = useCallback(
    async (isAutoSave: boolean = false) => {
      if (isSavingRef.current) return;

      const tabId = activeTabIdRef.current;
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (!tab) return;

      isSavingRef.current = true;
      updateTab(tabId, { isSaving: true });

      try {
        const sanitized = sanitizeMdiContent(tab.content);

        // Project mode: VFS direct write
        if (isProjectRef.current && tab.file?.path) {
          const vfs = getVFS();
          await vfs.writeFile(tab.file.path, sanitized);
          updateTab(tabId, {
            lastSavedContent: sanitized,
            isDirty: false,
            lastSavedTime: isAutoSave ? -Date.now() : Date.now(),
            isSaving: false,
          });
          void tryAutoSnapshot(tab.file.name, sanitized);
          return;
        }

        const result = await saveMdiFile({
          descriptor: tab.file,
          content: sanitized,
        });

        if (result) {
          updateTab(tabId, {
            file: result.descriptor,
            lastSavedContent: sanitized,
            isDirty: false,
            lastSavedTime: isAutoSave ? -Date.now() : Date.now(),
            isSaving: false,
          });
          void persistFileReference(result.descriptor, sanitized);
          void tryAutoSnapshot(result.descriptor.name, sanitized);
        } else {
          updateTab(tabId, { isSaving: false });
        }
      } catch (error) {
        console.error("保存に失敗しました:", error);
        updateTab(tabId, { isSaving: false });
        const message = getErrorMessage(error);
        window.alert(`保存に失敗しました: ${message}`);
      } finally {
        isSavingRef.current = false;
      }
    },
    [updateTab, persistFileReference, tryAutoSnapshot],
  );

  /** Save As (always shows dialog) */
  const saveAsFile = useCallback(async () => {
    if (isSavingRef.current) return;

    const tabId = activeTabIdRef.current;
    const tab = tabsRef.current.find((t) => t.id === tabId);
    if (!tab) return;

    isSavingRef.current = true;
    updateTab(tabId, { isSaving: true });

    try {
      const sanitized = sanitizeMdiContent(tab.content);
      const descriptor: MdiFileDescriptor | null = tab.file
        ? { path: null, handle: null, name: tab.file.name }
        : null;

      const result = await saveMdiFile({ descriptor, content: sanitized });

      if (result) {
        updateTab(tabId, {
          file: result.descriptor,
          lastSavedContent: sanitized,
          isDirty: false,
          lastSavedTime: Date.now(),
          isSaving: false,
        });
        void persistFileReference(result.descriptor, sanitized);
        void tryAutoSnapshot(result.descriptor.name, sanitized);
      } else {
        updateTab(tabId, { isSaving: false });
      }
    } catch (error) {
      console.error("名前を付けて保存に失敗しました:", error);
      updateTab(tabId, { isSaving: false });
      const message = getErrorMessage(error);
      window.alert(`名前を付けて保存に失敗しました: ${message}`);
    } finally {
      isSavingRef.current = false;
    }
  }, [updateTab, persistFileReference, tryAutoSnapshot]);

  /** Load a file by path + content into a new tab (or reuse/deduplicate) */
  const loadSystemFile = useCallback(
    (path: string, fileContent: string) => {
      // Deduplication
      const existing = findTabByPath(path);
      if (existing) {
        updateTab(existing.id, {
          content: fileContent,
          lastSavedContent: fileContent,
          isDirty: false,
          lastSavedTime: Date.now(),
        });
        setActiveTabId(existing.id);
        return;
      }

      // Reuse current tab if untitled and clean
      const cur = tabsRef.current.find(
        (t) => t.id === activeTabIdRef.current,
      );
      if (cur && !cur.file && !cur.isDirty) {
        updateTab(cur.id, {
          file: {
            path,
            handle: null,
            name: path.split("/").pop() || "無題",
          },
          content: fileContent,
          lastSavedContent: fileContent,
          isDirty: false,
          lastSavedTime: Date.now(),
        });
        return;
      }

      // New tab
      const tab: TabState = {
        id: generateTabId(),
        file: {
          path,
          handle: null,
          name: path.split("/").pop() || "無題",
        },
        content: fileContent,
        lastSavedContent: fileContent,
        isDirty: false,
        lastSavedTime: Date.now(),
        isSaving: false,
      };
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
    },
    [findTabByPath, updateTab],
  );

  // =========================================================================
  // Effects
  // =========================================================================

  // Dirty state → Electron title dot
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.setDirty) return;
    // Report dirty if ANY tab has unsaved changes
    const anyDirty = tabs.some((t) => t.isDirty);
    window.electronAPI.setDirty(anyDirty);
  }, [tabs, isElectron]);

  // Storage initialization & demo content
  useEffect(() => {
    const initializeStorage = async () => {
      try {
        const storage = getStorageService();
        await storage.initialize();
        const session = await storage.loadSession();
        const appState = await storage.loadAppState();
        const hasSeenDemo = appState?.hasSeenDemo ?? false;

        const hasEditedFiles = Boolean(
          session &&
            (session.recentFiles.length > 0 ||
              session.editorBuffer ||
              appState?.lastOpenedMdiPath),
        );

        if (!skipAutoRestore) {
          // Web: restore file handle from editor buffer
          if (!isElectron) {
            const buffer = await storage.loadEditorBuffer();
            if (buffer?.fileHandle) {
              try {
                const file = await buffer.fileHandle.getFile();
                const fileContent = await file.text();
                setTabs((prev) =>
                  prev.map((tab, i) =>
                    i === 0
                      ? {
                          ...tab,
                          file: {
                            path: null,
                            handle: buffer.fileHandle!,
                            name: file.name,
                          },
                          content: fileContent,
                          lastSavedContent: fileContent,
                          lastSavedTime: Date.now(),
                        }
                      : tab,
                  ),
                );
                setWasAutoRecovered(true);
                if (!hasSeenDemo) {
                  await persistAppState({ hasSeenDemo: true });
                }
                return;
              } catch (error) {
                console.warn(
                  "前回のファイルを復元できませんでした:",
                  error,
                );
                await storage.clearEditorBuffer();
              }
            }
          }

          // Demo content on first use
          if (!hasSeenDemo && !hasEditedFiles) {
            const demoContent = await loadDemoContent();
            if (demoContent) {
              setTabs((prev) =>
                prev.map((tab, i) =>
                  i === 0
                    ? {
                        ...tab,
                        file: {
                          path: null,
                          handle: null,
                          name: DEMO_FILE_NAME,
                        },
                        content: demoContent,
                        lastSavedContent: demoContent,
                      }
                    : tab,
                ),
              );
              await persistAppState({ hasSeenDemo: true });
            }
          }
        }
      } catch (error) {
        console.error("ストレージの初期化に失敗しました:", error);
      }
    };

    void initializeStorage();
  }, [isElectron, skipAutoRestore]);

  // Auto-save all dirty tabs with file descriptors
  const saveFileRef = useRef(saveFile);
  saveFileRef.current = saveFile;

  useEffect(() => {
    if (!autoSaveEnabled) {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }

    autoSaveTimerRef.current = setInterval(() => {
      const currentTabs = tabsRef.current;
      for (const tab of currentTabs) {
        if (!tab.isDirty || !tab.file || tab.isSaving) continue;

        // Active tab: use the normal saveFile path
        if (tab.id === activeTabIdRef.current) {
          void saveFileRef.current(true);
          continue;
        }

        // Non-active dirty tabs: save directly
        void (async () => {
          try {
            const sanitized = sanitizeMdiContent(tab.content);
            if (isProjectRef.current && tab.file?.path) {
              const vfs = getVFS();
              await vfs.writeFile(tab.file.path, sanitized);
              setTabs((prev) =>
                prev.map((t) =>
                  t.id === tab.id
                    ? {
                        ...t,
                        lastSavedContent: sanitized,
                        isDirty: false,
                        lastSavedTime: -Date.now(),
                      }
                    : t,
                ),
              );
            } else if (tab.file?.path || tab.file?.handle) {
              const result = await saveMdiFile({
                descriptor: tab.file,
                content: sanitized,
              });
              if (result) {
                setTabs((prev) =>
                  prev.map((t) =>
                    t.id === tab.id
                      ? {
                          ...t,
                          file: result.descriptor,
                          lastSavedContent: sanitized,
                          isDirty: false,
                          lastSavedTime: -Date.now(),
                        }
                      : t,
                  ),
                );
              }
            }
          } catch (error) {
            console.error(
              `自動保存に失敗しました (${tab.file?.name}):`,
              error,
            );
          }
        })();
      }
    }, AUTO_SAVE_INTERVAL);

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
    };
  }, [autoSaveEnabled]);

  // Save all dirty tabs before Electron window close
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onSaveBeforeClose) return;

    const cleanup = window.electronAPI.onSaveBeforeClose(async () => {
      for (const tab of tabsRef.current) {
        if (!tab.isDirty || !tab.file) continue;
        try {
          const sanitized = sanitizeMdiContent(tab.content);
          if (isProjectRef.current && tab.file.path) {
            const vfs = getVFS();
            await vfs.writeFile(tab.file.path, sanitized);
          } else {
            await saveMdiFile({
              descriptor: tab.file,
              content: sanitized,
            });
          }
        } catch (error) {
          console.error(
            `保存に失敗しました (${tab.file.name}):`,
            error,
          );
        }
      }
      await window.electronAPI?.saveDoneAndClose?.();
    });

    return cleanup;
  }, [isElectron]);

  // System file open (Electron: double-click .mdi etc.)
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onOpenFileFromSystem) return;

    const cleanup = window.electronAPI.onOpenFileFromSystem(
      ({ path, content: fileContent }) => {
        loadSystemFile(path, fileContent);
        // Notify page.tsx for editor key update
        systemFileOpenHandlerRef.current?.(path, fileContent);
      },
    );

    return cleanup;
  }, [isElectron, loadSystemFile]);

  // Menu: Save
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onMenuSave) return;
    const cleanup = window.electronAPI.onMenuSave(async () => {
      await saveFileRef.current();
    });
    return cleanup;
  }, [isElectron]);

  // Menu: Save As
  const saveAsFileRef = useRef(saveAsFile);
  saveAsFileRef.current = saveAsFile;

  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onMenuSaveAs) return;
    const cleanup = window.electronAPI.onMenuSaveAs(async () => {
      await saveAsFileRef.current();
    });
    return cleanup;
  }, [isElectron]);

  // Menu: Close Tab (Cmd+W from Electron menu)
  const closeTabRef = useRef(closeTab);
  closeTabRef.current = closeTab;

  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onMenuCloseTab) return;
    const cleanup = window.electronAPI.onMenuCloseTab(() => {
      const current = tabsRef.current;
      const activeId = activeTabIdRef.current;
      const active = current.find((t) => t.id === activeId);

      // Single empty clean tab → close window
      if (
        current.length === 1 &&
        active &&
        !active.file &&
        !active.isDirty
      ) {
        window.close();
        return;
      }

      closeTabRef.current(activeId);
    });
    return cleanup;
  }, [isElectron]);

  // Menu: New Tab (Cmd+T from Electron menu)
  const newTabRef = useRef(newTab);
  newTabRef.current = newTab;

  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onMenuNewTab) return;
    const cleanup = window.electronAPI.onMenuNewTab(() => {
      newTabRef.current();
    });
    return cleanup;
  }, [isElectron]);

  // Web: beforeunload warning if any tab is dirty
  useEffect(() => {
    if (isElectron) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const anyDirty = tabsRef.current.some((t) => t.isDirty);
      if (anyDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isElectron]);

  // Persist open tabs to AppState (debounced)
  const tabPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Only persist in Electron (Web has limited persistence)
    if (!isElectron) return;

    if (tabPersistTimerRef.current) {
      clearTimeout(tabPersistTimerRef.current);
    }

    tabPersistTimerRef.current = setTimeout(() => {
      const serializedTabs: SerializedTab[] = tabs.map((t) => ({
        filePath: t.file?.path ?? null,
        fileName: t.file?.name ?? "新規ファイル",
      }));
      const activeIndex = tabs.findIndex((t) => t.id === activeTabId);
      const state: TabPersistenceState = {
        tabs: serializedTabs,
        activeIndex: Math.max(0, activeIndex),
      };
      void persistAppState({ openTabs: state });
    }, TAB_PERSIST_DEBOUNCE);

    return () => {
      if (tabPersistTimerRef.current) {
        clearTimeout(tabPersistTimerRef.current);
      }
    };
  }, [tabs, activeTabId, isElectron]);

  // Restore tabs from AppState on mount (Electron only)
  useEffect(() => {
    if (!isElectron || skipAutoRestore) return;
    if (!window.electronAPI?.vfs?.readFile) return;

    const restoreTabs = async () => {
      try {
        const appState = await fetchAppState();
        const openTabs = appState?.openTabs;
        if (!openTabs || openTabs.tabs.length === 0) return;

        const restoredTabs: TabState[] = [];
        for (const serialized of openTabs.tabs) {
          if (serialized.filePath) {
            try {
              const fileContent =
                await window.electronAPI!.vfs!.readFile(serialized.filePath);
              restoredTabs.push({
                id: generateTabId(),
                file: {
                  path: serialized.filePath,
                  handle: null,
                  name: serialized.fileName,
                },
                content: fileContent,
                lastSavedContent: fileContent,
                isDirty: false,
                lastSavedTime: Date.now(),
                isSaving: false,
              });
            } catch (error) {
              console.warn(
                `タブの復元に失敗しました (${serialized.filePath}):`,
                error,
              );
            }
          }
        }

        if (restoredTabs.length > 0) {
          setTabs(restoredTabs);
          const activeIdx = Math.min(
            openTabs.activeIndex,
            restoredTabs.length - 1,
          );
          setActiveTabId(restoredTabs[activeIdx].id);
        }
      } catch (error) {
        console.error("タブの復元に失敗しました:", error);
      }
    };

    void restoreTabs();
  }, [isElectron, skipAutoRestore]);

  // Register system file open callback
  const onSystemFileOpen = useCallback(
    (handler: (path: string, content: string) => void) => {
      systemFileOpenHandlerRef.current = handler;
    },
    [],
  );

  // =========================================================================
  // Return
  // =========================================================================

  return {
    // Backward-compatible surface
    currentFile,
    content,
    setContent,
    isDirty,
    isSaving,
    lastSavedTime,
    openFile,
    saveFile,
    saveAsFile,
    newFile,
    updateFileName,
    wasAutoRecovered,
    onSystemFileOpen,
    _loadSystemFile: loadSystemFile,

    // Tab management
    tabs,
    activeTabId,
    newTab,
    closeTab,
    switchTab,
    nextTab: nextTabFn,
    prevTab: prevTabFn,
    switchToIndex,

    // Close-tab dialog
    pendingCloseTabId,
    pendingCloseFileName,
    handleCloseTabSave,
    handleCloseTabDiscard,
    handleCloseTabCancel,
  };
}
