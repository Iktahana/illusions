"use client";

import { useEffect, useRef } from "react";
import { saveMdiFile } from "../project/mdi-file";
import { getVFS } from "../vfs";
import { suppressFileWatch } from "../services/file-watcher";
import { notificationManager } from "../services/notification-manager";
import type { SupportedFileExtension } from "../project/project-types";
import type { TabId, TabState, EditorTabState } from "./tab-types";
import { isEditorTab } from "./tab-types";
import { sanitizeMdiContent } from "./types";
import type { TabManagerCore } from "./types";

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface UseElectronMenuBindingsParams extends TabManagerCore {
  /** Ref holding the latest saveFile function. */
  saveFileRef: React.MutableRefObject<(isAutoSave?: boolean) => Promise<void>>;
  /** Ref holding the latest saveAsFile function. */
  saveAsFileRef: React.MutableRefObject<() => Promise<void>>;
  /** Close tab with dirty check. */
  closeTab: (tabId: TabId) => void;
  /** Create a new empty tab. */
  newTab: (fileType?: SupportedFileExtension) => void;
  /** Load a system file into a tab. */
  loadSystemFile: (path: string, content: string) => void;
  /** Update a single tab by id. */
  updateTab: (tabId: TabId, updates: Partial<EditorTabState>) => void;
  /** Register a handler for system file open events. */
  systemFileOpenHandlerRef: React.MutableRefObject<
    ((path: string, content: string) => void) | null
  >;
  /** Immediately flush pending tab state to storage. */
  flushTabState?: () => Promise<void>;
  /** Immediately flush pending dockview layout to storage. */
  flushLayoutState?: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Registers Electron IPC event listeners for menu commands:
 * - Save, Save As, Close Tab, New Tab, Open File From System
 * - Save before window close
 * - Dirty state → Electron title dot
 * - Web beforeunload warning
 * - Visibility change reload for project mode
 */
export function useElectronMenuBindings(params: UseElectronMenuBindingsParams): void {
  const {
    tabs,
    setTabs,
    tabsRef,
    activeTabIdRef,
    isProjectRef,
    isElectron,
    saveFileRef,
    saveAsFileRef,
    closeTab,
    newTab,
    loadSystemFile,
    updateTab,
    systemFileOpenHandlerRef,
    flushTabState,
    flushLayoutState,
  } = params;

  // Stable refs for callbacks that change frequently
  const closeTabRef = useRef(closeTab);
  closeTabRef.current = closeTab;
  const newTabRef = useRef(newTab);
  newTabRef.current = newTab;

  // Dirty state → Electron title dot
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.setDirty) return;
    const anyDirty = tabs.some((t) => isEditorTab(t) && t.isDirty);
    window.electronAPI.setDirty(anyDirty);
  }, [tabs, isElectron]);

  // Stable refs for flush callbacks
  const flushTabStateRef = useRef(flushTabState);
  flushTabStateRef.current = flushTabState;
  const flushLayoutStateRef = useRef(flushLayoutState);
  flushLayoutStateRef.current = flushLayoutState;

  // Save all dirty tabs before Electron window close
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onSaveBeforeClose) return;

    const cleanup = window.electronAPI.onSaveBeforeClose(async () => {
      // Flush debounced persistence state before saving files
      await Promise.all([flushTabStateRef.current?.(), flushLayoutStateRef.current?.()]);

      let anyFailed = false;

      for (const tab of tabsRef.current) {
        if (!isEditorTab(tab)) continue;
        if (!tab.isDirty) continue;

        // Block save if tab has unresolved external conflict
        if (tab.fileSyncStatus === "conflicted") {
          notificationManager.warning(
            `「${tab.file?.name ?? "無題"}」のファイルが外部で変更されています。コンフリクトを解決してから保存してください。`,
          );
          anyFailed = true;
          continue;
        }

        const sanitized = sanitizeMdiContent(tab.content);

        if (!tab.file) {
          // New unsaved document: show Save As dialog so the user can give it a path.
          // If the user cancels or the save fails, abort the window close.
          try {
            const result = await saveMdiFile({
              descriptor: null,
              content: sanitized,
              fileType: tab.fileType,
            });
            if (!result) {
              // User cancelled the Save As dialog — abort close
              anyFailed = true;
            }
          } catch (error) {
            console.error("名前を付けて保存に失敗しました:", error);
            anyFailed = true;
          }
          continue;
        }

        try {
          if (isProjectRef.current && tab.file.path) {
            const vfs = getVFS();
            suppressFileWatch(tab.file.path);
            await vfs.writeFile(tab.file.path, sanitized);
          } else {
            await saveMdiFile({
              descriptor: tab.file,
              content: sanitized,
            });
          }
        } catch (error) {
          console.error(`保存に失敗しました (${tab.file.name}):`, error);
          anyFailed = true;
        }
      }

      // Only close if every save succeeded; otherwise leave the window open.
      if (!anyFailed) {
        await window.electronAPI?.saveDoneAndClose?.();
      }
    });

    return cleanup;
  }, [isElectron, tabsRef, isProjectRef]);

  // Flush tab/layout state before close (without saving dirty files)
  // This handles: clean close, and "Don't Save" in dirty dialog
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onFlushStateBeforeClose) return;

    const cleanup = window.electronAPI.onFlushStateBeforeClose(async () => {
      await Promise.all([flushTabStateRef.current?.(), flushLayoutStateRef.current?.()]);
      await window.electronAPI?.saveDoneAndClose?.();
    });

    return cleanup;
  }, [isElectron]);

  // System file open (Electron: double-click .mdi etc.)
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onOpenFileFromSystem) return;

    const cleanup = window.electronAPI.onOpenFileFromSystem(({ path, content: fileContent }) => {
      loadSystemFile(path, fileContent);
      // Notify page.tsx for editor key update
      systemFileOpenHandlerRef.current?.(path, fileContent);
    });

    return cleanup;
  }, [isElectron, loadSystemFile, systemFileOpenHandlerRef]);

  // Reload non-dirty tabs when window regains visibility (#98)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden) return;
      if (!isProjectRef.current) return;

      const vfs = getVFS();
      if (!vfs.isRootOpen()) return;

      for (const tab of tabsRef.current) {
        if (!isEditorTab(tab)) continue;
        if (!tab.file?.path || tab.isSaving) continue;
        if (tab.isDirty) continue;
        try {
          const diskContent = await vfs.readFile(tab.file.path);
          if (diskContent !== tab.lastSavedContent) {
            updateTab(tab.id, {
              content: diskContent,
              lastSavedContent: diskContent,
              isDirty: false,
              lastSavedTime: Date.now(),
            });
          }
        } catch {
          // File may have been deleted; skip
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [updateTab, tabsRef, isProjectRef]);

  // Menu: Save
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onMenuSave) return;
    const cleanup = window.electronAPI.onMenuSave(async () => {
      await saveFileRef.current();
    });
    return cleanup;
  }, [isElectron, saveFileRef]);

  // Menu: Save As
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onMenuSaveAs) return;
    const cleanup = window.electronAPI.onMenuSaveAs(async () => {
      await saveAsFileRef.current();
    });
    return cleanup;
  }, [isElectron, saveAsFileRef]);

  // Menu: Close Tab (Cmd+W from Electron menu)
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onMenuCloseTab) return;
    const cleanup = window.electronAPI.onMenuCloseTab(() => {
      const current = tabsRef.current;
      const activeId = activeTabIdRef.current;
      const active = current.find((t) => t.id === activeId);

      // Single empty clean editor tab → close window
      if (
        current.length === 1 &&
        active &&
        isEditorTab(active) &&
        !active.file &&
        !active.isDirty
      ) {
        window.close();
        return;
      }

      closeTabRef.current(activeId);
    });
    return cleanup;
  }, [isElectron, tabsRef, activeTabIdRef]);

  // Menu: New Tab (Cmd+T from Electron menu)
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
      const anyDirty = tabsRef.current.some((t) => isEditorTab(t) && t.isDirty);
      if (anyDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isElectron, tabsRef]);

  // Web: flush tab/layout state when page becomes hidden (covers tab close, navigate away)
  // visibilitychange fires before beforeunload and allows async work
  useEffect(() => {
    if (isElectron) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // Fire-and-forget: flush pending debounced state
        void flushTabStateRef.current?.();
        void flushLayoutStateRef.current?.();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isElectron]);
}
