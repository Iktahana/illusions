"use client";

import { useEffect, useRef, useState } from "react";
import { getStorageService } from "../storage-service";
import { fetchAppState, persistAppState } from "../app-state-manager";
import type { TabState, SerializedTab, TabPersistenceState } from "../tab-types";
import type { TabManagerCore } from "./types";
import {
  DEMO_FILE_NAME,
  TAB_PERSIST_DEBOUNCE,
  generateTabId,
  inferFileType,
  loadDemoContent,
} from "./types";

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
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Handles two responsibilities:
 * 1. Persist open tabs to AppState (debounced, Electron only).
 * 2. Restore tabs from AppState / storage on mount.
 */
export function useTabPersistence(params: UseTabPersistenceParams): UseTabPersistenceReturn {
  const {
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    isElectron,
    skipAutoRestore,
    vfsReadyPromise,
  } = params;

  const [wasAutoRecovered, setWasAutoRecovered] = useState(false);

  // --- Persist open tabs to AppState (debounced) --------------------------

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
        isPreview: t.isPreview || undefined,
        fileType: t.fileType,
      }));
      const activeIndex = tabs.findIndex((t) => t.id === activeTabId);
      const state: TabPersistenceState = {
        tabs: serializedTabs,
        activeIndex: Math.max(0, activeIndex),
      };
      void persistAppState({ openTabs: state }).catch((error) => {
        console.error("タブ状態の保存に失敗しました:", error);
      });
    }, TAB_PERSIST_DEBOUNCE);

    return () => {
      if (tabPersistTimerRef.current) {
        clearTimeout(tabPersistTimerRef.current);
      }
    };
  }, [tabs, activeTabId, isElectron]);

  // --- Storage initialization & demo content ------------------------------

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
                          fileType: inferFileType(file.name),
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
                        fileType: inferFileType(DEMO_FILE_NAME),
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
  }, [isElectron, skipAutoRestore, setTabs]);

  // --- Restore tabs from AppState on mount (Electron only) ----------------

  useEffect(() => {
    if (!isElectron || skipAutoRestore) return;
    if (!window.electronAPI?.vfs?.readFile) return;

    const restoreTabs = async () => {
      try {
        // Wait for VFS root to be set before reading files (prevents race condition)
        if (vfsReadyPromise) {
          await Promise.race([
            vfsReadyPromise,
            new Promise<void>((r) => setTimeout(r, 5000)),
          ]);
        }

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
                isPreview: serialized.isPreview ?? false,
                fileType: serialized.fileType ?? inferFileType(serialized.fileName),
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
  }, [isElectron, skipAutoRestore, setTabs, setActiveTabId, vfsReadyPromise]);

  return { wasAutoRecovered };
}
