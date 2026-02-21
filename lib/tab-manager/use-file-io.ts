"use client";

import { useCallback, useRef } from "react";
import {
  openMdiFile,
  saveMdiFile,
} from "../mdi-file";
import type { MdiFileDescriptor } from "../mdi-file";
import { notificationManager } from "../notification-manager";
import { getStorageService } from "../storage-service";
import { persistAppState } from "../app-state-manager";
import { getHistoryService } from "../history-service";
import { getVFS } from "../vfs";
import { suppressFileWatch } from "../file-watcher";
import type { SupportedFileExtension } from "../project-types";
import type { TabId, TabState } from "../tab-types";
import {
  generateTabId,
  inferFileType,
  sanitizeMdiContent,
  getErrorMessage,
} from "./types";
import type { TabManagerCore } from "./types";

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface UseFileIOParams extends TabManagerCore {
  updateTab: (tabId: TabId, updates: Partial<TabState>) => void;
  findTabByPath: (path: string) => TabState | undefined;
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
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFileIO(params: UseFileIOParams): UseFileIOReturn {
  const {
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    tabsRef,
    activeTabIdRef,
    isProjectRef,
    isElectron,
    updateTab,
    findTabByPath,
  } = params;

  const isSavingRef = useRef(false);
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

  // --- Auto-snapshot (project mode) ---------------------------------------

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
    [isProjectRef],
  );

  // --- File operations ----------------------------------------------------

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

    const detectedFileType = inferFileType(descriptor.name);

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
        fileType: detectedFileType,
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
        isPreview: false,
        fileType: detectedFileType,
      };
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
    }

    void persistFileReference(descriptor, fileContent);
  }, [findTabByPath, updateTab, persistFileReference, setTabs, setActiveTabId, tabsRef, activeTabIdRef]);

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
          suppressFileWatch(tab.file.path);
          await vfs.writeFile(tab.file.path, sanitized);
          setTabs((prev) =>
            prev.map((t) =>
              t.id === tabId
                ? {
                    ...t,
                    lastSavedContent: sanitized,
                    isDirty: sanitizeMdiContent(t.content) !== sanitized,
                    lastSavedTime: isAutoSave ? -Date.now() : Date.now(),
                    isSaving: false,
                  }
                : t,
            ),
          );
          void tryAutoSnapshot(tab.file.name, sanitized);
          return;
        }

        const result = await saveMdiFile({
          descriptor: tab.file,
          content: sanitized,
          fileType: tab.fileType,
        });

        if (result) {
          setTabs((prev) =>
            prev.map((t) =>
              t.id === tabId
                ? {
                    ...t,
                    file: result.descriptor,
                    lastSavedContent: sanitized,
                    isDirty: sanitizeMdiContent(t.content) !== sanitized,
                    lastSavedTime: isAutoSave ? -Date.now() : Date.now(),
                    isSaving: false,
                  }
                : t,
            ),
          );
          void persistFileReference(result.descriptor, sanitized);
          void tryAutoSnapshot(result.descriptor.name, sanitized);
        } else {
          updateTab(tabId, { isSaving: false });
        }
      } catch (error) {
        console.error("保存に失敗しました:", error);
        updateTab(tabId, { isSaving: false });
        const message = getErrorMessage(error);
        notificationManager.error(`保存に失敗しました: ${message}`);
      } finally {
        isSavingRef.current = false;
      }
    },
    [updateTab, persistFileReference, tryAutoSnapshot, setTabs, tabsRef, activeTabIdRef, isProjectRef],
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

      const result = await saveMdiFile({ descriptor, content: sanitized, fileType: tab.fileType });

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
      notificationManager.error(`名前を付けて保存に失敗しました: ${message}`);
    } finally {
      isSavingRef.current = false;
    }
  }, [updateTab, persistFileReference, tryAutoSnapshot, tabsRef, activeTabIdRef]);

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
      const cur = tabsRef.current.find(
        (t) => t.id === activeTabIdRef.current,
      );
      if (cur && !cur.file && !cur.isDirty) {
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
      const tab: TabState = {
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
        isSaving: false,
        isPreview: false,
        fileType: sysFileType,
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
      const existing = tabsRef.current.find(
        (t) => t.file?.path === vfsPath,
      );
      if (existing) {
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
          return;
        }

        const fileName = vfsPath.split("/").pop() || "無題";
        const vfsFileType = inferFileType(fileName);
        const effectivePreview = openingPathsRef.current.get(vfsPath) ?? preview;

        if (effectivePreview) {
          // Replace existing preview tab, or create new preview tab
          const existingPreview = tabsRef.current.find((t) => t.isPreview);
          if (existingPreview) {
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
        const cur = tabsRef.current.find(
          (t) => t.id === activeTabIdRef.current,
        );
        if (cur && !cur.file && !cur.isDirty) {
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
        const tab: TabState = {
          id: generateTabId(),
          file: { path: vfsPath, handle: null, name: fileName },
          content: fileContent,
          lastSavedContent: fileContent,
          isDirty: false,
          lastSavedTime: Date.now(),
          isSaving: false,
          isPreview: effectivePreview,
          fileType: vfsFileType,
        };
        let existingTabId: TabId | null = null;
        setTabs((prev) => {
          const dup = prev.find((t) => t.file?.path === vfsPath);
          if (dup) {
            existingTabId = dup.id;
            if (!preview && dup.isPreview) {
              return prev.map((t) =>
                t.id === dup.id ? { ...t, isPreview: false } : t,
              );
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
  };
}
