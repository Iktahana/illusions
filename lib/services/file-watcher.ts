/**
 * File change watcher.
 * Web: polls file metadata every 5 seconds.
 * Electron: uses native file system events via IPC.
 *
 * ファイル変更監視。
 * Web: 5秒ごとにファイルのメタデータをポーリング。
 * Electron: IPCを通じてネイティブファイル監視を使用。
 */

import { isElectronRenderer } from "../utils/runtime-env";
import { getVFS } from "../vfs";

import type { VirtualFileSystem, VFSWatchEvent } from "../vfs/types";

// -----------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------

/** Default polling interval in milliseconds for Web file watcher */
const DEFAULT_POLL_INTERVAL_MS = 5000;

/**
 * Maximum number of consecutive poll failures before stopping the watcher.
 * Prevents CPU waste when a file is permanently inaccessible.
 *
 * ウォッチャーを停止するまでの連続ポーリング失敗の最大回数。
 * ファイルが恒久的にアクセス不能な場合のCPU浪費を防止する。
 */
const MAX_CONSECUTIVE_FAILURES = 5;

// -----------------------------------------------------------------------
// Save Suppression
// -----------------------------------------------------------------------

/**
 * Global save-suppression registry.
 * Tracks paths that were recently saved by the application,
 * so watchers can ignore self-triggered change events.
 *
 * A periodic cleanup timer evicts expired entries every 5 minutes
 * to prevent unbounded memory growth in long-running sessions.
 *
 * アプリケーション自身による保存を追跡し、
 * ウォッチャーが自身のトリガーによる変更イベントを無視できるようにする。
 * 5分ごとに期限切れエントリを削除し、長時間セッションでのメモリ増大を防止する。
 */
const saveSuppression = new Map<string, number>();

/** Default suppression duration in milliseconds */
const SAVE_SUPPRESSION_MS = 3000;

/** Interval for periodic cleanup of expired suppression entries (5 minutes) */
const SUPPRESSION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Remove all expired entries from the saveSuppression map.
 * Called periodically to prevent unbounded growth.
 *
 * 期限切れのエントリをsaveSuppressionマップから削除する。
 * メモリの無制限な増加を防ぐため定期的に呼び出される。
 */
function cleanupExpiredSuppressions(): void {
  const now = Date.now();
  for (const [filePath, until] of saveSuppression) {
    if (now >= until) {
      saveSuppression.delete(filePath);
    }
  }
}

// Start periodic cleanup timer (unref so it does not keep the process alive)
const suppressionCleanupTimer = setInterval(cleanupExpiredSuppressions, SUPPRESSION_CLEANUP_INTERVAL_MS);
if (typeof suppressionCleanupTimer === "object" && "unref" in suppressionCleanupTimer) {
  suppressionCleanupTimer.unref();
}

/**
 * Suppress file watch notifications for the given path.
 * Call this before saving a file to prevent the watcher
 * from treating the save as an external change.
 *
 * 指定パスのファイル監視通知を一時的に抑制する。
 * ファイル保存前に呼び出し、ウォッチャーが自身の保存を
 * 外部変更として扱うのを防ぐ。
 *
 * @param filePath - The file path to suppress notifications for
 * @param durationMs - How long to suppress (default 3000ms)
 */
export function suppressFileWatch(filePath: string, durationMs: number = SAVE_SUPPRESSION_MS): void {
  saveSuppression.set(filePath, Date.now() + durationMs);
}

function isFileSuppressed(filePath: string): boolean {
  const until = saveSuppression.get(filePath);
  if (!until) return false;
  if (Date.now() < until) return true;
  saveSuppression.delete(filePath);
  return false;
}

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

/**
 * Callback invoked when a watched file changes.
 * 監視対象ファイルが変更されたときに呼ばれるコールバック。
 */
export type FileChangeCallback = (content: string) => void;

/**
 * Options for creating a file watcher.
 * ファイルウォッチャーの作成オプション。
 */
export interface FileWatcherOptions {
  /** Path to the file to watch (relative to VFS root) */
  path: string;
  /** Callback invoked when the file content changes */
  onChanged: FileChangeCallback;
  /** Polling interval in milliseconds (Web only, defaults to 5000) */
  pollIntervalMs?: number;
}

