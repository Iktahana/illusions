"use client";

/**
 * Project handle persistence manager.
 * Stores and restores FileSystemDirectoryHandle in IndexedDB.
 *
 * プロジェクトハンドル永続化マネージャー。
 * FileSystemDirectoryHandle を IndexedDB に保存・復元する。
 *
 * FileSystemDirectoryHandle is stored directly in IndexedDB via the
 * Structured Clone Algorithm. However, permissions on restored handles
 * may expire after browser restart and need to be re-requested.
 *
 * FileSystemDirectoryHandle は Structured Clone Algorithm を通じて
 * IndexedDB に直接保存される。ただし、ブラウザ再起動後は
 * 復元したハンドルの権限が失効する場合があり、再要求が必要になる。
 */

import { getWebStorageDatabase } from "./web-storage";
import { PermissionManager, getPermissionManager } from "./permission-manager";
import type { StoredProjectHandle } from "./web-storage";
import type { PermissionStatus } from "./permission-manager";

/**
 * Result of restoring a project handle from IndexedDB.
 * ハンドル復元結果。
 */
export interface RestoreResult {
  success: boolean;
  handle: FileSystemDirectoryHandle | null;
  permissionStatus: PermissionStatus;
  error?: string;
}

/**
 * Project handle summary for listing stored projects.
 * 保存済みプロジェクト一覧用のサマリ情報。
 */
export interface ProjectHandleSummary {
  projectId: string;
  lastAccessedAt: number;
  permissionState: "granted" | "denied" | "prompt";
}

/**
 * Manages persistence of FileSystemDirectoryHandle in IndexedDB.
 * Coordinates with PermissionManager for permission checks.
 *
 * IndexedDB への FileSystemDirectoryHandle の永続化を管理する。
 * 権限チェックは PermissionManager と連携する。
 */
export class ProjectManager {
  private permissionManager: PermissionManager;

  constructor() {
    this.permissionManager = getPermissionManager();
  }

  /**
   * Save a project's directory handle to IndexedDB.
   * Also checks and records the current permission state.
   *
   * プロジェクトのディレクトリハンドルを IndexedDB に保存する。
   * 現在の権限状態も合わせて記録する。
   *
   * @param projectId - Unique project identifier
   * @param rootHandle - The directory handle to persist
   */
  async saveProjectHandle(
    projectId: string,
    rootHandle: FileSystemDirectoryHandle
  ): Promise<void> {
    const db = getWebStorageDatabase();

    try {
      // Check current permission state before saving
      const permissionStatus = await this.permissionManager.checkDirectoryPermission(rootHandle);

      let permissionState: "granted" | "denied" | "prompt";
      switch (permissionStatus.status) {
        case "granted":
        case "read-only":
          permissionState = "granted";
          break;
        case "prompt-required":
          permissionState = "prompt";
          break;
        case "denied":
          permissionState = "denied";
          break;
      }

      const record: StoredProjectHandle = {
        projectId,
        rootHandle,
        lastAccessedAt: Date.now(),
        permissionState,
      };

      await db.projectHandles.put(record);
    } catch (error) {
      console.error("プロジェクトハンドルの保存に失敗しました:", error);
      throw error;
    }
  }

