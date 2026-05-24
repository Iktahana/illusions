/**
 * AppDataService — Phase 7 IO abstraction
 *
 * Thin facade over StorageService that makes the "app configuration / metadata"
 * use-case explicit. Each method delegates 1:1 to the underlying StorageService.
 *
 * Rationale: splitting ProjectFileService (project files on disk) from
 * AppDataService (app preferences, recent lists, editor buffer) gives each
 * layer a single, clear responsibility and makes testing straightforward —
 * mock StorageService, assert AppDataService calls through correctly.
 *
 * Usage:
 *   import { getAppDataService } from "@/lib/services/app-data-service";
 *   const appData = getAppDataService();
 *   const recents = await appData.getRecentProjects();
 */

import { getStorageService } from "@/lib/storage/storage-service";
import type {
  StorageSession,
  AppState,
  RecentFile,
  EditorBuffer,
  RecentProject,
} from "@/lib/storage/storage-types";

/**
 * Public interface of AppDataService.
 * Intentionally a strict subset of IStorageService — only the methods
 * that belong to "app data" (preferences, recent lists, editor buffer, session).
 * Direct storage operations (generic key-value, clearAll) are not exposed here.
 */
export interface AppDataServiceInterface {
  /** 最近使ったプロジェクト一覧を取得する */
  getRecentProjects(): Promise<RecentProject[]>;
  /** プロジェクトを最近使った一覧に追加/更新する */
  addRecentProject(project: RecentProject): Promise<void>;
  /** プロジェクトを最近使った一覧から削除する */
  removeRecentProject(projectId: string): Promise<void>;
  /** 最近使ったプロジェクト一覧を全削除する */
  clearRecent(): Promise<void>;

  /** アプリ状態を読み込む */
  getAppState(): Promise<AppState | null>;
  /** アプリ状態を保存する */
  setAppState(appState: AppState): Promise<void>;

  /** エディタバッファを読み込む */
  getEditorBuffer(fileKey?: string): Promise<EditorBuffer | null>;
  /** エディタバッファを保存する */
  setEditorBuffer(buffer: EditorBuffer, fileKey?: string): Promise<void>;
  /** エディタバッファを削除する */
  clearEditorBuffer(fileKey?: string): Promise<void>;

  /** セッション状態をまとめて保存する */
  saveSession(session: StorageSession): Promise<void>;
  /** セッション状態をまとめて読み込む */
  loadSession(): Promise<StorageSession | null>;
}

/**
 * AppDataService implementation — delegates to StorageService.
 */
class AppDataServiceImpl implements AppDataServiceInterface {
  getRecentProjects(): Promise<RecentProject[]> {
    return getStorageService().getRecentProjects();
  }

  addRecentProject(project: RecentProject): Promise<void> {
    return getStorageService().addRecentProject(project);
  }

  removeRecentProject(projectId: string): Promise<void> {
    return getStorageService().removeRecentProject(projectId);
  }

  clearRecent(): Promise<void> {
    return getStorageService().clearRecent();
  }

  getAppState(): Promise<AppState | null> {
    return getStorageService().loadAppState();
  }

  setAppState(appState: AppState): Promise<void> {
    return getStorageService().saveAppState(appState);
  }

  getEditorBuffer(fileKey?: string): Promise<EditorBuffer | null> {
    return getStorageService().loadEditorBuffer(fileKey);
  }

  setEditorBuffer(buffer: EditorBuffer, fileKey?: string): Promise<void> {
    return getStorageService().saveEditorBuffer(buffer, fileKey);
  }

  clearEditorBuffer(fileKey?: string): Promise<void> {
    return getStorageService().clearEditorBuffer(fileKey);
  }

  saveSession(session: StorageSession): Promise<void> {
    return getStorageService().saveSession(session);
  }

  loadSession(): Promise<StorageSession | null> {
    return getStorageService().loadSession();
  }
}

let appDataServiceInstance: AppDataServiceInterface | null = null;

/**
 * Get the global AppDataService instance (singleton).
 */
export function getAppDataService(): AppDataServiceInterface {
  if (!appDataServiceInstance) {
    appDataServiceInstance = new AppDataServiceImpl();
  }
  return appDataServiceInstance;
}

/**
 * Reset the AppDataService singleton.
 * Useful for testing.
 */
export function resetAppDataService(): void {
  appDataServiceInstance = null;
}
