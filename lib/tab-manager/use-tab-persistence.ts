"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getStorageService } from "../storage/storage-service";
import { fetchAppState, persistAppState } from "../storage/app-state-manager";
import type { TabState, SerializedTab, TabPersistenceState, EditorTabState } from "./tab-types";
import { isEditorTab } from "./tab-types";
import type { TabManagerCore } from "./types";
import { TAB_PERSIST_DEBOUNCE, createNewTab, generateTabId, inferFileType } from "./types";
import { getVFS } from "../vfs";

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface UseTabPersistenceParams extends TabManagerCore {
  /** Whether to skip auto-restore on mount. */
  skipAutoRestore: boolean;
  /** Promise that resolves once the VFS root is set (Electron only). */
  vfsReadyPromise?: Promise<void>;
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseTabPersistenceReturn {
  /** Whether the session was auto-recovered from a saved buffer. */
  wasAutoRecovered: boolean;
  /** Immediately flush pending tab state to storage (cancels debounce). */
  flushTabState: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Handles two responsibilities:
 * 1. Persist open tabs to AppState (debounced, Electron only).
 * 2. Restore tabs from AppState / storage on mount.
 *
 * Coordinates with useTabState which starts with an empty tabs array.
 * This hook is responsible for populating the first tab after determining
 * the correct initial state (saved tabs, Web buffer restore, or a blank default).
 */
export function useTabPersistence(params: UseTabPersistenceParams): UseTabPersistenceReturn {
  const {
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    tabsRef,
    activeTabIdRef,
    isElectron,
    skipAutoRestore,
    vfsReadyPromise,
  } = params;

  const [wasAutoRecovered, setWasAutoRecovered] = useState(false);

  // Gate persistence until after the initial restore has completed to
  // prevent the empty initial tabs state from overwriting saved tab data
  // before the async restore path (which may wait on vfsReadyPromise) runs.
  const storageInitializedRef = useRef(false);

  // --- Persist open tabs to AppState (debounced) --------------------------

  const tabPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Build and persist the current tab state immediately. */
  const persistTabStateNow = useCallback(async () => {
    const currentTabs = tabsRef.current;
    const currentActiveId = activeTabIdRef.current;
    const editorTabs = currentTabs.filter(isEditorTab);
    const serializedTabs: SerializedTab[] = editorTabs.map((t) => ({
      filePath: t.file?.path ?? null,
      fileName: t.file?.name ?? "新規ファイル",
      isPreview: t.isPreview || undefined,
      fileType: t.fileType,
    }));
    const activeEditorIndex = editorTabs.findIndex((t) => t.id === currentActiveId);
    const state: TabPersistenceState = {
      tabs: serializedTabs,
      activeIndex: Math.max(0, activeEditorIndex),
    };
    await persistAppState({ openTabs: state });
  }, [tabsRef, activeTabIdRef]);

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
    // This prevents a race on Electron where the 1s debounce fires before
    // restoreTabs finishes awaiting vfsReadyPromise (up to 5s), which would
    // overwrite the saved tabs with [] and cause a blank editor on next open.
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

  // --- Storage initialization & Web file restore --------------------------
  //
  // This effect always ensures at least one tab exists after storage loads.
  // For Electron, restoreTabs (below) may override the tab set here when
  // file-backed saved tabs are found.

  useEffect(() => {
    const initializeStorage = async () => {
      try {
        const storage = getStorageService();
        await storage.initialize();
        const appState = await storage.loadAppState();

        // Check if we have previously saved tab state
        const savedOpenTabs = appState?.openTabs;

        // If saved state explicitly has 0 tabs, restore empty state — no tab needed.
        const savedEmpty = savedOpenTabs && savedOpenTabs.tabs.length === 0;

        // Determine the initial tab using a local variable to make the
        // fallback logic explicit and avoid multiple setTabs calls.
        let initialTab: EditorTabState | null = null;

        if (!skipAutoRestore && !isElectron && !savedEmpty) {
          // Web: restore file handle from editor buffer
          const buffer = await storage.loadEditorBuffer();
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
              await storage.clearEditorBuffer();
            }
          }
        }

        // Fallback: create a default blank tab when no restore path fired.
        // Skip if saved state was explicitly empty (user closed all tabs).
        // For Electron (non-skipAutoRestore), restoreTabs handles the case where
        // file-backed tabs were previously saved; skip creating a fallback here
        // to avoid a visible flash before restoreTabs completes.
        if (!initialTab && !savedEmpty && (!isElectron || skipAutoRestore)) {
          initialTab = createNewTab();
        }

        if (initialTab) {
          const tab = initialTab;
          // Use functional updates so a concurrently-running restoreTabs (Electron)
          // that already set tabs is not overridden.
          setTabs((prev) => (prev.length > 0 ? prev : [tab]));
          setActiveTabId((prev) => (prev === "" ? tab.id : prev));
        }
      } catch (error) {
        console.error("ストレージの初期化に失敗しました:", error);
        // Ensure at least one tab even on storage error
        const errorTab = createNewTab();
        setTabs((prev) => (prev.length > 0 ? prev : [errorTab]));
        setActiveTabId((prev) => (prev === "" ? errorTab.id : prev));
      } finally {
        // For Web (and Electron with skipAutoRestore), restore is complete here.
        // Electron's restoreTabs sets this flag after vfsReadyPromise resolves.
        if (!isElectron || skipAutoRestore) {
          storageInitializedRef.current = true;
        }
      }
    };

    void initializeStorage();
  }, [isElectron, skipAutoRestore, setTabs, setActiveTabId]);

  // --- Restore tabs from AppState on mount (Electron only) ----------------
  // Wait for VFS root to be set so that the main process has a registered
  // allowed root before we attempt vfs:read-file IPC calls.

  useEffect(() => {
    if (!isElectron || skipAutoRestore) return;
    if (!window.electronAPI?.vfs?.readFile) return;

    const restoreTabs = async () => {
      try {
        // Wait for VFS root to be set before reading files (prevents race condition)
        if (vfsReadyPromise) {
          await Promise.race([vfsReadyPromise, new Promise<void>((r) => setTimeout(r, 5000))]);
        }

        const appState = await fetchAppState();
        const openTabs = appState?.openTabs;
        // No saved state at all: first use — initializeStorage handles default tab.
        if (!openTabs) return;

        // Saved state is explicitly empty (user closed all tabs last session).
        if (openTabs.tabs.length === 0) return;

        const restoredTabs: EditorTabState[] = [];
        for (const serialized of openTabs.tabs) {
          if (serialized.filePath) {
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
        }

        if (restoredTabs.length > 0) {
          setTabs(restoredTabs);
          const activeIdx = Math.min(openTabs.activeIndex, restoredTabs.length - 1);
          setActiveTabId(restoredTabs[activeIdx].id);
        } else {
          // Saved tabs were all untitled (no file path) — create a default tab.
          const defaultTab = createNewTab();
          setTabs((prev) => (prev.length > 0 ? prev : [defaultTab]));
          setActiveTabId((prev) => (prev === "" ? defaultTab.id : prev));
        }
      } catch (error) {
        console.error("タブの復元に失敗しました:", error);
      } finally {
        // Allow tab persistence after Electron restore completes (or errors).
        storageInitializedRef.current = true;
      }
    };

    void restoreTabs();
  }, [isElectron, skipAutoRestore, setTabs, setActiveTabId, vfsReadyPromise]);

  return { wasAutoRecovered, flushTabState };
}
