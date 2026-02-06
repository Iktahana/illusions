/**
 * Sync Orchestrator
 * 
 * Coordinates automatic Git synchronization:
 * - Auto-commit on every save (2 second interval)
 * - Auto-push every minute
 * - Handle offline queuing
 * - Detect conflicts
 */

import { GitService } from "./git-service";
import type { GitAuthor, SyncStatus } from "./types";

export class SyncOrchestrator {
  private gitService: GitService;
  private pushInterval: NodeJS.Timeout | null = null;
  private isActive: boolean = false;
  private pendingCommits: number = 0;
  private lastSync: number | null = null;
  private lastPush: number | null = null;
  private hasConflict: boolean = false;
  private error: string | null = null;
  private isOnline: boolean = navigator.onLine;

  // Callbacks
  private eventHandlers: Map<string, Function[]> = new Map();

  constructor(
    private projectId: string,
    private getContent: () => string,
    private getToken: () => string | null,
    private getAuthor: () => GitAuthor
  ) {
    this.gitService = new GitService(projectId);
    this.setupOnlineListener();
  }

  /**
   * Setup online/offline detection.
   */
  private setupOnlineListener() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        this.isOnline = true;
        this.emit("online");
        // Try to push pending commits
        this.pushIfNeeded();
      });

      window.addEventListener("offline", () => {
        this.isOnline = false;
        this.emit("offline");
      });
    }
  }

  /**
   * Start synchronization.
   */
  async start(repoUrl: string): Promise<void> {
    this.isActive = true;
    this.error = null;

    try {
      // Set remote
      await this.gitService.setRemote(repoUrl);

      // Start background push task (every minute)
      this.pushInterval = setInterval(() => {
        this.pushIfNeeded();
      }, 60 * 1000);

      this.emit("started");
    } catch (error) {
      this.error = error instanceof Error ? error.message : "同期の開始に失敗しました";
      this.emit("error", this.error);
      throw error;
    }
  }

  /**
   * Stop synchronization.
   */
  stop(): void {
    this.isActive = false;

    if (this.pushInterval) {
      clearInterval(this.pushInterval);
      this.pushInterval = null;
    }

    this.emit("stopped");
  }

  /**
   * Called when content is saved (triggered by auto-save every 2 seconds).
   */
  async onContentSave(): Promise<void> {
    if (!this.isActive) return;

    try {
      const content = this.getContent();
      const author = this.getAuthor();
      const message = `自動保存 ${new Date().toLocaleString("ja-JP")}`;

      // Create commit
      await this.gitService.commit(message, content, author);

      this.pendingCommits++;
      this.lastSync = Date.now();
      this.error = null;

      this.emit("committed", { message });
    } catch (error) {
      console.error("Failed to commit:", error);
      this.error = error instanceof Error ? error.message : "コミットに失敗しました";
      this.emit("error", this.error);
    }
  }

  /**
   * Push commits if there are pending commits and we're online.
   */
  private async pushIfNeeded(): Promise<void> {
    if (!this.isActive || this.pendingCommits === 0 || !this.isOnline) {
      return;
    }

    const token = this.getToken();
    if (!token) {
      console.warn("No GitHub token available for push");
      return;
    }

    try {
      this.emit("pushing", { pendingCommits: this.pendingCommits });

      await this.gitService.push(token, (progress) => {
        this.emit("push-progress", progress);
      });

      this.pendingCommits = 0;
      this.lastPush = Date.now();
      this.error = null;

      this.emit("pushed");
    } catch (error: any) {
      console.error("Failed to push:", error);
      
      // Check if it's a conflict
      if (error.message?.includes("non-fast-forward") || error.message?.includes("rejected")) {
        this.hasConflict = true;
        this.error = "競合が発生しました。手動での解決が必要です。";
        this.emit("conflict", this.error);
      } else {
        this.error = error instanceof Error ? error.message : "プッシュに失敗しました";
        this.emit("push-failed", this.error);
      }
    }
  }

  /**
   * Manually trigger synchronization now.
   */
  async syncNow(): Promise<void> {
    if (!this.isActive) {
      throw new Error("同期が開始されていません");
    }

    if (!this.isOnline) {
      throw new Error("オフラインのため同期できません");
    }

    const token = this.getToken();
    if (!token) {
      throw new Error("GitHub トークンがありません");
    }

    try {
      this.emit("syncing");

      // Pull first to check for remote changes
      try {
        await this.gitService.pull(token);
        this.emit("pulled");
      } catch (pullError: any) {
        if (pullError.message?.includes("MergeNotSupportedError")) {
          this.hasConflict = true;
          this.error = "リモートに変更があります。競合の可能性があります。";
          this.emit("conflict", this.error);
          return;
        }
        // If pull fails for other reasons, continue with push
      }

      // Then push local changes
      if (this.pendingCommits > 0) {
        await this.pushIfNeeded();
      }

      this.lastSync = Date.now();
      this.emit("synced");
    } catch (error) {
      this.error = error instanceof Error ? error.message : "同期に失敗しました";
      this.emit("error", this.error);
      throw error;
    }
  }

  /**
   * Get current sync status.
   */
  getSyncStatus(): SyncStatus {
    return {
      isActive: this.isActive,
      lastSync: this.lastSync,
      lastPush: this.lastPush,
      pendingCommits: this.pendingCommits,
      isOnline: this.isOnline,
      hasConflict: this.hasConflict,
      error: this.error,
    };
  }

  /**
   * Register event handler.
   */
  on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  /**
   * Unregister event handler.
   */
  off(event: string, handler: Function): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Emit event to all registered handlers.
   */
  private emit(event: string, data?: any): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in ${event} handler:`, error);
      }
    });
  }

  /**
   * Get the GitService instance.
   */
  getGitService(): GitService {
    return this.gitService;
  }
}
