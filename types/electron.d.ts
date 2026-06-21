// Electron preload API の型定義

import type {
  StorageSession,
  AppState,
  RecentFile,
  EditorBuffer,
} from "@/lib/storage/storage-types";
import type { Token, WordEntry, TokenizeProgress } from "@/lib/nlp-client/types";
import type { VFSWatchEvent } from "@/lib/vfs/types";
import type { KeymapOverrides } from "@/lib/keymap/keymap-types";
import type { DictEntry, DictDownloadStatus, DictLookup } from "@/lib/dict/dict-types";
import type { PdfGenerationOptions } from "@/lib/export/types";

export {};

declare global {
  interface ElectronAPI {
    isElectron: boolean;
    openFile: () => Promise<{ path: string; content: string } | null>;
    saveFile: (
      filePath: string | null,
      content: string,
      fileType?: string,
    ) => Promise<string | null | { success: false; error?: string; code?: string }>;
    getChromeVersion: () => Promise<number>;
    setDirty: (dirty: boolean) => Promise<void>;
    /**
     * Close-handshake terminator. Name is historical (originally tied to save).
     * Phase 2: 保存経路を削除した後も flush 完了後の window destroy トリガとして利用。
     */
    saveDoneAndClose?: () => Promise<void>;
    /** #1839: signal main that a requested close was aborted (save failed). */
    notifyCloseAborted?: () => void;
    newWindow?: () => Promise<void>;
    /** beta opt-in トグル変更時にメインプロセスへ channel 再評価を依頼する */
    reevaluateUpdateChannel?: () => Promise<boolean>;
    openDictionaryPopup?: (url: string, title: string) => Promise<boolean>;
    showContextMenu?: (
      items: Array<{ type?: string; label?: string; action?: string; accelerator?: string }>,
    ) => Promise<string | null>;
    onSaveBeforeClose?: (callback: () => void) => (() => void) | void;
    onFlushStateBeforeClose?: (callback: () => void) => (() => void) | void;
    onOpenFileFromSystem?: (
      callback: (payload: { path: string; content: string }) => void,
    ) => (() => void) | void;
    onOpenAsProject?: (
      callback: (payload: { projectPath: string; initialFile: string }) => void,
    ) => (() => void) | void;
    getPendingFile?: () => Promise<
      Array<
        | { type: "project"; projectPath: string; initialFile: string }
        | { type: "standalone"; path: string; content: string }
      >
    >;
    onMenuNew?: (callback: () => void) => (() => void) | void;
    onMenuOpen?: (callback: () => void) => (() => void) | void;
    onMenuSave?: (callback: () => void) => (() => void) | void;
    onMenuSaveAs?: (callback: () => void) => (() => void) | void;
    onMenuCloseTab?: (callback: () => void) => (() => void) | void;
    onMenuNewTab?: (callback: () => void) => (() => void) | void;
    onMenuOpenProject?: (callback: () => void) => (() => void) | void;
    onMenuOpenRecentProject?: (callback: (projectId: string) => void) => (() => void) | void;
    rebuildMenu?: () => Promise<boolean>;
    syncMenuUiState?: (state: {
      compactMode?: boolean;
      showParagraphNumbers?: boolean;
      themeMode?: string;
      autoCharsPerLine?: boolean;
    }) => Promise<boolean>;
    updateKeymapOverrides?: (overrides: KeymapOverrides) => Promise<boolean>;
    showInFileManager?: (dirPath: string) => Promise<boolean>;
    revealInFileManager?: (filePath: string) => Promise<boolean>;
    openWithDefaultApp?: (filePath: string) => Promise<boolean>;
    openExternal?: (url: string) => Promise<boolean>;
    onMenuShowInFileManager?: (callback: () => void) => (() => void) | void;
    onPasteAsPlaintext?: (callback: () => void) => (() => void) | void;
    onToggleCompactMode?: (callback: () => void) => (() => void) | void;
    onFormatChange?: (callback: (setting: string, action: string) => void) => (() => void) | void;
    onThemeChange?: (callback: (mode: "auto" | "light" | "dark") => void) => (() => void) | void;
    // Export
    generatePdfPreview?: (
      content: string,
      options: PdfGenerationOptions,
    ) => Promise<{ success: true; data: string } | { success: false; error: string }>;
    exportPDF?: (
      content: string,
      options: PdfGenerationOptions,
    ) => Promise<string | { success: false; error: string } | null>;
    exportEPUB?: (
      content: string,
      options: import("@/lib/export/epub-shared").EpubExportOptions,
    ) => Promise<string | { success: false; error: string } | null>;
    exportDOCX?: (
      content: string,
      options: {
        metadata: { title: string; author?: string; date?: string; language?: string };
        settings?: {
          pageSize?: string;
          landscape?: boolean;
          fontFamily?: string;
          fontSize?: number;
          lineSpacing?: number;
          margins?: { top: number; bottom: number; left: number; right: number };
          textIndent?: number;
          fullwidthSpaceIndent?: boolean;
          showPageNumbers?: boolean;
        };
        // Active tab's file type. The main-process generateDocx un-escapes MDI
        // macros only for ".mdi"; absent/unknown falls back to ".mdi".
        fileType?: import("@/lib/project/project-types").SupportedFileExtension;
      },
    ) => Promise<string | { success: false; error: string } | null>;
    printDocument?: (
      content: string,
      options: PdfGenerationOptions,
    ) => Promise<{ success: boolean; error?: string }>;
    onMenuPrint?: (callback: () => void) => (() => void) | void;
    onMenuExportTxt?: (callback: () => void) => (() => void) | void;
    onMenuExportTxtRuby?: (callback: () => void) => (() => void) | void;
    onMenuExportPDF?: (callback: () => void) => (() => void) | void;
    onMenuExportEPUB?: (callback: () => void) => (() => void) | void;
    onMenuExportDOCX?: (callback: () => void) => (() => void) | void;
    /** Virtual File System IPC bridge */
    vfs?: {
      /** Open a native directory picker dialog */
      openDirectory: () => Promise<{ path: string; name: string } | null>;
      /** Set the root directory without opening a dialog (for recent project restore) */
      setRoot: (rootPath: string) => Promise<{ path: string; name: string }>;
      /** Read file content as UTF-8 text */
      readFile: (filePath: string) => Promise<string>;
      /** Write UTF-8 text content to a file */
      writeFile: (filePath: string, content: string) => Promise<void>;
      /** Read directory entries */
      readDirectory: (
        dirPath: string,
      ) => Promise<Array<{ name: string; kind: "file" | "directory" }>>;
      /** Get file stats */
      stat: (filePath: string) => Promise<{ size: number; lastModified: number; type: string }>;
      /** Check whether a path exists without throwing on ENOENT */
      exists: (filePath: string) => Promise<boolean>;
      /** Create a directory (recursive) */
      mkdir: (dirPath: string) => Promise<void>;
      /** Delete a file or directory */
      delete: (targetPath: string, options?: { recursive?: boolean }) => Promise<void>;
      /** Rename (move) a file or directory */
      rename: (oldPath: string, newPath: string) => Promise<void>;
      /** Watch a file for changes (optional) */
      watch?: (filePath: string, callback: (event: VFSWatchEvent) => void) => { stop: () => void };
      /**
       * Acquire the cross-window history index lock for the given key.
       * Suspends until the lock is available (main-process queue-based, atomic).
       */
      indexLockAcquire: (key: string) => Promise<void>;
      /**
       * Release the cross-window history index lock for the given key.
       * Must be called from the window that acquired it.
       */
      indexLockRelease: (key: string) => Promise<void>;
    };
    /**
     * Storage IPC. Channel names live in electron/lib/ipc-channels.js
     * (shared by preload and main); wrappers use electron/lib/ipc-bridge.js (#1434).
     */
    storage?: {
      saveSession: (session: StorageSession) => Promise<void>;
      loadSession: () => Promise<StorageSession | null>;
      saveAppState: (appState: AppState) => Promise<void>;
      loadAppState: () => Promise<AppState | null>;
      addToRecent: (file: RecentFile) => Promise<void>;
      getRecentFiles: () => Promise<RecentFile[]>;
      removeFromRecent: (filePath: string) => Promise<void>;
      clearRecent: () => Promise<void>;
      saveEditorBuffer: (buffer: EditorBuffer) => Promise<void>;
      loadEditorBuffer: () => Promise<EditorBuffer | null>;
      clearEditorBuffer: () => Promise<void>;
      clearAll: () => Promise<void>;
      addRecentProject: (project: { id: string; rootPath: string; name: string }) => Promise<void>;
      getRecentProjects: () => Promise<Array<{ id: string; rootPath: string; name: string }>>;
      removeRecentProject: (projectId: string) => Promise<void>;
      setItem: (key: string, value: string) => Promise<void>;
      getItem: (key: string) => Promise<string | null>;
      removeItem: (key: string) => Promise<void>;
      getKeysByPrefix: (prefix: string) => Promise<string[]>;
    };
    nlp?: {
      /**
       * Initialize NLP service (kuromoji tokenizer)
       * @param dicPath - Dictionary path (e.g., '/dict')
       */
      init: (dicPath: string) => Promise<{ success: boolean }>;

      /**
       * Tokenize a single paragraph
       * @param text - Paragraph text
       * @returns Token array
       */
      tokenizeParagraph: (text: string) => Promise<Token[]>;

      /**
       * Tokenize multiple paragraphs in batch
       * @param paragraphs - Array of {pos, text} objects
       * @param onProgress - Optional progress callback
       * @returns Array of {pos, tokens} results
       */
      tokenizeDocument: (
        paragraphs: Array<{ pos: number; text: string }>,
        onProgress?: (progress: TokenizeProgress) => void,
      ) => Promise<Array<{ pos: number; tokens: Token[] }>>;

      /**
       * Analyze word frequency in text
       * @param text - Full document text
       * @returns Sorted word entries with counts
       */
      analyzeWordFrequency: (text: string) => Promise<WordEntry[]>;
    };
    auth?: {
      startLogin: () => Promise<{ state: string }>;
      exchangeCode: (params: { code: string; state: string }) => Promise<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
        token_type: string;
        scope: string;
      }>;
      refreshToken: (refreshToken: string) => Promise<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
        token_type: string;
        scope: string;
      }>;
      getUserInfo: (accessToken: string) => Promise<{
        sub: string;
        email: string;
        name: string;
        picture: string | null;
        plan: string;
        subscription_status: string;
      }>;
      logout: () => Promise<{ success: boolean }>;
      onCallback: (
        callback: (data: {
          code?: string | null;
          state?: string | null;
          error?: string | null;
        }) => void,
      ) => () => void;
    };
    safeStorage?: {
      /** Encrypt a string using OS-level encryption (macOS Keychain / Windows DPAPI) */
      encrypt: (plaintext: string) => Promise<string | null>;
      /** Decrypt a base64-encoded ciphertext */
      decrypt: (base64Cipher: string) => Promise<string | null>;
      /** Check if OS-level encryption is available */
      isAvailable: () => Promise<boolean>;
    };
    power?: {
      /**
       * Listen for debounced power state changes from main process.
       * Returns an unsubscribe function that removes only this listener.
       */
      onPowerStateChange: (callback: (state: "ac" | "battery") => void) => () => void;
      /** Get current power state */
      getPowerState: () => Promise<"ac" | "battery">;
      /**
       * Fires when the system wakes from sleep (M-1/M-2 resume re-arm).
       * Returns an unsubscribe function.
       */
      onResume: (callback: () => void) => () => void;
      /**
       * Fires just before the system suspends (M-1/M-2 suspend signal).
       * Returns an unsubscribe function.
       */
      onSuspend: (callback: () => void) => () => void;
      /**
       * Fires when the screen is locked (macOS/Windows only, M-5 flush).
       * Returns an unsubscribe function.
       */
      onLockScreen: (callback: () => void) => () => void;
    };
    /** Split editor popout window IPC */
    editor?: {
      /** Pop out a buffer to a new Electron window */
      popoutPanel: (
        bufferId: string,
        content: string,
        fileName: string,
        fileType: string,
      ) => Promise<boolean>;
      /** Send buffer content change to other windows */
      sendBufferSync: (bufferId: string, content: string) => void;
      /** Listen for buffer content changes from other windows */
      onBufferSync: (callback: (data: { bufferId: string; content: string }) => void) => () => void;
      /** Notify that a buffer was closed in this window */
      sendBufferClose: (bufferId: string) => void;
      /** Listen for buffer close events from other windows */
      onBufferClose: (callback: (bufferId: string) => void) => () => void;
      /** Remove all editor sync listeners */
      removeAllListeners: () => void;
    };
    /**
     * Master dictionary IPC (Genji and future providers).
     * Channel names live in electron/lib/ipc-channels.js (shared by preload
     * and main); wrappers use electron/lib/ipc-bridge.js (#1434).
     */
    dict?: {
      /** Query entries by headword (exact or prefix match) */
      query: (term: string, limit?: number) => Promise<DictEntry[]>;
      /** Query entries by kana reading (homophone lookup) */
      queryByReading: (reading: string, limit?: number) => Promise<DictEntry[]>;
      /**
       * Batch lookup (lightweight projection) for analysis features and lint
       * prewarm. Headword exact-match by default; when `normalize` is true
       * (default), all-kana terms that miss are resolved via the reading index
       * (e.g. kana 「ある」 → headword 「有る」, #1935) and returned keyed by the
       * requested term. Terms with no match are omitted from the result array.
       */
      lookupBatch: (
        terms: string[],
        normalize?: boolean,
      ) => Promise<Array<{ entry: string } & DictLookup>>;
      /** Fast integrity check; `ok: false` means the DB should be re-downloaded. */
      verify: () => Promise<{
        ok: boolean;
        reason?: "not-installed" | "schema" | "malformed";
      }>;
      /** Get current installation status */
      getStatus: () => Promise<{
        status: DictDownloadStatus;
        installedVersion?: string;
      }>;
      /** Check GitHub Releases for the latest version */
      checkUpdate: () => Promise<{
        latestVersion?: string;
        installedVersion?: string;
        updateAvailable?: boolean;
        error?: string;
      }>;
      /** Download and install the latest database */
      download: () => Promise<{ success: boolean; version?: string; error?: string }>;
      /** Subscribe to download progress events (0–100). Returns cleanup function. */
      onDownloadProgress: (callback: (data: { progress: number }) => void) => () => void;
      /** Subscribe to update-available notifications pushed from main process. */
      onUpdateAvailable: (
        callback: (data: { latestVersion: string; updateAvailable: boolean }) => void,
      ) => () => void;
    };
    /** Official校正ルールセットの自動ダウンロード/更新（Electronのみ） */
    rulesets?: {
      /** List installed (downloaded) official/external rulesets on disk. */
      listInstalled: () => Promise<
        Array<{ id: string; version: string | null; tag: string | null }>
      >;
      /** Download/update every official ruleset that is missing or out of date. */
      sync: () => Promise<
        Array<{
          id: string;
          status: "installed" | "up-to-date" | "skipped" | "error";
          detail?: string;
        }>
      >;
      /** Check latest release tags vs installed, without downloading. */
      checkUpdate: () => Promise<
        Array<{
          id: string;
          installedTag?: string | null;
          latestTag?: string | null;
          hasRelease?: boolean;
          updateAvailable?: boolean;
          error?: string;
        }>
      >;
      /**
       * Read an installed ruleset's verified module code + manifest for the
       * external loader. Re-verifies the code sha256 recorded at install.
       */
      readModule: (
        id: string,
      ) => Promise<
        | { ok: true; id: string; tag: string | null; manifest: unknown; code: string }
        | { ok: false; id: string; reason: string }
      >;
      /** Uninstall a third-party ruleset (official/built-in recommended are refused). */
      uninstall: (id: string) => Promise<{ ok: boolean; detail?: string }>;
      /** Subscribe to per-ruleset sync progress. Returns an unsubscribe fn. */
      onSyncProgress: (
        cb: (data: {
          id: string;
          status: "installed" | "up-to-date" | "skipped" | "error";
          detail?: string;
        }) => void,
      ) => () => void;
      /** Subscribe to installed-ruleset change announcements. Returns an unsubscribe fn. */
      onChanged: (
        cb: (data: { reason: "installed" | "updated" | "uninstalled"; ids: string[] }) => void,
      ) => () => void;
    };
    /** PTY session management */
    pty?: {
      /**
       * Spawn a new PTY session in the main process.
       * @param options - Optional spawn configuration
       * @returns sessionId on success, or error message
       */
      spawn: (options?: {
        cwd?: string;
        shell?: string;
        cols?: number;
        rows?: number;
      }) => Promise<{ sessionId: string } | { error: string }>;
      /**
       * Re-attach to an existing session and retrieve its output ring buffer.
       * @param sessionId - ID returned by spawn
       */
      attach: (sessionId: string) => Promise<
        | {
            sessionId: string;
            status: "active" | "exited" | "killed";
            exitCode: number | null;
            outputBuffer: string;
          }
        | { error: string }
      >;
      /**
       * Write keystroke data to a PTY session (max 64 KB).
       * @param sessionId - Target session ID
       * @param data - Raw input string
       */
      write: (sessionId: string, data: string) => Promise<{ ok: boolean }>;
      /**
       * Resize the terminal dimensions.
       * @param sessionId - Target session ID
       * @param cols - Column count (1–500)
       * @param rows - Row count (1–500)
       */
      resize: (sessionId: string, cols: number, rows: number) => Promise<{ ok: boolean }>;
      /**
       * Kill a PTY session (idempotent).
       * @param sessionId - Target session ID
       */
      kill: (sessionId: string) => Promise<{ ok: boolean }>;
      /**
       * Query the current state of a PTY session.
       * @param sessionId - Target session ID
       */
      status: (sessionId: string) => Promise<
        | {
            sessionId: string;
            status: "active" | "exited" | "killed";
            exitCode: number | null;
            shell: string;
            cwd: string;
            createdAt: number;
          }
        | { error: string }
      >;
      /**
       * Listen for PTY output data pushed from the main process.
       * Returns a cleanup function that removes the listener.
       */
      onData: (callback: (payload: { sessionId: string; data: string }) => void) => () => void;
      /**
       * Listen for PTY process exit notifications.
       * Returns a cleanup function that removes the listener.
       */
      onExit: (callback: (payload: { sessionId: string; exitCode: number }) => void) => () => void;
    };
  }

  interface Window {
    electronAPI?: ElectronAPI;
    ai?: {
      canCreateTextSession?: () => Promise<string>;
      createTextSession?: () => Promise<unknown>;
    };
  }
}
