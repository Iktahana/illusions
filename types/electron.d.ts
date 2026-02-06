// Electron preload API の型定義

import type { StorageSession, AppState, RecentFile, EditorBuffer } from "@/lib/storage-types";
import type { Token, WordEntry, TokenizeProgress } from "@/lib/nlp-client/types";

export {}

declare global {
  interface ElectronAPI {
    isElectron: boolean;
    openFile: () => Promise<{ path: string; content: string } | null>;
    saveFile: (
      filePath: string | null,
      content: string
    ) => Promise<string | null>;
    getChromeVersion: () => Promise<number>;
    setDirty: (dirty: boolean) => Promise<void>;
    saveDoneAndClose?: () => Promise<void>;
    newWindow?: () => Promise<void>;
    openDictionaryPopup?: (url: string, title: string) => Promise<boolean>;
    onSaveBeforeClose?: (callback: () => void) => (() => void) | void;
    onOpenFileFromSystem?: (
      callback: (payload: { path: string; content: string }) => void
    ) => (() => void) | void;
    onMenuNew?: (callback: () => void) => (() => void) | void;
    onMenuOpen?: (callback: () => void) => (() => void) | void;
    onMenuSave?: (callback: () => void) => (() => void) | void;
    onMenuSaveAs?: (callback: () => void) => (() => void) | void;
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
