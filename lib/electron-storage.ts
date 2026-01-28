/**
 * Electron Storage Provider using IPC to communicate with main process.
 * Used in renderer process to access SQLite storage managed by main process.
 */

import type {
  IStorageService,
  StorageSession,
  AppState,
  RecentFile,
  EditorBuffer,
} from "./storage-types";

export class ElectronStorageProvider implements IStorageService {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    // IPC-based storage doesn't require explicit initialization
    // since the main process handles database setup
    this.initialized = true;
  }

  async saveSession(session: StorageSession): Promise<void> {
    await this.initialize();
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.storage?.saveSession) {
      throw new Error("Electron storage API not available");
    }
    return electronAPI.storage.saveSession(session);
  }

  async loadSession(): Promise<StorageSession | null> {
    await this.initialize();
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.storage?.loadSession) {
      throw new Error("Electron storage API not available");
    }
    return electronAPI.storage.loadSession();
  }

  async saveAppState(appState: AppState): Promise<void> {
    await this.initialize();
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.storage?.saveAppState) {
      throw new Error("Electron storage API not available");
    }
    return electronAPI.storage.saveAppState(appState);
  }

  async loadAppState(): Promise<AppState | null> {
    await this.initialize();
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.storage?.loadAppState) {
      throw new Error("Electron storage API not available");
    }
    return electronAPI.storage.loadAppState();
  }

  async addToRecent(file: RecentFile): Promise<void> {
    await this.initialize();
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.storage?.addToRecent) {
      throw new Error("Electron storage API not available");
    }
    return electronAPI.storage.addToRecent(file);
  }

  async getRecentFiles(): Promise<RecentFile[]> {
    await this.initialize();
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.storage?.getRecentFiles) {
      throw new Error("Electron storage API not available");
    }
    return electronAPI.storage.getRecentFiles();
  }

  async removeFromRecent(path: string): Promise<void> {
    await this.initialize();
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.storage?.removeFromRecent) {
      throw new Error("Electron storage API not available");
    }
    return electronAPI.storage.removeFromRecent(path);
  }

  async clearRecent(): Promise<void> {
    await this.initialize();
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.storage?.clearRecent) {
      throw new Error("Electron storage API not available");
    }
    return electronAPI.storage.clearRecent();
  }

  async saveEditorBuffer(buffer: EditorBuffer): Promise<void> {
    await this.initialize();
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.storage?.saveEditorBuffer) {
      throw new Error("Electron storage API not available");
    }
    return electronAPI.storage.saveEditorBuffer(buffer);
  }

  async loadEditorBuffer(): Promise<EditorBuffer | null> {
    await this.initialize();
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.storage?.loadEditorBuffer) {
      throw new Error("Electron storage API not available");
    }
    return electronAPI.storage.loadEditorBuffer();
  }

  async clearEditorBuffer(): Promise<void> {
    await this.initialize();
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.storage?.clearEditorBuffer) {
      throw new Error("Electron storage API not available");
    }
    return electronAPI.storage.clearEditorBuffer();
  }

  async clearAll(): Promise<void> {
    await this.initialize();
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.storage?.clearAll) {
      throw new Error("Electron storage API not available");
    }
    return electronAPI.storage.clearAll();
  }
}

export default ElectronStorageProvider;
