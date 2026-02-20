// Electron preload API の型定義

import type { StorageSession, AppState, RecentFile, EditorBuffer } from "@/lib/storage-types";
import type { Token, WordEntry, TokenizeProgress } from "@/lib/nlp-client/types";
import type { VFSWatchEvent } from "@/lib/vfs/types";

export {}

declare global {
  interface ElectronAPI {
    isElectron: boolean;
    openFile: () => Promise<{ path: string; content: string } | null>;
    saveFile: (
      filePath: string | null,
      content: string
    ) => Promise<string | { success: false; error: string } | null>;
    getChromeVersion: () => Promise<number>;
    setDirty: (dirty: boolean) => Promise<void>;
    saveDoneAndClose?: () => Promise<void>;
    newWindow?: () => Promise<void>;
    openDictionaryPopup?: (url: string, title: string) => Promise<boolean>;
    showContextMenu?: (items: Array<{ type?: string; label?: string; action?: string; accelerator?: string }>) => Promise<string | null>;
    onSaveBeforeClose?: (callback: () => void) => (() => void) | void;
    onOpenFileFromSystem?: (
      callback: (payload: { path: string; content: string }) => void
    ) => (() => void) | void;
    onOpenAsProject?: (
      callback: (payload: { projectPath: string; initialFile: string }) => void
    ) => (() => void) | void;
    onMenuNew?: (callback: () => void) => (() => void) | void;
    onMenuOpen?: (callback: () => void) => (() => void) | void;
    onMenuSave?: (callback: () => void) => (() => void) | void;
    onMenuSaveAs?: (callback: () => void) => (() => void) | void;
    onMenuCloseTab?: (callback: () => void) => (() => void) | void;
    onMenuNewTab?: (callback: () => void) => (() => void) | void;
    onMenuOpenProject?: (callback: () => void) => (() => void) | void;
    onMenuOpenRecentProject?: (callback: (projectId: string) => void) => (() => void) | void;
    rebuildMenu?: () => Promise<boolean>;
    syncMenuUiState?: (state: { compactMode?: boolean; showParagraphNumbers?: boolean; themeMode?: string; autoCharsPerLine?: boolean }) => Promise<boolean>;
    showInFileManager?: (dirPath: string) => Promise<boolean>;
    revealInFileManager?: (filePath: string) => Promise<boolean>;
    openExternal?: (url: string) => Promise<boolean>;
    onMenuShowInFileManager?: (callback: () => void) => (() => void) | void;
    onToggleCompactMode?: (callback: () => void) => (() => void) | void;
    onFormatChange?: (callback: (setting: string, action: string) => void) => (() => void) | void;
    onThemeChange?: (callback: (mode: "auto" | "light" | "dark") => void) => (() => void) | void;
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
        dirPath: string
      ) => Promise<Array<{ name: string; kind: "file" | "directory" }>>;
      /** Get file stats */
      stat: (
        filePath: string
      ) => Promise<{ size: number; lastModified: number; type: string }>;
      /** Create a directory (recursive) */
      mkdir: (dirPath: string) => Promise<void>;
      /** Delete a file or directory */
      delete: (targetPath: string, options?: { recursive?: boolean }) => Promise<void>;
      /** Watch a file for changes (optional) */
      watch?: (
        filePath: string,
        callback: (event: VFSWatchEvent) => void
      ) => { stop: () => void };
    };
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
        onProgress?: (progress: TokenizeProgress) => void
      ) => Promise<Array<{ pos: number; tokens: Token[] }>>;
      
      /**
       * Analyze word frequency in text
       * @param text - Full document text
       * @returns Sorted word entries with counts
       */
      analyzeWordFrequency: (text: string) => Promise<WordEntry[]>;
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