/**
 * Interface for file watchers across all platforms.
 * 全プラットフォーム共通のファイルウォッチャーインターフェース。
 */
export interface FileWatcher {
  /** Start watching for changes / 変更監視を開始する */
  start(): void;
  /** Stop watching for changes / 変更監視を停止する */
  stop(): void;
  /** Whether the watcher is currently active / 現在監視中かどうか */
  readonly isActive: boolean;
}

// -----------------------------------------------------------------------
// WebFileWatcher
// -----------------------------------------------------------------------

/**
 * Polling-based file watcher for Web environments.
 * Checks the file's lastModified timestamp every pollIntervalMs milliseconds.
 * When a change is detected, reads the content and invokes the callback.
 *
 * Web環境用のポーリングベースファイルウォッチャー。
 * pollIntervalMs ミリ秒ごとにファイルの lastModified を確認する。
 * 変更を検出したらコンテンツを読み込みコールバックを呼び出す。
 */
class WebFileWatcher implements FileWatcher {
  private readonly vfs: VirtualFileSystem;
  private readonly path: string;
  private readonly onChanged: FileChangeCallback;
  private readonly pollIntervalMs: number;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private lastModified: number = 0;
  private _isActive = false;
  /** Track consecutive poll failures for automatic stop */
  private consecutiveFailures = 0;

  constructor(options: FileWatcherOptions) {
    this.vfs = getVFS();
    this.path = options.path;
    this.onChanged = options.onChanged;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  /**
   * Start polling for file changes.
   * ファイル変更のポーリングを開始する。
   */
  start(): void {
    if (this._isActive) {
      return;
    }

    this._isActive = true;

    // Initialize lastModified before starting to poll
    void this.initializeLastModified().then(() => {
      if (!this._isActive) return;
      this.timerId = setInterval(() => {
        void this.checkForChanges();
      }, this.pollIntervalMs);
    });
  }

  /**
   * Stop polling for file changes.
   * ファイル変更のポーリングを停止する。
   */
  stop(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this._isActive = false;
  }

  /**
   * Read the current lastModified timestamp to establish a baseline.
   * 初期のベースラインとして現在の lastModified を取得する。
   */
  private async initializeLastModified(): Promise<void> {
    try {
      const metadata = await this.vfs.getFileMetadata(this.path);
      this.lastModified = metadata.lastModified;
    } catch {
      // File may not exist yet; start with 0
      this.lastModified = 0;
    }
  }

  /**
   * Check if the file has changed since the last poll.
   * Tracks consecutive failures and stops watching after MAX_CONSECUTIVE_FAILURES.
   *
   * 前回のポーリング以降にファイルが変更されたか確認する。
   * MAX_CONSECUTIVE_FAILURES 回連続で失敗した場合、監視を自動停止する。
   */
  private async checkForChanges(): Promise<void> {
    const suppressed = isFileSuppressed(this.path);

    try {
      const metadata = await this.vfs.getFileMetadata(this.path);

      // Reset failure counter on successful access
      this.consecutiveFailures = 0;

      if (metadata.lastModified > this.lastModified) {
        this.lastModified = metadata.lastModified;

        // Skip callback if suppressed (app's own save), but still update baseline
        if (!suppressed) {
          const content = await this.vfs.readFile(this.path);
          this.onChanged(content);
        }
      }
    } catch {
      this.consecutiveFailures++;

      if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.warn(
          `File watcher stopped after ${MAX_CONSECUTIVE_FAILURES} consecutive failures: ${this.path} / ` +
          `ファイル監視を ${MAX_CONSECUTIVE_FAILURES} 回連続失敗のため停止しました: ${this.path}`
        );
        this.stop();
      }
    }
  }
}

// -----------------------------------------------------------------------
// ElectronFileWatcher
// -----------------------------------------------------------------------

/**
 * File watcher for Electron environments.
 * Uses native file system events via IPC when available.
 * Falls back to polling if the Electron VFS watch API is not supported.
 *
 * Electron環境用のファイルウォッチャー。
 * 利用可能な場合はIPCを通じてネイティブファイル監視を使用する。
 * Electron VFS watch APIが未対応の場合はポーリングにフォールバックする。
 */
