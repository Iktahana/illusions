// Electron preload API typings.
// Comments in code must be in English.

export {}

declare global {
  interface ElectronAPI {
    isElectron: boolean
    openFile: () => Promise<{ path: string; content: string } | null>
    saveFile: (
      filePath: string | null,
      content: string
    ) => Promise<string | null>
    getChromeVersion: () => Promise<number>
  }

  interface Window {
    electronAPI?: ElectronAPI
    ai?: {
      canCreateTextSession?: () => Promise<string>
      createTextSession?: () => Promise<unknown>
    }
  }
}

