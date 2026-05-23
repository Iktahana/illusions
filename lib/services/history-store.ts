/**
 * HistoryStore — Phase 8 IO layer
 *
 * All file system operations for the history backend.
 * Delegates to ProjectFileService (VFS) for actual IO.
 * Contains an AsyncMutex for in-process serialization and bridges to the
 * cross-window IPC index lock in Electron.
 *
 * 履歴 IO レイヤー — Phase 8。
 * 履歴バックエンドのすべてのファイルシステム操作を担う。
 * IO の実体は ProjectFileService (VFS) に委譲する。
 * プロセス内直列化用 AsyncMutex と Electron IPC インデックスロックを内包する。
 */

import { getProjectFileService } from "@/lib/services/project-file-service";
import { AsyncMutex } from "@/lib/utils/async-mutex";
import { isElectronRenderer } from "@/lib/utils/runtime-env";

import type { VFSDirectoryHandle } from "@/lib/vfs/types";
import type { HistoryIndex } from "./history-policy";
import { createDefaultHistoryIndex } from "./history-policy";

// -----------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------

/** Path to the history directory relative to .illusions */
const HISTORY_DIR_NAME = "history";

/** Name of the history index file */
const HISTORY_INDEX_FILENAME = "index.json";

/** Name of the bookmarks file */
export const BOOKMARKS_FILENAME = ".history_bookmarks.json";

/** Lock key for the history index — shared across all windows in the same app instance */
const HISTORY_INDEX_LOCK_KEY = "history-index";

// -----------------------------------------------------------------------
// HistoryStore
// -----------------------------------------------------------------------

/**
 * IO layer for the history backend.
 * All public methods are async and serialize through the index mutex + IPC lock.
 *
 * 履歴バックエンドの IO レイヤー。
 * すべての公開メソッドは非同期で、インデックスミューテックス + IPC ロックで直列化される。
 */
export class HistoryStore {
  private readonly indexMutex = new AsyncMutex();
  private readonly bookmarkMutex = new AsyncMutex();

  // -----------------------------------------------------------------------
  // Index IO
  // -----------------------------------------------------------------------

  /**
   * Read the history index from .illusions/history/index.json.
   * Creates a default index if the file does not exist.
   *
   * .illusions/history/index.json から履歴インデックスを読み込む。
   * ファイルが存在しない場合はデフォルトのインデックスを作成する。
   */
  async loadIndex(): Promise<HistoryIndex> {
    let content: string;
    try {
      const historyDir = await this.getHistoryDirectory();
      const indexHandle = await historyDir.getFileHandle(HISTORY_INDEX_FILENAME);
      content = await indexHandle.read();
    } catch {
      // Index file doesn't exist (e.g. ENOENT on first run); return defaults
      return createDefaultHistoryIndex();
    }

    // Parse separately so JSON corruption throws and propagates to caller
    // rather than silently returning an empty index that would overwrite data.
    return JSON.parse(content) as HistoryIndex;
  }

  /**
   * Write the history index to .illusions/history/index.json.
   * 履歴インデックスを .illusions/history/index.json に書き込む。
   */
  async saveIndex(index: HistoryIndex): Promise<void> {
    const historyDir = await this.ensureHistoryDirectory();
    const indexHandle = await historyDir.getFileHandle(HISTORY_INDEX_FILENAME, { create: true });
    await indexHandle.write(JSON.stringify(index, null, 2));
  }

  // -----------------------------------------------------------------------
  // Snapshot file IO
  // -----------------------------------------------------------------------

  /**
   * Write snapshot content to a history file.
   * スナップショット内容を履歴ファイルに書き込む。
   *
   * @param _sourcePath - Source file path (reserved for future per-file subdirs)
   * @param filename    - History filename (e.g. "main.mdi.[20260206143025_0123].__auto__.history")
   * @param content     - Content to write
   */
  async writeSnapshotFile(_sourcePath: string, filename: string, content: string): Promise<void> {
    const historyDir = await this.ensureHistoryDirectory();
    const fileHandle = await historyDir.getFileHandle(filename, { create: true });
    await fileHandle.write(content);
  }

  /**
   * Read snapshot content from a history file.
   * 履歴ファイルからスナップショット内容を読み込む。
   *
   * @param _sourcePath - Source file path (reserved for future per-file subdirs)
   * @param filename    - History filename to read
   * @returns File content as string
   */
  async readSnapshotFile(_sourcePath: string, filename: string): Promise<string> {
    const historyDir = await this.getHistoryDirectory();
    const fileHandle = await historyDir.getFileHandle(filename);
    return fileHandle.read();
  }

