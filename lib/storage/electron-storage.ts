/**
 * Electron 用ストレージ実装（IPC 経由でメインプロセスと通信）。
 * レンダラ側から、メインプロセスが管理する SQLite ストレージへアクセスする。
 */

import type {
  IStorageService,
  StorageSession,
  AppState,
  RecentFile,
  RecentProject,
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
      addRecentProject: (project: RecentProject) => Promise<void>;
      getRecentProjects: () => Promise<RecentProject[]>;
      removeRecentProject: (projectId: string) => Promise<void>;
      setItem: (key: string, value: string) => Promise<void>;
      getItem: (key: string) => Promise<string | null>;
      removeItem: (key: string) => Promise<void>;
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

  /**
   * fileKey 指定時のストレージキー。
   * Web 実装（web-storage.ts）と同じ `editor_buffer:${fileKey}` 形式で名前空間化する。
   * 既存の editor_buffer IPC チャンネルは fileKey を運べないため、
   * 名前空間付きバッファは汎用 KV ストア（kv_store テーブル、clearAll() で削除される）
   * に保存する。fileKey なしの呼び出しは従来どおり editor_buffer テーブルを使う。
   */
  private editorBufferKvKey(fileKey: string): string {
    return `editor_buffer:${fileKey}`;
  }

  async saveEditorBuffer(buffer: EditorBuffer, fileKey?: string): Promise<void> {
    await this.initialize();
    const api = this.getElectronAPI();
    if (fileKey) {
      return api.setItem(this.editorBufferKvKey(fileKey), JSON.stringify(buffer));
    }
    return api.saveEditorBuffer(buffer);
  }

  async loadEditorBuffer(fileKey?: string): Promise<EditorBuffer | null> {
    await this.initialize();
    const api = this.getElectronAPI();
    if (fileKey) {
      const raw = await api.getItem(this.editorBufferKvKey(fileKey));
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as EditorBuffer;
      } catch {
        // 破損データは読み捨てる
        return null;
      }
    }
    return api.loadEditorBuffer();
  }

  async clearEditorBuffer(fileKey?: string): Promise<void> {
    await this.initialize();
    const api = this.getElectronAPI();
    if (fileKey) {
      return api.removeItem(this.editorBufferKvKey(fileKey));
    }
    return api.clearEditorBuffer();
  }

  async clearAll(): Promise<void> {
    await this.initialize();
    const api = this.getElectronAPI();
    return api.clearAll();
  }

  async addRecentProject(project: RecentProject): Promise<void> {
    await this.initialize();
    const api = this.getElectronAPI();
    return api.addRecentProject(project);
  }

  async getRecentProjects(): Promise<RecentProject[]> {
    await this.initialize();
    const api = this.getElectronAPI();
    return api.getRecentProjects();
  }

  async removeRecentProject(projectId: string): Promise<void> {
    await this.initialize();
    const api = this.getElectronAPI();
    return api.removeRecentProject(projectId);
  }

  async setItem(key: string, value: string): Promise<void> {
    await this.initialize();
    const api = this.getElectronAPI();
    return api.setItem(key, value);
  }

  async getItem(key: string): Promise<string | null> {
    await this.initialize();
    const api = this.getElectronAPI();
    return api.getItem(key);
  }

  async removeItem(key: string): Promise<void> {
    await this.initialize();
    const api = this.getElectronAPI();
    return api.removeItem(key);
  }
}

export default ElectronStorageProvider;
