"use client";

/**
 * File System Access API permission management.
 * Handles checking and requesting directory/file permissions.
 *
 * ファイルシステムアクセス API の権限管理。
 * ディレクトリ・ファイルの読み書き権限を確認・要求する。
 *
 * IMPORTANT: Permission requests (requestWritePermission, requestReadPermission)
 * require a user gesture (e.g., click event) to succeed. Calling them outside
 * of a user gesture context will result in a "denied" or error response.
 *
 * 注意: 権限リクエスト（requestWritePermission, requestReadPermission）は
 * ユーザージェスチャー（クリックイベント等）のコンテキスト内で呼び出す必要があります。
 */

/**
 * Permission status result from checking a handle's permissions.
 * ハンドルの権限状態を表すオブジェクト。
 */
export interface PermissionStatus {
  status: "granted" | "read-only" | "prompt-required" | "denied";
  canWrite: boolean;
  canRead: boolean;
}

/**
 * Extended FileSystemHandle with permission query methods.
 * Chrome/Edge expose these methods on FileSystemHandle.
 */
interface FileSystemHandleWithPermissions extends FileSystemHandle {
  queryPermission(descriptor: { mode: "read" | "readwrite" }): Promise<"granted" | "denied" | "prompt">;
  requestPermission(descriptor: { mode: "read" | "readwrite" }): Promise<"granted" | "denied" | "prompt">;
}

/**
 * Type guard to check if a handle supports the permission API.
 */
function hasPermissionMethods(
  handle: FileSystemHandle
): handle is FileSystemHandleWithPermissions {
  return (
    "queryPermission" in handle &&
    "requestPermission" in handle &&
    typeof (handle as FileSystemHandleWithPermissions).queryPermission === "function" &&
    typeof (handle as FileSystemHandleWithPermissions).requestPermission === "function"
  );
}

/**
 * Manages File System Access API permissions for directory and file handles.
 * Permissions may expire after browser restart, so they should be checked
 * each time a stored handle is restored from IndexedDB.
 *
 * ファイルシステムアクセス権限を管理するクラス。
 * ブラウザ再起動後に権限が失効する場合があるため、
 * IndexedDB から復元したハンドルは毎回権限を確認する必要がある。
 */
export class PermissionManager {
  /**
   * Check whether the File System Access permission API is available.
   * Returns false in non-browser or unsupported environments.
   */
  isPermissionSupported(): boolean {
    if (typeof window === "undefined") return false;
    if (typeof FileSystemHandle === "undefined") return false;

    // Check if queryPermission is available on the prototype
    return "queryPermission" in FileSystemHandle.prototype;
  }

  /**
   * Check current permission status for a directory handle.
   * Does NOT trigger a permission prompt -- safe to call without user gesture.
   *
   * ディレクトリハンドルの現在の権限状態を確認する。
   * 権限プロンプトはトリガーしないため、ユーザージェスチャーなしで呼び出せる。
   */
  async checkDirectoryPermission(
    handle: FileSystemDirectoryHandle
  ): Promise<PermissionStatus> {
    if (!hasPermissionMethods(handle)) {
      // If permission API is not available, assume granted
      // (fallback for environments that don't support queryPermission)
      return {
        status: "granted",
        canWrite: true,
        canRead: true,
      };
    }

    try {
      const [readState, writeState] = await Promise.all([
        handle.queryPermission({ mode: "read" }),
        handle.queryPermission({ mode: "readwrite" }),
      ]);

      if (writeState === "granted") {
        return { status: "granted", canWrite: true, canRead: true };
      }

      if (readState === "granted") {
        return { status: "read-only", canWrite: false, canRead: true };
      }

      if (readState === "prompt" || writeState === "prompt") {
        return { status: "prompt-required", canWrite: false, canRead: false };
      }

      return { status: "denied", canWrite: false, canRead: false };
    } catch (error) {
      console.error("権限状態の確認に失敗しました:", error);
      return { status: "denied", canWrite: false, canRead: false };
    }
  }

