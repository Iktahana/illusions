"use client";

import { useEffect, useRef } from "react";
import { saveMdiFile } from "../project/mdi-file";
import { getVFS } from "../vfs";
import { suppressFileWatch } from "../services/file-watcher";
import { notificationManager } from "../services/notification-manager";
import { isEditorTab } from "./tab-types";
import type { TabManagerCore } from "./types";
import { AUTO_SAVE_INTERVAL, sanitizeMdiContent } from "./types";

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface UseAutoSaveParams extends TabManagerCore {
  /** Whether auto-save is enabled. */
  autoSaveEnabled: boolean;
  /** Ref holding the latest saveFile function (for active tab). */
  saveFileRef: React.MutableRefObject<(isAutoSave?: boolean) => Promise<void>>;
  /** Create an auto-snapshot if conditions are met (project mode only). */
  tryAutoSnapshot: (sourcePath: string, displayName: string, savedContent: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages the auto-save timer that periodically saves all dirty tabs
 * that have associated file descriptors.
 */
export function useAutoSave(params: UseAutoSaveParams): void {
  const {
    setTabs,
    tabsRef,
    activeTabIdRef,
    isProjectRef,
    autoSaveEnabled,
    saveFileRef,
    tryAutoSnapshot,
  } = params;

  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const savingTabIdsRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

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
        // Skip non-editor tabs (terminal, diff) and conflicted editor tabs
        if (!isEditorTab(tab)) continue;
        if (tab.fileSyncStatus === "conflicted") continue;
        if (!tab.isDirty || !tab.file || tab.isSaving) continue;

        // Active tab: use the normal saveFile path
        if (tab.id === activeTabIdRef.current) {
          void saveFileRef.current(true);
          continue;
        }
        // Synchronous guard to prevent concurrent saves for the same tab
        if (savingTabIdsRef.current.has(tab.id)) continue;
        savingTabIdsRef.current.add(tab.id);

        // Non-active dirty tabs: save directly
        // Set isSaving before starting async operation to prevent concurrent saves
        setTabs((prev) => prev.map((t) => (t.id === tab.id ? { ...t, isSaving: true } : t)));
        void (async () => {
          try {
            const sanitized = sanitizeMdiContent(tab.content);
            if (isProjectRef.current && tab.file?.path) {
              const vfs = getVFS();
              suppressFileWatch(tab.file.path);
              await vfs.writeFile(tab.file.path, sanitized);
              if (!mountedRef.current) return;
              setTabs((prev) =>
                prev.map((t) =>
                  t.id === tab.id && isEditorTab(t)
                    ? {
                        ...t,
                        lastSavedContent: sanitized,
                        isDirty: sanitizeMdiContent(t.content) !== sanitized,
                        lastSavedTime: Date.now(),
                        lastSaveWasAuto: true,
                        fileSyncStatus: "clean",
                        conflictDiskContent: null,
                      }
                    : t,
                ),
              );
              await tryAutoSnapshot(tab.file.path, tab.file.name, sanitized);
            } else if (tab.file?.path || tab.file?.handle) {
              const result = await saveMdiFile({
                descriptor: tab.file,
                content: sanitized,
                fileType: tab.fileType,
              });
              if (result) {
                if (!mountedRef.current) return;
                setTabs((prev) =>
                  prev.map((t) =>
                    t.id === tab.id && isEditorTab(t)
                      ? {
                          ...t,
                          file: result.descriptor,
                          lastSavedContent: sanitized,
                          isDirty: sanitizeMdiContent(t.content) !== sanitized,
                          lastSavedTime: Date.now(),
                          lastSaveWasAuto: true,
                          fileSyncStatus: "clean",
                          conflictDiskContent: null,
                        }
                      : t,
                  ),
                );
                if (result.descriptor.path) {
                  await tryAutoSnapshot(result.descriptor.path, result.descriptor.name, sanitized);
                }
              }
            }
          } catch (error) {
            console.error(`自動保存に失敗しました (${tab.file?.name}):`, error);
            notificationManager.warning(
              `自動保存に失敗しました: ${tab.file?.name ?? "不明なファイル"}`,
            );
          } finally {
            savingTabIdsRef.current.delete(tab.id);
            if (!mountedRef.current) return;
            setTabs((prev) => prev.map((t) => (t.id === tab.id ? { ...t, isSaving: false } : t)));
          }
        })();
      }
    }, AUTO_SAVE_INTERVAL);

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
    };
  }, [
    autoSaveEnabled,
    setTabs,
    tabsRef,
    activeTabIdRef,
    isProjectRef,
    saveFileRef,
    tryAutoSnapshot,
  ]);
}
