// Electron preload API typings.
// Comments in code must be in English.

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
  }

  interface Window {
    electronAPI?: ElectronAPI;
    ai?: {
      canCreateTextSession?: () => Promise<string>;
      createTextSession?: () => Promise<unknown>;
    };
  }
}
