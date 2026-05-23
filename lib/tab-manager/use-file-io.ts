"use client";

/** Warning message shown when file handle persistence fails. */
const PERSIST_FAILURE_WARNING = "ファイル参照の保存に失敗しました";

import { useCallback, useRef } from "react";
import { openMdiFile } from "../project/mdi-file";
import type { MdiFileDescriptor } from "../project/mdi-file";
import { notificationManager } from "../services/notification-manager";
import { getStorageService } from "../storage/storage-service";
import { persistAppState } from "../storage/app-state-manager";
import { getVFS } from "../vfs";
import type { TabId, EditorTabState } from "./tab-types";
import { isEditorTab } from "./tab-types";
import { generateTabId, inferFileType } from "./types";
import type { TabManagerCore } from "./types";

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface UseFileIOParams extends TabManagerCore {
  updateTab: (tabId: TabId, updates: Partial<EditorTabState>) => void;
  findTabByPath: (path: string) => EditorTabState | undefined;
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseFileIOReturn {
  /** Open a file via system dialog into a new/reused tab. */
  openFile: () => Promise<void>;
  /** Save the active tab. */
  saveFile: (isAutoSave?: boolean) => Promise<void>;
  /** Save As (always shows dialog). */
  saveAsFile: () => Promise<void>;
  /** Load a system file by path + content into a tab. */
  loadSystemFile: (path: string, content: string) => void;
  /** Open a file from the project VFS into a tab. */
  openProjectFile: (vfsPath: string, options?: { preview?: boolean }) => Promise<void>;
  /** Ref holding the latest saveFile function. */
  saveFileRef: React.MutableRefObject<(isAutoSave?: boolean) => Promise<void>>;
  /** Ref holding the latest saveAsFile function. */
  saveAsFileRef: React.MutableRefObject<() => Promise<void>>;
  /** Create an auto-snapshot if conditions are met (project mode only). */
  tryAutoSnapshot: (
    sourcePath: string,
    displayName: string,
    savedContent: string,
    forceSnapshot?: boolean,
  ) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFileIO(params: UseFileIOParams): UseFileIOReturn {
  const {
    setTabs,
    setActiveTabId,
    tabsRef,
    activeTabIdRef,
    isProjectRef,
    isElectron,
    updateTab,
    findTabByPath,
  } = params;

  const openingPathsRef = useRef(new Map<string, boolean>());

  // --- Persist helpers ----------------------------------------------------

  const persistLastOpenedPath = useCallback(async (path: string) => {
    try {
      await persistAppState({ lastOpenedMdiPath: path });
    } catch (error) {
      console.error("最後に開いたパスの保存に失敗しました:", error);
    }
  }, []);

  const persistFileReference = useCallback(
    async (descriptor: MdiFileDescriptor, fileContent: string): Promise<boolean> => {
      try {
        if (isElectron && descriptor.path) {
          await persistLastOpenedPath(descriptor.path);
        } else if (!isElectron && descriptor.handle) {
          const storage = getStorageService();
          await storage.initialize();
          // Use the file name as the key to prevent cross-tab collisions when
          // multiple browser tabs open different files simultaneously.
          const fileKey = descriptor.handle.name;
          await storage.saveEditorBuffer(
            {
              content: fileContent,
              timestamp: Date.now(),
              fileHandle: descriptor.handle,
            },
            fileKey,
          );
          // Record which fileKey this tab last used so restore can look it up.
          await storage.setItem("last_editor_buffer_key", fileKey);
        }
        return true;
      } catch (error) {
        console.error("ファイル参照の保存に失敗しました:", error);
        return false;
      }
    },
    [isElectron, persistLastOpenedPath],
  );

  // --- Auto-snapshot (project mode) ---------------------------------------
  // NOTE: Phase 2 no-op shim. Will be re-implemented in Phase 8.

  const tryAutoSnapshot = useCallback(
    async (
      _sourcePath: string,
      _displayName: string,
      _savedContent: string,
      _forceSnapshot: boolean = false,
    ) => {
      // no-op: Phase 8 will re-implement snapshot logic
    },
    [],
  );

  // --- File operations ----------------------------------------------------

  /** Open a file — Phase 3 no-op shim. Will be re-implemented in Phase 7-8. */
  const openFile = useCallback(async () => {
    // no-op: Phase 7-8 で新 IO 抽象経由で再実装する
  }, []);

  /** Save the active tab — Phase 2 no-op shim. Will be re-implemented in Phase 8. */
  const saveFile = useCallback(async (_isAutoSave: boolean = false) => {
    // no-op: Phase 8 will re-implement save logic
  }, []);

  /** Save As (always shows dialog) — Phase 2 no-op shim. Will be re-implemented in Phase 8. */
  const saveAsFile = useCallback(async () => {
    // no-op: Phase 8 will re-implement save-as logic
  }, []);

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

      const sysFileName = path.split("/").pop() || "無題";
      const sysFileType = inferFileType(sysFileName);

      // Reuse current tab if untitled and clean
      const cur = tabsRef.current.find((t) => t.id === activeTabIdRef.current);
      if (cur && isEditorTab(cur) && !cur.file && !cur.isDirty) {
        updateTab(cur.id, {
          file: {
            path,
            handle: null,
            name: sysFileName,
          },
          content: fileContent,
          lastSavedContent: fileContent,
          isDirty: false,
          lastSavedTime: Date.now(),
          fileType: sysFileType,
        });
        return;
      }

      // New tab
      const tab: EditorTabState = {
        tabKind: "editor",
        id: generateTabId(),
        file: {
          path,
          handle: null,
          name: sysFileName,
        },
        content: fileContent,
        lastSavedContent: fileContent,
        isDirty: false,
        lastSavedTime: Date.now(),
        lastSaveWasAuto: false,
        isSaving: false,
        isPreview: false,
        fileType: sysFileType,
        fileSyncStatus: "clean",
        conflictDiskContent: null,
      };
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
    },
    [findTabByPath, updateTab, setTabs, setActiveTabId, tabsRef, activeTabIdRef],
  );

  /** Open a file from the project VFS — Phase 3 no-op shim. Will be re-implemented in Phase 7-9. */
  const openProjectFile = useCallback(
    async (_vfsPath: string, _options?: { preview?: boolean }) => {
      // no-op: Phase 7-9 で新 IO 抽象経由で再実装する
    },
    [],
  );

  // --- Refs for stable references in effects ------------------------------

  const saveFileRef = useRef(saveFile);
  saveFileRef.current = saveFile;

  const saveAsFileRef = useRef(saveAsFile);
  saveAsFileRef.current = saveAsFile;

  return {
    openFile,
    saveFile,
    saveAsFile,
    loadSystemFile,
    openProjectFile,
    saveFileRef,
    saveAsFileRef,
    tryAutoSnapshot,
  };
}
