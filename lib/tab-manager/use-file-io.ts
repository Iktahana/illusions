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

  /** Open a file via system dialog → new tab (or reuse untitled clean tab) */
  const openFile = useCallback(async () => {
    const result = await openMdiFile();
    if (!result) return;

    const { descriptor, content: fileContent } = result;

    // Deduplicate: if the same path is already open, reload from disk and activate
    if (descriptor.path) {
      const existing = findTabByPath(descriptor.path);
      if (existing) {
        // Force-refresh tab content so stale in-memory state is replaced with the
        // latest content that was just read from disk by openMdiFile().
        updateTab(existing.id, {
          content: fileContent,
          lastSavedContent: fileContent,
          isDirty: false,
        });
        setActiveTabId(existing.id);
        return;
      }
    }

    const detectedFileType = inferFileType(descriptor.name);

    // Reuse current tab if untitled and clean
    const cur = tabsRef.current.find((t) => t.id === activeTabIdRef.current);
    if (cur && isEditorTab(cur) && !cur.file && !cur.isDirty) {
      updateTab(cur.id, {
        file: descriptor,
        content: fileContent,
        lastSavedContent: fileContent,
        isDirty: false,
        lastSavedTime: Date.now(),
        fileType: detectedFileType,
      });
    } else {
      const tab: EditorTabState = {
        tabKind: "editor",
        id: generateTabId(),
        file: descriptor,
        content: fileContent,
        lastSavedContent: fileContent,
        isDirty: false,
        lastSavedTime: Date.now(),
        lastSaveWasAuto: false,
        isSaving: false,
        isPreview: false,
        fileType: detectedFileType,
        fileSyncStatus: "clean",
        conflictDiskContent: null,
      };
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
    }

    void (async () => {
      const ok = await persistFileReference(descriptor, fileContent);
      if (!ok) notificationManager.warning(PERSIST_FAILURE_WARNING);
    })();
  }, [
    findTabByPath,
    updateTab,
    persistFileReference,
    setTabs,
    setActiveTabId,
    tabsRef,
    activeTabIdRef,
  ]);

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

  /** Open a file from the project VFS into a tab */
  const openProjectFile = useCallback(
    async (vfsPath: string, options?: { preview?: boolean }) => {
      const preview = options?.preview ?? false;

      // Deduplicate: if already open, switch to it
      const existing = tabsRef.current.find((t) => isEditorTab(t) && t.file?.path === vfsPath);
      if (existing && isEditorTab(existing)) {
        setActiveTabId(existing.id);
        // If double-click on existing preview tab, pin it
        if (!preview && existing.isPreview) {
          updateTab(existing.id, { isPreview: false });
        }
        return;
      }

      // Prevent concurrent opens of the same path (race between click → double-click).
      // Use Map to track preview intent: if a non-preview open arrives while a
      // preview open is in-flight, the AND logic ensures the tab is pinned.
      const existingIntent = openingPathsRef.current.get(vfsPath);
      if (existingIntent !== undefined) {
        // Merge intent: non-preview (false) wins via AND
        openingPathsRef.current.set(vfsPath, existingIntent && preview);
        return;
      }
      openingPathsRef.current.set(vfsPath, preview);

      try {
        // Read file from VFS
        let fileContent: string;
        try {
          const vfs = getVFS();
          fileContent = await vfs.readFile(vfsPath);
        } catch (error) {
          console.error("ファイルの読み込みに失敗しました:", error);
          notificationManager.error(
            `ファイルを開けませんでした: ${vfsPath.split("/").pop() || vfsPath}`,
          );
          return;
        }

        const fileName = vfsPath.split("/").pop() || "無題";
        const vfsFileType = inferFileType(fileName);
        const effectivePreview = openingPathsRef.current.get(vfsPath) ?? preview;

        if (effectivePreview) {
          // Replace existing preview tab, or create new preview tab
          const existingPreview = tabsRef.current.find((t) => isEditorTab(t) && t.isPreview);
          if (existingPreview && isEditorTab(existingPreview)) {
            updateTab(existingPreview.id, {
              file: { path: vfsPath, handle: null, name: fileName },
              content: fileContent,
              lastSavedContent: fileContent,
              isDirty: false,
              lastSavedTime: Date.now(),
              isPreview: true,
              fileType: vfsFileType,
            });
            setActiveTabId(existingPreview.id);
            return;
          }
        }

        // Reuse current tab if untitled and clean
        const cur = tabsRef.current.find((t) => t.id === activeTabIdRef.current);
        if (cur && isEditorTab(cur) && !cur.file && !cur.isDirty) {
          updateTab(cur.id, {
            file: { path: vfsPath, handle: null, name: fileName },
            content: fileContent,
            lastSavedContent: fileContent,
            isDirty: false,
            lastSavedTime: Date.now(),
            isPreview: effectivePreview,
            fileType: vfsFileType,
          });
          return;
        }

        // New tab — with atomic dedup guard inside the updater
        const tab: EditorTabState = {
          tabKind: "editor",
          id: generateTabId(),
          file: { path: vfsPath, handle: null, name: fileName },
          content: fileContent,
          lastSavedContent: fileContent,
          isDirty: false,
          lastSavedTime: Date.now(),
          lastSaveWasAuto: false,
          isSaving: false,
          isPreview: effectivePreview,
          fileType: vfsFileType,
          fileSyncStatus: "clean",
          conflictDiskContent: null,
        };
        let existingTabId: TabId | null = null;
        setTabs((prev) => {
          const dup = prev.find((t) => isEditorTab(t) && t.file?.path === vfsPath);
          if (dup && isEditorTab(dup)) {
            existingTabId = dup.id;
            if (!preview && dup.isPreview) {
              return prev.map((t) => (t.id === dup.id ? { ...t, isPreview: false } : t));
            }
            return prev;
          }
          return [...prev, tab];
        });
        setActiveTabId(existingTabId ?? tab.id);
      } finally {
        openingPathsRef.current.delete(vfsPath);
      }
    },
    [updateTab, setTabs, setActiveTabId, tabsRef, activeTabIdRef],
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
