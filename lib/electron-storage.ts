/**
 * Electron 用ストレージ実装（IPC 経由でメインプロセスと通信）。
 * レンダラ側から、メインプロセスが管理する SQLite ストレージへアクセスする。
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
    // IPC 経由のため、明示的な初期化は不要（DB準備はメインプロセス側で行う）
    this.initialized = true;
  }

  private getElectronAPI() {
    const electronAPI = (window as Window & { electronAPI?: { storage?: unknown } }).electronAPI;
    if (!electronAPI?.storage) {
      throw new Error("Electron の storage API が利用できません");
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
      addRecentProject: (project: { id: string; rootPath: string; name: string }) => Promise<void>;
      getRecentProjects: () => Promise<Array<{ id: string; rootPath: string; name: string }>>;
      removeRecentProject: (projectId: string) => Promise<void>;
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

  async addRecentProject(project: {
    id: string;
    rootPath: string;
    name: string;
  }): Promise<void> {
    await this.initialize();
    const api = this.getElectronAPI();
    return api.addRecentProject(project);
  }

  async getRecentProjects(): Promise<
    Array<{ id: string; rootPath: string; name: string }>
  > {
    await this.initialize();
    const api = this.getElectronAPI();
    return api.getRecentProjects();
  }

  async removeRecentProject(projectId: string): Promise<void> {
    await this.initialize();
    const api = this.getElectronAPI();
    return api.removeRecentProject(projectId);
  }
}

export default ElectronStorageProvider;