class ElectronFileWatcher implements FileWatcher {
  private readonly vfs: VirtualFileSystem;
  private readonly path: string;
  private readonly onChanged: FileChangeCallback;
  private readonly pollIntervalMs: number;
  private nativeWatcher: { stop: () => void } | null = null;
  private fallbackWatcher: WebFileWatcher | null = null;
  private _isActive = false;

  constructor(options: FileWatcherOptions) {
    this.vfs = getVFS();
    this.path = options.path;
    this.onChanged = options.onChanged;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  /**
   * Start watching for file changes.
   * Attempts to use native Electron watch; falls back to polling.
   *
   * ファイル変更監視を開始する。
   * Electronネイティブ監視を試み、不可の場合はポーリングにフォールバック。
   */
  start(): void {
    if (this._isActive) {
      return;
    }

    this._isActive = true;

    // Try native watching first
    if (this.tryStartNativeWatch()) {
      return;
    }

    // Fall back to polling
    this.fallbackWatcher = new WebFileWatcher({
      path: this.path,
      onChanged: this.onChanged,
      pollIntervalMs: this.pollIntervalMs,
    });
    this.fallbackWatcher.start();
  }

  /**
   * Stop watching for file changes.
   * ファイル変更監視を停止する。
   */
  stop(): void {
    if (this.nativeWatcher) {
      this.nativeWatcher.stop();
      this.nativeWatcher = null;
    }

    if (this.fallbackWatcher) {
      this.fallbackWatcher.stop();
      this.fallbackWatcher = null;
    }

    this._isActive = false;
  }

  /**
   * Attempt to start native file watching via Electron VFS IPC.
   * Returns true if native watching was successfully started.
   *
   * Electron VFS IPC を通じてネイティブファイル監視の開始を試みる。
   * 成功した場合は true を返す。
   */
  private tryStartNativeWatch(): boolean {
    try {
      // Check if the VFS supports watchFile
      if (typeof this.vfs.watchFile !== "function") {
        return false;
      }

      const watcher = this.vfs.watchFile(this.path, (event: VFSWatchEvent) => {
        if (event.type === "change") {
          // Read the updated content and notify
          void this.readAndNotify();
        }
      });

      this.nativeWatcher = watcher;
      return true;
    } catch {
      // Native watching not available
      return false;
    }
  }

  /**
   * Read file content and invoke the change callback.
   * Handles permission revocation and other errors gracefully.
   *
   * ファイルの内容を読み込み、変更コールバックを呼び出す。
   * 権限の取り消しやその他のエラーを適切に処理する。
   */
  private async readAndNotify(): Promise<void> {
    // Skip if this path was recently saved by the application
    if (isFileSuppressed(this.path)) {
      return;
    }

    try {
      const content = await this.vfs.readFile(this.path);
      this.onChanged(content);
    } catch (error) {
      // Check for permission-related errors (DOMException with NotAllowedError)
      if (
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "SecurityError")
      ) {
        console.warn(
          `File watcher stopping due to permission revocation: ${this.path} / ` +
          `権限が取り消されたためファイル監視を停止します: ${this.path}`
        );
        this.stop();
        return;
      }
      // Other errors (file deleted, etc.) are non-fatal; just log
      console.warn(
        `File watcher failed to read file: ${this.path}`,
        error
      );
    }
  }
}

// -----------------------------------------------------------------------
// Factory Function
// -----------------------------------------------------------------------

/**
 * Create a file watcher appropriate for the current environment.
 * Returns an ElectronFileWatcher in Electron, or a WebFileWatcher in browsers.
 *
 * 現在の環境に適したファイルウォッチャーを作成する。
 * Electron環境ではElectronFileWatcher、ブラウザ環境ではWebFileWatcherを返す。
 *
 * @param options - File watcher configuration
 * @returns A FileWatcher instance (not yet started; call start() to begin watching)
 */
export function createFileWatcher(options: FileWatcherOptions): FileWatcher {
  if (isElectronRenderer()) {
    return new ElectronFileWatcher(options);
  }
  return new WebFileWatcher(options);
}
