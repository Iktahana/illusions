"use client";

import { useEffect, useRef } from "react";
import { getProjectFileService } from "../services/project-file-service";
import { notificationManager } from "../services/notification-manager";
import { executeTabSave } from "./save-executor";
import { isEditorTab } from "./tab-types";
import { getErrorMessage } from "./types";
import type { SnapshotType } from "../services/history-policy";
import type { SupportedFileExtension } from "../project/project-types";
import type { TabId, EditorTabState } from "./tab-types";
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
  /**
   * Ref holding the active editor's on-demand live-content flush (#1840).
   * Used to flush the active tab before the quit-and-install save path so it
   * does not persist debounce-lagged content (review Finding 1).
   */
  flushActiveEditorRef?: React.MutableRefObject<(() => string | null) | null>;
  /** Immediately flush pending tab state to storage. */
  flushTabState?: () => Promise<void>;
  /** Immediately flush pending dockview layout to storage. */
  flushLayoutState?: () => Promise<void>;
  /**
   * Create a history snapshot with the given type (project mode only).
   * B1 fix: caller supplies the correct SnapshotType.
   */
  tryCreateSnapshot?: (
    type: SnapshotType,
    sourcePath: string,
    displayName: string,
    savedContent: string,
  ) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Registers Electron IPC event listeners for menu commands:
 * - Save, Save As, Close Tab, New Tab, Open File From System
 * - Save before window close (pre-close snapshot)
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
    flushActiveEditorRef,
    flushTabState,
    flushLayoutState,
    tryCreateSnapshot,
  } = params;

  // Stable refs for callbacks that change frequently
  const closeTabRef = useRef(closeTab);
  // eslint-disable-next-line react-hooks/refs
  closeTabRef.current = closeTab;
  const newTabRef = useRef(newTab);
  // eslint-disable-next-line react-hooks/refs
  newTabRef.current = newTab;

  // Dirty state → Electron title dot
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.setDirty) return;
    const anyDirty = tabs.some((t) => isEditorTab(t) && t.isDirty);
    window.electronAPI.setDirty(anyDirty);
  }, [tabs, isElectron]);

  // Stable refs for flush callbacks
  const flushTabStateRef = useRef(flushTabState);
  // eslint-disable-next-line react-hooks/refs
  flushTabStateRef.current = flushTabState;
  const flushLayoutStateRef = useRef(flushLayoutState);
  // eslint-disable-next-line react-hooks/refs
  flushLayoutStateRef.current = flushLayoutState;
  const tryCreateSnapshotRef = useRef(tryCreateSnapshot);
  tryCreateSnapshotRef.current = tryCreateSnapshot;

  // Save all dirty tabs before Electron window close (3-button dialog "保存" path)
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onSaveBeforeClose) return;

    const cleanup = window.electronAPI.onSaveBeforeClose(async () => {
      // #1839 (review Finding 3): if anything in here throws before we signal
      // main, the quit-and-install flow would hang forever. Wrap the whole body
      // and fall back to notifyCloseAborted on error (quit cancelled, data safe).
      try {
        // Flush debounced persistence state before saving files
        await Promise.all([flushTabStateRef.current?.(), flushLayoutStateRef.current?.()]);

        let anyFailed = false;
        // #1840 (review Finding 1): flush the active editor's live content so the
        // quit-save path doesn't persist debounce-lagged content.
        const flush = flushActiveEditorRef?.current ?? null;

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

          // New unsaved document: the executor shows the Save As dialog so the
          // user can give it a path. Cancelling aborts the window close.
          const isNewDocument = !tab.file;

          // Active tab: override with the live (flushed) content. flush() returns
          // null on empty-remount transients, so we fall back to tab.content.
          let tabToSave = tab;
          if (tab.id === activeTabIdRef.current && flush) {
            const live = flush();
            if (live != null && live !== tab.content) {
              tabToSave = { ...tab, content: live };
            }
          }

          const outcome = await executeTabSave({
            tab: tabToSave,
            isProject: isProjectRef.current,
            tabsRef,
            setTabs,
            tryCreateSnapshot: tryCreateSnapshotRef.current ?? (async () => {}),
            // B1 fix: window close "保存" → "pre-close" snapshot type.
            // New documents get no snapshot (matches pre-refactor behavior).
            snapshotType: isNewDocument ? undefined : "pre-close",
            // Pre-close snapshots fall back to the file name when no path exists
            snapshotPathFallback: "name",
            // Already-titled tabs get no tab-state update — the window is about
            // to close. New documents do: the newly-assigned file descriptor
            // must be written back so flushTabState persists the saved path.
            updateTabState: isNewDocument,
          });

          if (outcome.status === "saved") {
            if (isNewDocument) {
              // Re-flush so the persisted session reflects the new file path.
              await flushTabStateRef.current?.();
            }
            continue;
          }

          // "cancelled" / "failed" / "locked" / "conflicted" / "skipped":
          // the content was not (or may not have been) written — abort close.
          if (outcome.status === "failed") {
            console.error(`保存に失敗しました (${tab.file?.name ?? "無題"}):`, outcome.error);
            notificationManager.error(
              `保存に失敗しました: ${getErrorMessage(outcome.error)}（アプリは終了しません）`,
            );
          }
          anyFailed = true;
        }

        // Only close if every save succeeded; otherwise leave the window open.
        if (!anyFailed) {
          await window.electronAPI?.saveDoneAndClose?.();
        } else {
          // #1839: signal main that this close was aborted (save failed/conflict)
          // so the quit-and-install flow stops waiting for a window that will not
          // close, instead of hanging the update.
          window.electronAPI?.notifyCloseAborted?.();
        }
      } catch (err) {
        console.error("終了前の保存処理でエラーが発生しました:", err);
        // Never leave main hanging: abort the close (window stays, data safe).
        window.electronAPI?.notifyCloseAborted?.();
      }
    });

    return cleanup;
  }, [isElectron, tabsRef, activeTabIdRef, flushActiveEditorRef, isProjectRef, setTabs]);

  // Flush tab/layout state before close (without saving dirty files)
  // This handles: clean close, and "Don't Save" in dirty dialog
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onFlushStateBeforeClose) return;

    const cleanup = window.electronAPI.onFlushStateBeforeClose(async () => {
      // #1839 (review Finding 4): a flush failure must not prevent the close
      // handshake from completing, or main hangs. State flush is non-fatal here.
      try {
        await Promise.all([flushTabStateRef.current?.(), flushLayoutStateRef.current?.()]);
      } catch (err) {
        console.error("終了前の状態フラッシュでエラーが発生しました:", err);
      }
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

      const vfs = getProjectFileService();
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
              // Signal the active Milkdown editor to reload with the new content.
              // Background tabs will naturally use the updated content on remount;
              // the active editor needs this field in its React key to force remount.
              pendingExternalContent: diskContent,
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

  // Menu: Save (Cmd+S)
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onMenuSave) return;
    const cleanup = window.electronAPI.onMenuSave(async () => {
      await saveFileRef.current();
    });
    return cleanup;
  }, [isElectron, saveFileRef]);

  // Menu: Save As (Cmd+Shift+S)
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