  /**
   * Restore a project's directory handle from IndexedDB.
   * Checks if the handle is still valid and verifies permission state.
   *
   * IndexedDB からプロジェクトのディレクトリハンドルを復元する。
   * ハンドルの有効性と権限状態を確認する。
   *
   * NOTE: If permission is "prompt-required", the caller must request
   * permission within a user gesture (click event) using PermissionManager.
   *
   * 注意: 権限が "prompt-required" の場合、呼び出し元はユーザージェスチャー内で
   * PermissionManager を使って権限をリクエストする必要がある。
   *
   * @param projectId - Unique project identifier
   * @returns Restore result with handle, permission status, and error info
   */
  async restoreProjectHandle(projectId: string): Promise<RestoreResult> {
    const db = getWebStorageDatabase();

    try {
      const stored = await db.projectHandles.get(projectId);

      if (!stored) {
        return {
          success: false,
          handle: null,
          permissionStatus: { status: "denied", canWrite: false, canRead: false },
          error: `Project handle not found: ${projectId}`,
        };
      }

      // Validate that the stored handle is a real FileSystemDirectoryHandle
      // IndexedDB Structured Clone may fail to preserve the prototype in some browsers
      if (
        !stored.rootHandle ||
        typeof stored.rootHandle.getDirectoryHandle !== "function"
      ) {
        console.warn(
          "Stored handle is missing or not a valid FileSystemDirectoryHandle / 保存されたハンドルが無効です:",
          projectId
        );
        try {
          await db.projectHandles.delete(projectId);
        } catch {
          // Ignore cleanup errors
        }
        return {
          success: false,
          handle: null,
          permissionStatus: { status: "denied", canWrite: false, canRead: false },
          error: `Stored handle for project "${projectId}" is invalid. Please re-open the project from the directory picker.`,
        };
      }

      // Verify the handle is still valid by checking permissions
      const permissionStatus = await this.permissionManager.checkDirectoryPermission(
        stored.rootHandle
      );

      // Update the stored permission state and last accessed time
      let permissionState: "granted" | "denied" | "prompt";
      switch (permissionStatus.status) {
        case "granted":
        case "read-only":
          permissionState = "granted";
          break;
        case "prompt-required":
          permissionState = "prompt";
          break;
        case "denied":
          permissionState = "denied";
          break;
      }

      await db.projectHandles.update(projectId, {
        lastAccessedAt: Date.now(),
        permissionState,
      });

      return {
        success: permissionStatus.canRead,
        handle: stored.rootHandle,
        permissionStatus,
      };
    } catch (error) {
      console.error("プロジェクトハンドルの復元に失敗しました:", error);

      // Handle may have become invalid (e.g., directory deleted)
      return {
        success: false,
        handle: null,
        permissionStatus: { status: "denied", canWrite: false, canRead: false },
        error: error instanceof Error ? error.message : "Unknown error during handle restoration",
      };
    }
  }

  /**
   * Remove a stored project handle from IndexedDB.
   * プロジェクトハンドルを IndexedDB から削除する。
   *
   * @param projectId - Unique project identifier
   */
  async removeProjectHandle(projectId: string): Promise<void> {
    const db = getWebStorageDatabase();

    try {
      await db.projectHandles.delete(projectId);
    } catch (error) {
      console.error("プロジェクトハンドルの削除に失敗しました:", error);
      throw error;
    }
  }

  /**
   * List all stored project handles with their metadata.
   * Returns summaries sorted by last accessed time (most recent first).
   *
   * 保存済みプロジェクトハンドルの一覧をメタデータ付きで返す。
   * 最終アクセス日時の降順でソートされる。
   */
  async listProjectHandles(): Promise<ProjectHandleSummary[]> {
    const db = getWebStorageDatabase();

    try {
      const allHandles = await db.projectHandles.toArray();

      // Filter out corrupt or incomplete entries
      const validHandles = allHandles.filter((record) => {
        if (
          !record.projectId ||
          typeof record.lastAccessedAt !== "number" ||
          !record.permissionState
        ) {
          console.warn(
            "Skipping corrupt IndexedDB entry / 破損したIndexedDBエントリをスキップします:",
            record.projectId ?? "(unknown)"
          );
          return false;
        }
        return true;
      });

      return validHandles
        .map((record) => ({
          projectId: record.projectId,
          lastAccessedAt: record.lastAccessedAt,
          permissionState: record.permissionState,
        }))
        .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
    } catch (error) {
      console.error("プロジェクトハンドル一覧の取得に失敗しました:", error);
      return [];
    }
  }

  /**
   * Update the last accessed timestamp for a project.
   * プロジェクトの最終アクセス日時を更新する。
   *
   * @param projectId - Unique project identifier
   */
  async touchProject(projectId: string): Promise<void> {
    const db = getWebStorageDatabase();

    try {
      await db.projectHandles.update(projectId, {
        lastAccessedAt: Date.now(),
      });
    } catch (error) {
      console.error("プロジェクトのアクセス日時更新に失敗しました:", error);
      // Non-critical error, don't throw
    }
  }

  /**
   * Check if a project handle exists in IndexedDB.
   * プロジェクトハンドルが IndexedDB に存在するか確認する。
   *
   * @param projectId - Unique project identifier
   */
  async hasProjectHandle(projectId: string): Promise<boolean> {
    const db = getWebStorageDatabase();

    try {
      const count = await db.projectHandles
        .where("projectId")
        .equals(projectId)
        .count();
      return count > 0;
    } catch (error) {
      console.error("プロジェクトハンドルの存在確認に失敗しました:", error);
      return false;
    }
  }
}

/**
 * Singleton instance of ProjectManager.
 */
let projectManagerInstance: ProjectManager | null = null;

/**
 * Get the singleton ProjectManager instance.
 */
export function getProjectManager(): ProjectManager {
  if (!projectManagerInstance) {
    projectManagerInstance = new ProjectManager();
  }
  return projectManagerInstance;
}
