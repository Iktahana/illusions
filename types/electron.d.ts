// Electron preload API の型定義

import type {
  StorageSession,
  AppState,
  RecentFile,
  EditorBuffer,
} from "@/lib/storage/storage-types";
import type { Token, WordEntry, TokenizeProgress } from "@/lib/nlp-client/types";
// Phase 4-5: VFSWatchEvent type import 削除（vfs block と一緒に Phase 7-8 で再導入）。
import type { KeymapOverrides } from "@/lib/keymap/keymap-types";
import type { DictEntry, DictDownloadStatus } from "@/lib/dict/dict-types";
import type { PdfGenerationOptions } from "@/lib/export/types";

export {};

declare global {
  interface ElectronAPI {
    isElectron: boolean;
    // openFile / saveFile 削除 (Phase 2-3)。Phase 8 で再導入する。
    getChromeVersion: () => Promise<number>;
    setDirty: (dirty: boolean) => Promise<void>;
    /**
     * Close-handshake terminator. Name is historical (originally tied to save).
     * Phase 2: 保存経路を削除した後も flush 完了後の window destroy トリガとして利用。
     */
    saveDoneAndClose?: () => Promise<void>;
    newWindow?: () => Promise<void>;
    openDictionaryPopup?: (url: string, title: string) => Promise<boolean>;
    showContextMenu?: (
      items: Array<{ type?: string; label?: string; action?: string; accelerator?: string }>,
    ) => Promise<string | null>;
    // onSaveBeforeClose 削除 (Phase 2)。close handshake は onFlushStateBeforeClose のみ。
    onFlushStateBeforeClose?: (callback: () => void) => (() => void) | void;
    // onOpenFileFromSystem / onOpenAsProject / getPendingFile 削除 (Phase 3)。Phase 8 で再導入する。
    onMenuNew?: (callback: () => void) => (() => void) | void;
    // onMenuOpen / onMenuSave / onMenuSaveAs / onMenuOpenProject / onMenuOpenRecentProject 削除 (Phase 2-3)。
    onMenuCloseTab?: (callback: () => void) => (() => void) | void;
    onMenuNewTab?: (callback: () => void) => (() => void) | void;
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
          showPageNumbers?: boolean;
        };
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
    // Phase 4-5: vfs IPC bridge 削除（openDirectory / setRoot / readFile / writeFile /
    // readDirectory / stat / mkdir / delete / watch / indexLockAcquire / indexLockRelease）。
    // Phase 7-8 で新 IO 抽象として再導入する。
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
      /** Listen for debounced power state changes from main process */
      onPowerStateChange: (callback: (state: "ac" | "battery") => void) => () => void;
      /** Get current power state */
      getPowerState: () => Promise<"ac" | "battery">;
      /** Remove all power state change listeners */
      removeOnPowerStateChange: () => void;
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
    /** Master dictionary IPC (Genji and future providers) */
    dict?: {
      /** Query entries by headword (exact or prefix match) */
      query: (term: string, limit?: number) => Promise<DictEntry[]>;
      /** Query entries by kana reading (homophone lookup) */
      queryByReading: (reading: string, limit?: number) => Promise<DictEntry[]>;
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