  /**
   * Delete a snapshot file.
   * スナップショットファイルを削除する。
   *
   * @param _sourcePath - Source file path (reserved for future per-file subdirs)
   * @param filename    - History filename to delete
   */
  async deleteSnapshotFile(_sourcePath: string, filename: string): Promise<void> {
    try {
      const historyDir = await this.getHistoryDirectory();
      await historyDir.removeEntry(filename);
    } catch {
      // File may already be deleted; log and continue
      console.warn(`Failed to delete snapshot file: ${filename}`);
    }
  }

  // -----------------------------------------------------------------------
  // Bookmarks IO
  // -----------------------------------------------------------------------

  /**
   * Read bookmarks from the bookmarks file.
   * ブックマークファイルからブックマーク一覧を読み込む。
   */
  async loadBookmarks(): Promise<Set<string>> {
    let content: string;
    try {
      const historyDir = await this.getHistoryDirectory();
      const handle = await historyDir.getFileHandle(BOOKMARKS_FILENAME);
      content = await handle.read();
    } catch {
      return new Set();
    }

    // Parse separately so JSON corruption propagates rather than silently clearing bookmarks.
    const ids = JSON.parse(content) as string[];
    return new Set(ids);
  }

  /**
   * Write bookmarks to the bookmarks file.
   * ブックマーク一覧をブックマークファイルに書き込む。
   */
  async saveBookmarks(bookmarks: Set<string>): Promise<void> {
    const historyDir = await this.ensureHistoryDirectory();
    const handle = await historyDir.getFileHandle(BOOKMARKS_FILENAME, { create: true });
    await handle.write(JSON.stringify([...bookmarks], null, 2));
  }

  // -----------------------------------------------------------------------
  // Directory management
  // -----------------------------------------------------------------------

  /**
   * Ensure the .illusions/history/ directory exists, creating it if needed.
   * .illusions/history/ ディレクトリが存在することを保証する。
   */
  async ensureHistoryDir(): Promise<void> {
    await this.ensureHistoryDirectory();
  }

  // -----------------------------------------------------------------------
  // Lock management
  // -----------------------------------------------------------------------

  /**
   * Execute a callback while holding the history index lock.
   *
   * In Electron, uses an IPC-based lock registry in the main process. Because
   * the main-process event loop is single-threaded, Map operations there are
   * inherently atomic — no TOCTOU race is possible. Locks are automatically
   * released by the main process when a window closes.
   *
   * In the web build, only the in-process AsyncMutex is used. A single-page
   * web app has exactly one renderer, so the mutex is sufficient.
   *
   * Electron では IPC を使ってメインプロセス内のロックレジストリで排他制御する。
   * Web ビルドでは AsyncMutex のみを使用する（レンダラは常に 1 つのため）。
   *
   * @param fn - Async callback to run under the lock
   * @returns The value returned by fn
   */
  async withIndexLock<T>(fn: () => Promise<T>): Promise<T> {
    const releaseMutex = await this.indexMutex.acquire();

    if (isElectronRenderer()) {
      const vfs = window.electronAPI?.vfs;
      if (!vfs) {
        // vfs bridge is unexpectedly absent — fall back to mutex-only
        try {
          return await fn();
        } finally {
          releaseMutex();
        }
      }
      await vfs.indexLockAcquire(HISTORY_INDEX_LOCK_KEY);
      try {
        return await fn();
      } finally {
        await vfs.indexLockRelease(HISTORY_INDEX_LOCK_KEY);
        releaseMutex();
      }
    } else {
      try {
        return await fn();
      } finally {
        releaseMutex();
      }
    }
  }

  /**
   * Acquire the bookmark mutex and return a release function.
   * ブックマークミューテックスを取得し、解放関数を返す。
   */
  async acquireBookmarkLock(): Promise<() => void> {
    return this.bookmarkMutex.acquire();
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Get the history directory handle.
   * Assumes it already exists (use ensureHistoryDirectory for creation).
   *
   * 履歴ディレクトリのハンドルを取得する。
   * 既に存在していることを前提とする（作成には ensureHistoryDirectory を使用）。
   */
  private async getHistoryDirectory(): Promise<VFSDirectoryHandle> {
    const vfs = getProjectFileService();
    const rootDir = await vfs.getDirectoryHandle("");
    const illusionsDir = await rootDir.getDirectoryHandle(".illusions", { create: true });
    return illusionsDir.getDirectoryHandle(HISTORY_DIR_NAME);
  }

  /**
   * Ensure the .illusions/history/ directory exists, creating it if needed.
   * .illusions/history/ ディレクトリが存在することを保証する。
   */
  private async ensureHistoryDirectory(): Promise<VFSDirectoryHandle> {
    const vfs = getProjectFileService();
    const rootDir = await vfs.getDirectoryHandle("");
    const illusionsDir = await rootDir.getDirectoryHandle(".illusions", { create: true });
    return illusionsDir.getDirectoryHandle(HISTORY_DIR_NAME, { create: true });
  }
}
