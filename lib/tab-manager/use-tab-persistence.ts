"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getStorageService } from "../storage/storage-service";
import { fetchWindowState, persistWindowState } from "../storage/app-state-manager";
import type { TabState, SerializedTab, TabPersistenceState, EditorTabState } from "./tab-types";
import { isEditorTab } from "./tab-types";
import type { TabManagerCore } from "./types";
import { TAB_PERSIST_DEBOUNCE, createNewTab, generateTabId, inferFileType } from "./types";
import { getVFS } from "../vfs";
import type { WorkspaceTab } from "../project/project-types";
import {
  persistWorkspaceJson,
  toRelativePath,
  toAbsolutePath,
} from "../project/workspace-persistence";

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface UseTabPersistenceParams extends TabManagerCore {
  /** Whether to skip auto-restore on mount. */
  skipAutoRestore: boolean;
  /** Promise that resolves once the VFS root is set (Electron only). */
  vfsReadyPromise?: Promise<void>;
  /**
   * Optional setter for surfacing a restore error to parent UI.
   * Called when all file-backed tabs fail to restore so the session is not
   * silently overwritten with a blank default tab.
   */
  setRestoreError?: Dispatch<SetStateAction<string | null>>;
  /**
   * Stable key identifying this window's project context (e.g. project root path).
   * When provided, tabs are stored per-window so multiple windows with different
   * projects do not overwrite each other's state.
   * When null/undefined, falls back to the legacy global AppState storage.
   *
   * このウィンドウのプロジェクトコンテキストを識別する安定したキー（例: プロジェクトルートパス）。
   * 指定時はウィンドウごとにタブ状態を保存し、異なるプロジェクトの複数ウィンドウが
   * 互いの状態を上書きしないようにする。
   */
  windowKey?: string | null;
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseTabPersistenceReturn {
  /** Whether the session was auto-recovered from a saved buffer. */
  wasAutoRecovered: boolean;
  /** Immediately flush pending tab state to storage (cancels debounce). */
  flushTabState: () => Promise<void>;
  /**
   * Restore tabs from workspace.json data that was already loaded during project open.
   * Called explicitly by project-open handlers — replaces the mount-time restore for
   * project mode. Returns true if any tabs were restored.
   *
   * プロジェクトオープン時に読み込み済みの workspace.json データからタブを復元する。
   * プロジェクトモードではマウント時復元の代わりにこの関数を明示的に呼ぶ。
   *
   * @param savedTabs - The openTabs data from WorkspaceState (may be undefined)
   * @param rootPath  - Project root path for converting relative → absolute paths (null for Web)
   */
  restoreProjectTabs: (
    savedTabs: { tabs: WorkspaceTab[]; activeIndex: number } | undefined,
    rootPath: string | null,
  ) => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Handles two responsibilities:
 * 1. Persist open tabs to workspace.json (project mode) or AppState (standalone).
 * 2. Restore tabs from workspace.json (explicit, via restoreProjectTabs) or
 *    AppState/storage on mount (standalone mode only).
 *
 * In project mode, the mount-time Electron restore is REPLACED by explicit
 * restoreProjectTabs() calls from project-open handlers. This eliminates
 * the race condition where windowKey was null during mount-time restore.
 */
export function useTabPersistence(params: UseTabPersistenceParams): UseTabPersistenceReturn {
  const {
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    tabsRef,
    activeTabIdRef,
    isProjectRef,
    isElectron,
    skipAutoRestore,
    vfsReadyPromise,
    setRestoreError,
    windowKey,
  } = params;

  // Keep a ref so async callbacks always see the latest window key without
  // being captured in stale closures.
  const windowKeyRef = useRef(windowKey ?? null);
  windowKeyRef.current = windowKey ?? null;

  const [wasAutoRecovered, setWasAutoRecovered] = useState(false);

  // Gate persistence until after the initial restore has completed to
  // prevent the empty initial tabs state from overwriting saved tab data
  // before the async restore path (which may wait on vfsReadyPromise) runs.
  const storageInitializedRef = useRef(false);

  // Tracks whether restoreProjectTabs was called (prevents mount-time
  // restore from running redundantly when a project is being auto-restored).
  const projectTabsRestoredRef = useRef(false);

  // --- Persist open tabs (debounced) -------------------------------------

  const tabPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Build and persist the current tab state immediately. */
  const persistTabStateNow = useCallback(async () => {
    const currentTabs = tabsRef.current;
    const currentActiveId = activeTabIdRef.current;
    const editorTabs = currentTabs.filter(isEditorTab);
    const activeEditorIndex = editorTabs.findIndex((t) => t.id === currentActiveId);

    // --- Project mode: write to workspace.json ---
    if (isProjectRef.current) {
      const rootPath = windowKeyRef.current; // rootPath for Electron, null for Web
      const workspaceTabs: WorkspaceTab[] = editorTabs.map((t) => ({
        relativePath: t.file?.path ? toRelativePath(t.file.path, rootPath) : null,
        fileName: t.file?.name ?? "新規ファイル",
        isPreview: t.isPreview || undefined,
        fileType: t.fileType,
      }));
      await persistWorkspaceJson({
        openTabs: {
          tabs: workspaceTabs,
          activeIndex: Math.max(0, activeEditorIndex),
        },
      });
      return;
    }

    // --- Standalone mode: write to SQLite / global AppState ---
    const serializedTabs: SerializedTab[] = editorTabs.map((t) => ({
      filePath: t.file?.path ?? null,
      fileName: t.file?.name ?? "新規ファイル",
      isPreview: t.isPreview || undefined,
      fileType: t.fileType,
    }));
    const state: TabPersistenceState = {
      tabs: serializedTabs,
      activeIndex: Math.max(0, activeEditorIndex),
    };
    const key = windowKeyRef.current;
    if (key) {
      await persistWindowState(key, { openTabs: state });
    } else {
      const { persistAppState } = await import("../storage/app-state-manager");
      await persistAppState({ openTabs: state });
    }
  }, [tabsRef, activeTabIdRef, isProjectRef]);

  /** Flush pending tab state: cancel debounce and persist immediately. */
  const flushTabState = useCallback(async () => {
    if (tabPersistTimerRef.current) {
      clearTimeout(tabPersistTimerRef.current);
      tabPersistTimerRef.current = null;
    }
    await persistTabStateNow();
  }, [persistTabStateNow]);

  useEffect(() => {
    // Skip persisting empty state until after storage has been initialized.
    if (!storageInitializedRef.current && tabs.length === 0) return;

    if (tabPersistTimerRef.current) {
      clearTimeout(tabPersistTimerRef.current);
    }

    tabPersistTimerRef.current = setTimeout(() => {
      void persistTabStateNow().catch((error) => {
        console.error("タブ状態の保存に失敗しました:", error);
      });
    }, TAB_PERSIST_DEBOUNCE);

    return () => {
      if (tabPersistTimerRef.current) {
        clearTimeout(tabPersistTimerRef.current);
        tabPersistTimerRef.current = null;
      }
    };
  }, [tabs, activeTabId, persistTabStateNow]);

  // Flush pending tab state on unmount only (not on every deps change).
  useEffect(() => {
    return () => {
      void flushTabState().catch(() => {});
    };
  }, [flushTabState]);

  // --- restoreProjectTabs (explicit, called by project-open handlers) ----

  const restoreProjectTabs = useCallback(
    async (
      savedTabs: { tabs: WorkspaceTab[]; activeIndex: number } | undefined,
      rootPath: string | null,
    ): Promise<boolean> => {
      projectTabsRestoredRef.current = true;

      if (!savedTabs || savedTabs.tabs.length === 0) return false;

      const restoredTabs: EditorTabState[] = [];
      for (const saved of savedTabs.tabs) {
        if (!saved.relativePath) {
          // Unsaved tab — restore as blank
          restoredTabs.push(createNewTab(undefined, saved.fileType ?? ".mdi"));
          continue;
        }
        try {
          const absolutePath = toAbsolutePath(saved.relativePath, rootPath);
          const vfs = getVFS();
          const fileContent = await vfs.readFile(absolutePath);
          restoredTabs.push({
            tabKind: "editor",
            id: generateTabId(),
            file: {
              path: absolutePath,
              handle: null,
              name: saved.fileName,
            },
            content: fileContent,
            lastSavedContent: fileContent,
            isDirty: false,
            lastSavedTime: Date.now(),
            lastSaveWasAuto: false,
            isSaving: false,
            isPreview: saved.isPreview ?? false,
            fileType: saved.fileType ?? inferFileType(saved.fileName),
            fileSyncStatus: "clean",
            conflictDiskContent: null,
          });
        } catch (error) {
          console.warn(`タブの復元に失敗しました (${saved.relativePath}):`, error);
        }
      }

      if (restoredTabs.length > 0) {
        setTabs(restoredTabs);
        const activeIdx = Math.min(savedTabs.activeIndex, restoredTabs.length - 1);
        setActiveTabId(restoredTabs[Math.max(0, activeIdx)].id);
        storageInitializedRef.current = true;
        return true;
      }

      // All file-backed tabs failed to restore
      const hadFileBacked = savedTabs.tabs.some((t) => Boolean(t.relativePath));
      if (hadFileBacked) {
        setRestoreError?.(
          "前回開いていたファイルを復元できませんでした。ファイルが移動または削除された可能性があります。",
        );
      }
      storageInitializedRef.current = true;
      return false;
    },
    [setTabs, setActiveTabId, setRestoreError],
  );

  // --- Storage initialization & Web file restore --------------------------

  useEffect(() => {
    const initializeStorage = async () => {
      try {
        const storage = getStorageService();
        await storage.initialize();

        const key = windowKeyRef.current;
        const windowState = key ? await fetchWindowState(key) : null;
        const appState = windowState ? null : await storage.loadAppState();

        const savedOpenTabs = windowState?.openTabs ?? appState?.openTabs;
        const savedEmpty = savedOpenTabs && savedOpenTabs.tabs.length === 0;

        let initialTab: EditorTabState | null = null;

        if (!skipAutoRestore && !isElectron && !savedEmpty) {
          const lastFileKey = await storage.getItem("last_editor_buffer_key");
          const buffer = await storage.loadEditorBuffer(lastFileKey ?? undefined);
          if (buffer?.fileHandle) {
            try {
              const file = await buffer.fileHandle.getFile();
              const fileContent = await file.text();
              initialTab = {
                tabKind: "editor",
                id: generateTabId(),
                file: { path: null, handle: buffer.fileHandle, name: file.name },
                content: fileContent,
                lastSavedContent: fileContent,
                isDirty: false,
                lastSavedTime: Date.now(),
                lastSaveWasAuto: false,
                isSaving: false,
                isPreview: false,
                fileType: inferFileType(file.name),
                fileSyncStatus: "clean",
                conflictDiskContent: null,
              };
              setWasAutoRecovered(true);
            } catch (error) {
              console.warn("前回のファイルを復元できませんでした:", error);
              await storage.clearEditorBuffer(lastFileKey ?? undefined);
            }
          }
        }

        if (!initialTab && !savedEmpty && (!isElectron || skipAutoRestore)) {
          initialTab = createNewTab();
        }

        if (initialTab) {
          const tab = initialTab;
          setTabs((prev) => (prev.length > 0 ? prev : [tab]));
          setActiveTabId((prev) => (prev === "" ? tab.id : prev));
        }
      } catch (error) {
        console.error("ストレージの初期化に失敗しました:", error);
        const errorTab = createNewTab();
        setTabs((prev) => (prev.length > 0 ? prev : [errorTab]));
        setActiveTabId((prev) => (prev === "" ? errorTab.id : prev));
      } finally {
        if (!isElectron || skipAutoRestore) {
          storageInitializedRef.current = true;
        }
      }
    };

    void initializeStorage();
  }, [isElectron, skipAutoRestore, setTabs, setActiveTabId]);

  // --- Standalone-mode restore from AppState (Electron only) -------------
  // This ONLY handles standalone mode (no project). In project mode,
  // restoreProjectTabs() is called explicitly by the project-open handler,
  // replacing the old mount-time restore that had a race condition with windowKey.

  useEffect(() => {
    if (!isElectron || skipAutoRestore) return;
    if (!window.electronAPI?.vfs?.readFile) return;

    const restoreTabs = async () => {
      try {
        if (vfsReadyPromise) {
          await Promise.race([vfsReadyPromise, new Promise<void>((r) => setTimeout(r, 5000))]);
        }

        // If project tabs were explicitly restored (via restoreProjectTabs),
        // this mount-time path is redundant — skip to prevent double-restore.
        if (projectTabsRestoredRef.current) {
          storageInitializedRef.current = true;
          return;
        }

        // Standalone mode: restore from global AppState / per-window SQLite
        const key = windowKeyRef.current;
        const windowState = await fetchWindowState(key ?? "__global__");
        const openTabs = windowState?.openTabs;
        if (!openTabs) return;
        if (openTabs.tabs.length === 0) return;

        const restoredTabs: EditorTabState[] = [];
        for (const serialized of openTabs.tabs) {
          if (!serialized.filePath) {
            restoredTabs.push(createNewTab(undefined, serialized.fileType ?? ".mdi"));
            continue;
          }
          try {
            const vfs = getVFS();
            const fileContent = await vfs.readFile(serialized.filePath);
            restoredTabs.push({
              tabKind: "editor",
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
              lastSaveWasAuto: false,
              isSaving: false,
              isPreview: serialized.isPreview ?? false,
              fileType: serialized.fileType ?? inferFileType(serialized.fileName),
              fileSyncStatus: "clean",
              conflictDiskContent: null,
            });
          } catch (error) {
            console.warn(`タブの復元に失敗しました (${serialized.filePath}):`, error);
          }
        }

        if (restoredTabs.length > 0) {
          setTabs(restoredTabs);
          const activeIdx = Math.min(openTabs.activeIndex, restoredTabs.length - 1);
          setActiveTabId(restoredTabs[activeIdx].id);
        } else {
          const hadFileBacked = openTabs.tabs.some((t) => Boolean(t.filePath));
          if (hadFileBacked) {
            setRestoreError?.(
              "前回開いていたファイルを復元できませんでした。ファイルが移動または削除された可能性があります。",
            );
            return;
          }
          const defaultTab = createNewTab();
          setTabs((prev) => (prev.length > 0 ? prev : [defaultTab]));
          setActiveTabId((prev) => (prev === "" ? defaultTab.id : prev));
        }
      } catch (error) {
        console.error("タブの復元に失敗しました:", error);
      } finally {
        storageInitializedRef.current = true;
      }
    };

    void restoreTabs();
  }, [isElectron, skipAutoRestore, setTabs, setActiveTabId, vfsReadyPromise, setRestoreError]);

  return { wasAutoRecovered, flushTabState, restoreProjectTabs };
}
