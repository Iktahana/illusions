"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getStorageService } from "../storage/storage-service";
import { fetchWindowState, persistWindowState } from "../storage/app-state-manager";
import type { TabState, SerializedTab, TabPersistenceState, EditorTabState } from "./tab-types";
import { isEditorTab } from "./tab-types";
import type { TabManagerCore } from "./types";
import {
  TAB_PERSIST_DEBOUNCE,
  createNewTab,
  generateTabId,
  getErrorMessage,
  inferFileType,
} from "./types";
import { getProjectFileService } from "../services/project-file-service";
import { notificationManager } from "../services/notification-manager";
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
  // NOTE: currently write-only — the mount-time Electron restore that read it
  // is disabled until Phase 9 rewires it to the new IO abstraction (see below).
  const projectTabsRestoredRef = useRef(false);

  // --- Persist open tabs (debounced) -------------------------------------

  const tabPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // タブ状態の永続化が失敗した際、ユーザーに一度だけ通知するためのゲート。
  // 永続化は debounce で頻繁に走るため、失敗が続く間トーストを連発しないよう
  // 失敗ストリーク中は通知を抑制し、次に成功したら解除する（#1967）。
  const persistErrorNotifiedRef = useRef(false);

  /** Build and persist the current tab state immediately. */
  const persistTabStateNow = useCallback(async () => {
    const currentTabs = tabsRef.current;
    const currentActiveId = activeTabIdRef.current;
    const editorTabs = currentTabs.filter(isEditorTab);
    const activeEditorIndex = editorTabs.findIndex((t) => t.id === currentActiveId);

    // --- Project mode: write to workspace.json ---
    if (isProjectRef.current) {
      const rootPath = windowKeyRef.current; // rootPath for Electron, null for Web
      const workspaceTabs: WorkspaceTab[] = editorTabs.map((t) => {
        const relativePath = t.file?.path ? toRelativePath(t.file.path, rootPath) : null;
        return {
          relativePath,
          fileName: t.file?.name ?? "新規ファイル",
          isPreview: t.isPreview || undefined,
          fileType: t.fileType,
          // #1868: persist the editor buffer of unsaved, non-file-backed tabs so
          // their content survives an app restart. This covers a tab detached
          // after its file was deleted from the explorer (file → null), as well
          // as freshly typed untitled buffers. File-backed tabs are re-read from
          // disk on restore, so their content is intentionally not duplicated.
          unsavedContent: !relativePath && t.isDirty ? t.content : undefined,
        };
      });
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
      // #1965: persist the buffer of unsaved, non-file-backed (untitled) tabs so
      // their content survives a restart. Standalone untitled tabs have no disk
      // backing, so this is their only data-safety path (mirrors project-mode #1868).
      // File-backed tabs are intentionally NOT duplicated: their content lives on
      // disk and is re-read on restore.
      unsavedContent: !t.file?.path && t.isDirty ? t.content : undefined,
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
      void persistTabStateNow()
        .then(() => {
          // 成功したら失敗ストリークを解除し、次の失敗で再び通知できるようにする。
          persistErrorNotifiedRef.current = false;
        })
        .catch((error) => {
          console.error("タブ状態の保存に失敗しました:", error);
          // 容量不足等の永続化失敗は「保存できているはず」という誤認を招くため、
          // ストリークの先頭で一度だけ通知する（#1967）。
          if (!persistErrorNotifiedRef.current) {
            persistErrorNotifiedRef.current = true;
            notificationManager.error(`セッションの保存に失敗しました: ${getErrorMessage(error)}`);
          }
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
          // Unsaved tab (untitled, or detached after its file was deleted).
          // Recover its persisted buffer so unsaved content is not lost across
          // restart (#1868). A tab carrying content is restored dirty so the
          // user is still prompted to save it; an empty one stays clean.
          const unsaved = saved.unsavedContent ?? "";
          const tab = createNewTab(unsaved, saved.fileType ?? ".mdi");
          restoredTabs.push(
            unsaved.length > 0 ? { ...tab, isDirty: true, fileSyncStatus: "dirty" } : tab,
          );
          continue;
        }
        try {
          const absolutePath = toAbsolutePath(saved.relativePath, rootPath);
          const vfs = getProjectFileService();
          const fileContent = await vfs.readFile(absolutePath);
          restoredTabs.push({
            tabKind: "editor",
            id: generateTabId(),
            file: {
              // Store the VFS-relative path (same representation the file tree
              // passes to openProjectFile). Using the absolute path here made a
              // restored tab's path differ from a tree-opened one for the same
              // file, so the path-equality dedup missed and the file could be
              // opened a second time (#1528). Content is still read via the
              // absolute path above.
              path: saved.relativePath,
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
        // DB がロック中（別プロセス起動など）/破損で初期化に失敗すると、空タブで
        // 起動しつつセッションが読めなかったことをユーザーへ伝えていなかった（#1968 K-4-3）。
        // バナー（setRestoreError）とトーストの両方で明示し、サイレント失敗を解消する。
        setRestoreError?.(
          "前回のセッションを読み込めませんでした。アプリが多重起動していないかを確認してください。",
        );
        notificationManager.error(`セッションの読み込みに失敗しました: ${getErrorMessage(error)}`);
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
  }, [isElectron, skipAutoRestore, setTabs, setActiveTabId, setRestoreError]);

  // --- Standalone-mode restore from AppState (Electron only) -------------
  // This ONLY handles standalone mode (no project). In project mode,
  // restoreProjectTabs() is called explicitly by the project-open handler,
  // replacing the old mount-time restore that had a race condition with windowKey.
  //
  // #1965: マウント時に保存済み openTabs を読み、**filePath を持たない無題/未保存タブ**の
  // バッファのみを復元する。
  //
  // なぜ file-backed タブを復元しないか:
  //   Electron スタンドアロンは VFS ルート (allowedRoots) が未設定のまま起動するため、
  //   `getProjectFileService().readFile(絶対パス)` は main 側の validateVFSPath で必ず
  //   「ディレクトリが開かれていません」で失敗する (electron/ipc/vfs-ipc.js)。よって
  //   再起動時にファイル本体を再読込する経路は存在せず、無理に呼ぶと毎起動エラーになる。
  //   file-backed タブ本体の復元は main プロセス側の承認済みファイル再読込 (Phase 9 の
  //   新 IO 抽象) を前提とするため据え置く。ファイル実体は auto-save でディスク保護される。
  //
  // 無題タブは VFS を一切使わずバッファ (unsavedContent) から復元できるため、ここで救済する。
  // 復元有無に関わらず、永続化ゲート (storageInitializedRef) は旧実装の finally と同じ
  // タイミングで必ず開く。開かないと「全タブを閉じた」等の空タブ状態が永続化されず、
  // 次回起動時に古いタブ状態が残留する (#1567)。

  useEffect(() => {
    if (!isElectron || skipAutoRestore) return;

    let cancelled = false;
    const restoreStandaloneTabs = async (): Promise<void> => {
      // 旧実装と同様に VFS 準備 (最大 5 秒) を待ってからゲートを開き、
      // マウント直後の空タブ状態が保存済みデータを上書きする競合を避ける。
      if (vfsReadyPromise) {
        await Promise.race([vfsReadyPromise, new Promise<void>((r) => setTimeout(r, 5000))]);
      }
      if (cancelled) return;

      try {
        const key = windowKeyRef.current;
        const windowState = key ? await fetchWindowState(key) : null;
        const appState = windowState ? null : await getStorageService().loadAppState();
        const savedOpenTabs = windowState?.openTabs ?? appState?.openTabs;
        if (cancelled) return;

        if (savedOpenTabs && savedOpenTabs.tabs.length > 0) {
          const restored: EditorTabState[] = [];
          for (const saved of savedOpenTabs.tabs) {
            // file-backed タブはここでは復元しない (上記の VFS 制約による)。
            if (saved.filePath) continue;
            const unsaved = saved.unsavedContent ?? "";
            const tab = createNewTab(unsaved, saved.fileType ?? ".mdi");
            // 内容を持つ無題タブは dirty として復元し、保存を促す。空なら clean。
            restored.push(
              unsaved.length > 0 ? { ...tab, isDirty: true, fileSyncStatus: "dirty" } : tab,
            );
          }

          if (!cancelled && restored.length > 0) {
            const activeIdx = Math.min(Math.max(0, savedOpenTabs.activeIndex), restored.length - 1);
            // ユーザーが待機中に開いたタブを上書きしないよう、空のときだけ反映する。
            setTabs((prev) => (prev.length > 0 ? prev : restored));
            setActiveTabId((prev) => (prev === "" ? restored[activeIdx].id : prev));
          }
        }
      } catch (error) {
        // 復元失敗はゲートを塞がず空起動で継続する (データ自体は失われない)。
        console.warn("スタンドアロンタブの復元に失敗しました:", error);
      } finally {
        if (!cancelled) storageInitializedRef.current = true;
      }
    };

    void restoreStandaloneTabs();
    return () => {
      cancelled = true;
    };
  }, [isElectron, skipAutoRestore, vfsReadyPromise, setTabs, setActiveTabId]);

  return { wasAutoRecovered, flushTabState, restoreProjectTabs };
}
