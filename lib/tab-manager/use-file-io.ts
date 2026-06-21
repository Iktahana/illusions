"use client";

/** Warning message shown when file handle persistence fails. */
const PERSIST_FAILURE_WARNING = "ファイル参照の保存に失敗しました";

import { useCallback, useRef } from "react";
import { openMdiFile } from "../project/mdi-file";
import type { MdiFileDescriptor } from "../project/mdi-file";
import { notificationManager } from "../services/notification-manager";
import { getStorageService } from "../storage/storage-service";
import { persistAppState } from "../storage/app-state-manager";
import { getHistoryService } from "../services/history-service";
import type { SnapshotType } from "../services/history-policy";
import { getProjectFileService } from "../services/project-file-service";
import { executeTabSave } from "./save-executor";
import type { TabId, EditorTabState } from "./tab-types";
import { isEditorTab } from "./tab-types";
import { generateTabId, inferFileType, getErrorMessage } from "./types";
import { isEditableExtension, resolveNativePath } from "./open-with-default-app";
import type { TabManagerCore } from "./types";

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface UseFileIOParams extends TabManagerCore {
  updateTab: (tabId: TabId, updates: Partial<EditorTabState>) => void;
  findTabByPath: (path: string) => EditorTabState | undefined;
  /**
   * Ref holding the active editor's on-demand live-content flush (#1840).
   * Called right before saving the active tab so the persisted content reflects
   * the live editor doc rather than the debounce-lagged `tab.content`.
   */
  flushActiveEditorRef?: React.MutableRefObject<(() => string | null) | null>;
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
  /**
   * Create a history snapshot with the given type (project mode only).
   * B1 fix: caller supplies the correct SnapshotType instead of hardcoding "auto".
   */
  tryCreateSnapshot: (
    type: SnapshotType,
    sourcePath: string,
    displayName: string,
    savedContent: string,
  ) => Promise<void>;
  /**
   * @deprecated Use tryCreateSnapshot instead.
   * Kept for backward-compat callers that haven't been updated yet.
   */
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
    flushActiveEditorRef,
  } = params;

  /**
   * Flush the live editor content for the active tab and return a tab snapshot
   * with the up-to-date content (#1840). For non-active tabs (no mounted
   * editor) the tab is returned unchanged. The flush also pushes the live
   * value through onChange so React state / isDirty recomputation stays
   * consistent with what is written to disk.
   */
  const flushActiveTabContent = useCallback(
    (tab: EditorTabState): EditorTabState => {
      if (tab.id !== activeTabIdRef.current) return tab;
      const flush = flushActiveEditorRef?.current;
      if (!flush) return tab;
      const live = flush();
      if (live == null || live === tab.content) return tab;
      return { ...tab, content: live };
    },
    [activeTabIdRef, flushActiveEditorRef],
  );

  const isSavingRef = useRef(false);
  const openingPathsRef = useRef(new Map<string, boolean>());
  /**
   * Monotonically increasing counter for openProjectFile calls (#1917).
   * Each invocation captures the current counter value before its async
   * readFile await; after the await it checks whether a newer open has
   * superseded it.  Stale opens skip setActiveTabId and the reuse-current-tab
   * branch so the last-clicked file always wins.
   */
  const latestOpenRequestRef = useRef(0);

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

  // --- Snapshot (project mode) — B1 fix ----------------------------------

  /**
   * Create a snapshot with the caller-supplied type (B1 fix).
   *
   * - For "auto": respects throttle via historyService.shouldCreateSnapshot().
   * - For all other types (manual, pre-close, …): always creates a snapshot.
   *
   * Requires project mode and an open VFS root; silently no-ops otherwise.
   */
  const tryCreateSnapshot = useCallback(
    async (type: SnapshotType, sourcePath: string, displayName: string, savedContent: string) => {
      if (!isProjectRef.current) return;
      if (!getProjectFileService().isRootOpen()) return;
      try {
        const historyService = getHistoryService();
        // Only "auto" is throttled; all other types always create a snapshot.
        if (type === "auto") {
          const shouldCreate = await historyService.shouldCreateSnapshot(sourcePath);
          if (!shouldCreate) return;
        }
        await historyService.createSnapshot({
          sourcePath,
          displayName,
          content: savedContent,
          type, // ← caller-supplied, not hardcoded (B1 fix)
        });
      } catch (error) {
        console.warn("スナップショットの作成に失敗しました:", error);
      }
    },
    [isProjectRef],
  );

  /**
   * @deprecated Backward-compat shim — delegates to tryCreateSnapshot.
   * Callers that still use the old forceSnapshot=true/false convention:
   *   forceSnapshot=true  → type "manual"
   *   forceSnapshot=false → type "auto"
   */
  const tryAutoSnapshot = useCallback(
    async (
      sourcePath: string,
      displayName: string,
      savedContent: string,
      forceSnapshot: boolean = false,
    ) => {
      const type: SnapshotType = forceSnapshot ? "manual" : "auto";
      await tryCreateSnapshot(type, sourcePath, displayName, savedContent);
    },
    [tryCreateSnapshot],
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

  /** Save the active tab */
  const saveFile = useCallback(
    async (isAutoSave: boolean = false) => {
      if (isSavingRef.current) return;

      const tabId = activeTabIdRef.current;
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (!tab) return;
      // Only editor tabs can be saved
      if (!isEditorTab(tab)) return;

      // Block save if tab has unresolved external conflict
      if (tab.fileSyncStatus === "conflicted") {
        notificationManager.warning(
          "ファイルが外部で変更されています。保存する前にコンフリクトを解決してください。",
        );
        return;
      }

      isSavingRef.current = true;
      try {
        // #1840: serialize the live editor doc before saving so we never write
        // debounce-lagged content (and applySavedTabState compares correctly).
        const tabToSave = flushActiveTabContent(tab);
        const outcome = await executeTabSave({
          tab: tabToSave,
          isProject: isProjectRef.current,
          tabsRef,
          setTabs,
          tryCreateSnapshot,
          // B1 fix: Cmd+S / menu → "manual"; auto-save timer → "auto"
          snapshotType: isAutoSave ? "auto" : "manual",
          isAutoSave,
          updateProjectMetadata: true,
          persistFileReference,
        });

        if (outcome.status === "saved" && outcome.persistFailed) {
          notificationManager.warning(PERSIST_FAILURE_WARNING);
        } else if (outcome.status === "conflicted") {
          notificationManager.warning(
            "ファイルが外部で変更されています。保存する前にコンフリクトを解決してください。",
          );
        } else if (outcome.status === "failed") {
          console.error("保存に失敗しました:", outcome.error);
          notificationManager.error(`保存に失敗しました: ${getErrorMessage(outcome.error)}`);
        }
        // "cancelled" / "locked" / "skipped": nothing to do
      } finally {
        isSavingRef.current = false;
      }
    },
    [
      persistFileReference,
      tryCreateSnapshot,
      setTabs,
      tabsRef,
      activeTabIdRef,
      isProjectRef,
      flushActiveTabContent,
    ],
  );

  /** Save As (always shows dialog) */
  const saveAsFile = useCallback(async () => {
    if (isSavingRef.current) return;

    const tabId = activeTabIdRef.current;
    const tab = tabsRef.current.find((t) => t.id === tabId);
    if (!tab) return;
    // Only editor tabs can be saved
    if (!isEditorTab(tab)) return;

    isSavingRef.current = true;
    try {
      // #1840: flush live editor content before Save As as well.
      const tabToSave = flushActiveTabContent(tab);
      const outcome = await executeTabSave({
        tab: tabToSave,
        isProject: isProjectRef.current,
        tabsRef,
        setTabs,
        tryCreateSnapshot,
        // B1 fix: Save As is always a manual user action
        snapshotType: "manual",
        forceDialog: true,
        // Save As targets a new file, so a conflict on the original is moot
        recheckConflict: false,
        persistFileReference,
      });

      if (outcome.status === "saved" && outcome.persistFailed) {
        notificationManager.warning(PERSIST_FAILURE_WARNING);
      } else if (outcome.status === "failed") {
        console.error("名前を付けて保存に失敗しました:", outcome.error);
        notificationManager.error(
          `名前を付けて保存に失敗しました: ${getErrorMessage(outcome.error)}`,
        );
      }
      // "cancelled" / "locked": nothing to do
    } finally {
      isSavingRef.current = false;
    }
  }, [
    setTabs,
    persistFileReference,
    tryCreateSnapshot,
    tabsRef,
    activeTabIdRef,
    isProjectRef,
    flushActiveTabContent,
  ]);

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

      // Capture a monotonic request ID so that if another openProjectFile call
      // arrives before this one's readFile resolves, the stale resolution will
      // not activate its tab and overwrite the newer selection (#1917).
      const requestId = ++latestOpenRequestRef.current;

      // Unsupported extensions open with the OS default app instead of the editor.
      // The editor only handles .mdi / .md / .txt; anything else (e.g. .docx, .pdf,
      // .gdoc) is delegated to shell.openPath via the open-with-default-app IPC.
      const baseName = vfsPath.split("/").pop() || vfsPath;
      if (!isEditableExtension(vfsPath) && window.electronAPI?.openWithDefaultApp) {
        const rootPath = getProjectFileService().getRootPath?.() ?? null;
        const nativePath = resolveNativePath(vfsPath, rootPath);
        if (nativePath) {
          try {
            const opened = await window.electronAPI.openWithDefaultApp(nativePath);
            if (opened) {
              notificationManager.info(`${baseName} をシステムのデフォルトアプリで開きます`);
            } else {
              notificationManager.error(`ファイルを開けませんでした: ${baseName}`);
            }
          } finally {
            openingPathsRef.current.delete(vfsPath);
          }
          return;
        }
      }

      try {
        // Read file from VFS
        let fileContent: string;
        try {
          const vfs = getProjectFileService();
          fileContent = await vfs.readFile(vfsPath);
        } catch (error) {
          console.error("ファイルの読み込みに失敗しました:", error);
          notificationManager.error(
            `ファイルを開けませんでした: ${vfsPath.split("/").pop() || vfsPath}`,
          );
          return;
        }

        // Staleness guard (#1917): a newer openProjectFile call was made while
        // this one was awaiting readFile.  Skip all state-committing paths so
        // the latest-clicked file remains active.  The tab is not created at all
        // for the stale open to avoid polluting the tab list.
        if (latestOpenRequestRef.current !== requestId) {
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
    [updateTab, setTabs, setActiveTabId, tabsRef, activeTabIdRef, latestOpenRequestRef],
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
    tryCreateSnapshot,
    tryAutoSnapshot,
  };
}
