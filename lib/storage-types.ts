/**
 * Storage abstraction layer types and interfaces.
 * Provides a unified API for Web (IndexedDB) and Electron (SQLite) storage.
 */

/**
 * Represents a recent file entry.
 */
export interface RecentFile {
  name: string;
  path: string;
  lastModified: number;
  snippet?: string;
}

/**
 * Application state that needs to persist across sessions.
 */
export interface AppState {
  lastOpenedMdiPath?: string;
}

/**
 * Editor buffer containing unsaved draft content for crash recovery.
 * For Web environment, can also store FileSystemFileHandle for auto-recovery.
 */
export interface EditorBuffer {
  content: string;
  timestamp: number;
  fileHandle?: FileSystemFileHandle; // Web only - file handle for continuing previous edit
}

/**
 * Storage session representing all persistent application state.
 */
export interface StorageSession {
  appState: AppState;
  recentFiles: RecentFile[];
  editorBuffer: EditorBuffer | null;
}

/**
 * Core storage service interface that abstracts platform differences.
 * Implementations should handle both Web (IndexedDB) and Electron (SQLite) environments.
 */
export interface IStorageService {
  /**
   * Initialize the storage service.
   * Must be called before any other operations.
   */
  initialize(): Promise<void>;

  /**
   * Save the complete session state.
   * This persists app state, recent files, and editor buffer all at once.
   */
  saveSession(session: StorageSession): Promise<void>;

  /**
   * Load the complete session state.
   * Returns null if no session exists yet.
   */
  loadSession(): Promise<StorageSession | null>;

  /**
   * Save the application state (e.g., last opened file path).
   */
  saveAppState(appState: AppState): Promise<void>;

  /**
   * Load the application state.
   */
  loadAppState(): Promise<AppState | null>;

  /**
   * Add a file to the recent files list.
   * If the file already exists, it will be updated and moved to the front.
   * The list is kept to a maximum of 10 items.
   */
  addToRecent(file: RecentFile): Promise<void>;

  /**
   * Get the list of recent files (up to 10 items).
   */
  getRecentFiles(): Promise<RecentFile[]>;

  /**
   * Remove a file from the recent files list by path.
   */
  removeFromRecent(path: string): Promise<void>;

  /**
   * Clear all recent files.
   */
  clearRecent(): Promise<void>;

  /**
   * Save the editor buffer (unsaved draft content).
   */
  saveEditorBuffer(buffer: EditorBuffer): Promise<void>;

  /**
   * Load the editor buffer.
   */
  loadEditorBuffer(): Promise<EditorBuffer | null>;

  /**
   * Clear the editor buffer.
   */
  clearEditorBuffer(): Promise<void>;

  /**
   * Clear all data. Use with caution.
   */
  clearAll(): Promise<void>;
}

/**
 * Type guard to determine if we're in Electron environment.
 */
export function isElectronEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  return typeof (window as any).electronAPI !== "undefined";
}
