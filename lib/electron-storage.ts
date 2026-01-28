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

  private getElectronAPI() {
    const electronAPI = (window as Window & { electronAPI?: { storage?: unknown } }).electronAPI;
    if (!electronAPI?.storage) {
      throw new Error("Electron storage API not available");
    }
    return electronAPI.storage as {
      saveSession: (session: StorageSession) => Promise<void>;
      loadSession: () => Promise<StorageSession | null>;
      saveAppState: (appState: AppState) => Promise<void>;
      loadAppState: () => Promise<AppState | null>;
      addToRecent: (file: RecentFile) => Promise<void>;
      getRecentFiles: () => Promise<RecentFile[]>;
      removeFromRecent: (path: string) => Promise<void>;
      clearRecent: () => Promise<void>;
      saveEditorBuffer: (buffer: EditorBuffer) => Promise<void>;
      loadEditorBuffer: () => Promise<EditorBuffer | null>;
      clearEditorBuffer: () => Promise<void>;
      clearAll: () => Promise<void>;
    };
  }

  async saveSession(session: StorageSession): Promise<void> {
    await this.initialize();
    const api = this.getElectronAPI();
    return api.saveSession(session);
  }

  async loadSession(): Promise<StorageSession | null> {
    await this.initialize();
    const api = this.getElectronAPI();
    return api.loadSession();
  }

  async saveAppState(appState: AppState): Promise<void> {
    await this.initialize();
    const api = this.getElectronAPI();
    return api.saveAppState(appState);
  }

  async loadAppState(): Promise<AppState | null> {
    await this.initialize();
    const api = this.getElectronAPI();
    return api.loadAppState();
  }

  async addToRecent(file: RecentFile): Promise<void> {
    await this.initialize();
    const api = this.getElectronAPI();
    return api.addToRecent(file);
  }

  async getRecentFiles(): Promise<RecentFile[]> {
    await this.initialize();
    const api = this.getElectronAPI();
    return api.getRecentFiles();
  }

  async removeFromRecent(path: string): Promise<void> {
    await this.initialize();
    const api = this.getElectronAPI();
    return api.removeFromRecent(path);
  }

  async clearRecent(): Promise<void> {
    await this.initialize();
    const api = this.getElectronAPI();
    return api.clearRecent();
  }

  async saveEditorBuffer(buffer: EditorBuffer): Promise<void> {
    await this.initialize();
    const api = this.getElectronAPI();
    return api.saveEditorBuffer(buffer);
  }

  async loadEditorBuffer(): Promise<EditorBuffer | null> {
    await this.initialize();
    const api = this.getElectronAPI();
    return api.loadEditorBuffer();
  }

  async clearEditorBuffer(): Promise<void> {
    await this.initialize();
    const api = this.getElectronAPI();
    return api.clearEditorBuffer();
  }

  async clearAll(): Promise<void> {
    await this.initialize();
    const api = this.getElectronAPI();
    return api.clearAll();
  }
}

export default ElectronStorageProvider;
