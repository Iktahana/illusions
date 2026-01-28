// Electron preload API typings.
// Comments in code must be in English.

import type { StorageSession, AppState, RecentFile, EditorBuffer } from "@/lib/storage-types";

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
    onSaveBeforeClose?: (callback: () => void) => void;
    saveDoneAndClose?: () => Promise<void>;
    onOpenFileFromSystem?: (
      callback: (payload: { path: string; content: string }) => void
    ) => void;
    onMenuSave?: (callback: () => void) => void;
    onMenuSaveAs?: (callback: () => void) => void;
    ai?: {
      checkModelExists?: (modelName: string) => Promise<boolean>;
      listModels?: () => Promise<string[]>;
      downloadModel?: (url: string, modelName: string) => Promise<{ success: boolean; path?: string; error?: string }>;
      onDownloadProgress?: (callback: (data: { percent: number; modelName: string }) => void) => void;
      initializeAI?: (modelName: string) => Promise<{ success: boolean; error?: string }>;
      proofreadText?: (text: string) => Promise<{ success: boolean; result?: unknown; error?: string }>;
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