  /**
   * Request write (readwrite) permission for a directory handle.
   * MUST be called within a user gesture (e.g., click handler).
   *
   * ディレクトリハンドルへの書き込み権限を要求する。
   * ユーザージェスチャー（クリックハンドラ等）内で呼び出す必要がある。
   *
   * @returns Updated permission status after the request
   */
  async requestWritePermission(
    handle: FileSystemDirectoryHandle
  ): Promise<PermissionStatus> {
    if (!hasPermissionMethods(handle)) {
      return { status: "granted", canWrite: true, canRead: true };
    }

    try {
      const result = await handle.requestPermission({ mode: "readwrite" });

      if (result === "granted") {
        return { status: "granted", canWrite: true, canRead: true };
      }

      // If write was denied, check if read is still available
      const readResult = await handle.queryPermission({ mode: "read" });
      if (readResult === "granted") {
        return { status: "read-only", canWrite: false, canRead: true };
      }

      return { status: "denied", canWrite: false, canRead: false };
    } catch (error) {
      console.error("書き込み権限のリクエストに失敗しました:", error);
      return { status: "denied", canWrite: false, canRead: false };
    }
  }

  /**
   * Request read permission for a directory handle.
   * MUST be called within a user gesture (e.g., click handler).
   *
   * ディレクトリハンドルへの読み取り権限を要求する。
   * ユーザージェスチャー（クリックハンドラ等）内で呼び出す必要がある。
   *
   * @returns Updated permission status after the request
   */
  async requestReadPermission(
    handle: FileSystemDirectoryHandle
  ): Promise<PermissionStatus> {
    if (!hasPermissionMethods(handle)) {
      return { status: "granted", canWrite: true, canRead: true };
    }

    try {
      const result = await handle.requestPermission({ mode: "read" });

      if (result === "granted") {
        // Check if we also have write permission
        const writeResult = await handle.queryPermission({ mode: "readwrite" });
        if (writeResult === "granted") {
          return { status: "granted", canWrite: true, canRead: true };
        }
        return { status: "read-only", canWrite: false, canRead: true };
      }

      return { status: "denied", canWrite: false, canRead: false };
    } catch (error) {
      console.error("読み取り権限のリクエストに失敗しました:", error);
      return { status: "denied", canWrite: false, canRead: false };
    }
  }

  /**
   * Check permission for a file handle (convenience method).
   * Same logic as directory permission check but for FileSystemFileHandle.
   *
   * ファイルハンドルの権限を確認する便利メソッド。
   */
  async checkFilePermission(
    handle: FileSystemFileHandle
  ): Promise<PermissionStatus> {
    if (!hasPermissionMethods(handle)) {
      return { status: "granted", canWrite: true, canRead: true };
    }

    try {
      const [readState, writeState] = await Promise.all([
        handle.queryPermission({ mode: "read" }),
        handle.queryPermission({ mode: "readwrite" }),
      ]);

      if (writeState === "granted") {
        return { status: "granted", canWrite: true, canRead: true };
      }

      if (readState === "granted") {
        return { status: "read-only", canWrite: false, canRead: true };
      }

      if (readState === "prompt" || writeState === "prompt") {
        return { status: "prompt-required", canWrite: false, canRead: false };
      }

      return { status: "denied", canWrite: false, canRead: false };
    } catch (error) {
      console.error("ファイル権限の確認に失敗しました:", error);
      return { status: "denied", canWrite: false, canRead: false };
    }
  }
}

/**
 * Singleton instance of PermissionManager.
 */
let permissionManagerInstance: PermissionManager | null = null;

/**
 * Get the singleton PermissionManager instance.
 */
export function getPermissionManager(): PermissionManager {
  if (!permissionManagerInstance) {
    permissionManagerInstance = new PermissionManager();
  }
  return permissionManagerInstance;
}
