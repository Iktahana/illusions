"use client";

/**
 * Web Storage Provider using IndexedDB via Dexie.
 * Suitable for browser environments and PWAs.
 */

import Dexie, { type Table } from "dexie";
import type {
  IStorageService,
  StorageSession,
  AppState,
  RecentFile,
  EditorBuffer,
} from "./storage-types";

interface StoredAppState {
  id: string;
  data: AppState;
}

interface StoredRecentFile {
  id: string;
  path: string;
  data: RecentFile;
}

interface StoredEditorBuffer {
  id: string;
  data: EditorBuffer;
  fileHandle?: FileSystemFileHandle; // Store file handle separately for better serialization
}

class WebStorageDatabase extends Dexie {
  appState!: Table<StoredAppState, string>;
  recentFiles!: Table<StoredRecentFile, string>;
  editorBuffer!: Table<StoredEditorBuffer, string>;

  constructor() {
    super("IllusionsStorage");
    this.version(1).stores({
      appState: "id",
      recentFiles: "id, path",
      editorBuffer: "id",
    });
  }
}

export class WebStorageProvider implements IStorageService {
  private db: WebStorageDatabase;
  private initialized = false;

  constructor() {
    this.db = new WebStorageDatabase();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      // Test database connectivity
      await this.db.open();
      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize WebStorageProvider:", error);
      throw error;
    }
  }

  async saveSession(session: StorageSession): Promise<void> {
    await this.initialize();

    try {
      // Save all components in parallel
      await Promise.all([
        this.saveAppState(session.appState),
        this.saveRecentFiles(session.recentFiles),
        session.editorBuffer
          ? this.saveEditorBuffer(session.editorBuffer)
          : this.clearEditorBuffer(),
      ]);
    } catch (error) {
      console.error("Failed to save session:", error);
      throw error;
    }
  }

  async loadSession(): Promise<StorageSession | null> {
    await this.initialize();

    try {
      const [appState, recentFiles, editorBuffer] = await Promise.all([
        this.loadAppState(),
        this.getRecentFiles(),
        this.loadEditorBuffer(),
      ]);

      // Return null if nothing is stored
      if (!appState && recentFiles.length === 0 && !editorBuffer) {
        return null;
      }

      return {
        appState: appState || {},
        recentFiles,
        editorBuffer,
      };
    } catch (error) {
      console.error("Failed to load session:", error);
      return null;
    }
  }

  async saveAppState(appState: AppState): Promise<void> {
    await this.initialize();

    try {
      await this.db.appState.put({
        id: "app_state",
        data: appState,
      });
    } catch (error) {
      console.error("Failed to save app state:", error);
      throw error;
    }
  }

  async loadAppState(): Promise<AppState | null> {
    await this.initialize();

    try {
      const stored = await this.db.appState.get("app_state");
      return stored?.data ?? null;
    } catch (error) {
      console.error("Failed to load app state:", error);
      return null;
    }
  }

  async addToRecent(file: RecentFile): Promise<void> {
    await this.initialize();

    try {
      // Remove if already exists
      await this.db.recentFiles.delete(`recent_${file.path}`);

      // Add the new file
      await this.db.recentFiles.put({
        id: `recent_${file.path}`,
        path: file.path,
        data: file,
      });

      // Get all files and trim to 10
      const allFiles = await this.db.recentFiles.toArray();
      if (allFiles.length > 10) {
        // Sort by most recent (assumes data.lastModified is descending)
        // Remove oldest entries
        const sorted = allFiles.sort(
          (a, b) => b.data.lastModified - a.data.lastModified
        );
        const toDelete = sorted.slice(10);
        await this.db.recentFiles.bulkDelete(toDelete.map((f) => f.id));
      }
    } catch (error) {
      console.error("Failed to add to recent files:", error);
      throw error;
    }
  }

  private async saveRecentFiles(files: RecentFile[]): Promise<void> {
    await this.initialize();

    try {
      // Clear existing recent files
      await this.db.recentFiles.clear();

      // Add new files
      const records = files.map((file) => ({
        id: `recent_${file.path}`,
        path: file.path,
        data: file,
      }));

      await this.db.recentFiles.bulkPut(records);
    } catch (error) {
      console.error("Failed to save recent files:", error);
      throw error;
    }
  }

  async getRecentFiles(): Promise<RecentFile[]> {
    await this.initialize();

    try {
      const allFiles = await this.db.recentFiles.toArray();
      return allFiles
        .sort((a, b) => b.data.lastModified - a.data.lastModified)
        .slice(0, 10)
        .map((f) => f.data);
    } catch (error) {
      console.error("Failed to get recent files:", error);
      return [];
    }
  }

  async removeFromRecent(path: string): Promise<void> {
    await this.initialize();

    try {
      await this.db.recentFiles.delete(`recent_${path}`);
    } catch (error) {
      console.error("Failed to remove from recent files:", error);
      throw error;
    }
  }

  async clearRecent(): Promise<void> {
    await this.initialize();

    try {
      await this.db.recentFiles.clear();
    } catch (error) {
      console.error("Failed to clear recent files:", error);
      throw error;
    }
  }

  async saveEditorBuffer(buffer: EditorBuffer): Promise<void> {
    await this.initialize();

    try {
      await this.db.editorBuffer.put({
        id: "editor_buffer",
        data: buffer,
        fileHandle: buffer.fileHandle,
      });
    } catch (error) {
      console.error("Failed to save editor buffer:", error);
      throw error;
    }
  }

  async loadEditorBuffer(): Promise<EditorBuffer | null> {
    await this.initialize();

    try {
      const stored = await this.db.editorBuffer.get("editor_buffer");
      if (!stored?.data) return null;
      
      // Restore file handle if it exists
      if (stored.fileHandle) {
        stored.data.fileHandle = stored.fileHandle;
      }
      
      return stored.data;
    } catch (error) {
      console.error("Failed to load editor buffer:", error);
      return null;
    }
  }

  async clearEditorBuffer(): Promise<void> {
    await this.initialize();

    try {
      await this.db.editorBuffer.delete("editor_buffer");
    } catch (error) {
      console.error("Failed to clear editor buffer:", error);
      throw error;
    }
  }

  async clearAll(): Promise<void> {
    await this.initialize();

    try {
      await Promise.all([
        this.db.appState.clear(),
        this.db.recentFiles.clear(),
        this.db.editorBuffer.clear(),
      ]);
    } catch (error) {
      console.error("Failed to clear all storage:", error);
      throw error;
    }
  }
}

export default WebStorageProvider;
