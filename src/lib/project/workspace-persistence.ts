/**
 * Mutex-protected read-modify-write for .illusions/workspace.json.
 *
 * All writes to workspace.json MUST go through persistWorkspaceJson()
 * to serialize updates and preserve a last-known-good backup.
 *
 * workspace.json への書き込みはすべて persistWorkspaceJson() を通す。
 * TOCTOU レースコンディションと部分上書きを防止する。
 */

import { AsyncMutex } from "@/shared/lib/async-mutex";
import { getProjectFileService } from "@/lib/services/project-file-service";
import { isAbsolutePath, joinPath } from "@/lib/vfs/path-utils";
import type { WorkspaceState } from "./project-types";
import { getDefaultWorkspaceState } from "./project-types";

const workspaceMutex = new AsyncMutex();
const WORKSPACE_JSON_PATH = ".illusions/workspace.json";
const WORKSPACE_JSON_BACKUP_PATH = ".illusions/workspace.json.bak";

function stableWorkspaceJson(state: WorkspaceState): string {
  return JSON.stringify(state, null, 2);
}

async function readWorkspaceState(vfs: ReturnType<typeof getProjectFileService>): Promise<{
  state: WorkspaceState;
  lastKnownGoodJson: string;
}> {
  for (const path of [WORKSPACE_JSON_PATH, WORKSPACE_JSON_BACKUP_PATH]) {
    try {
      const text = await vfs.readFile(path);
      const state = JSON.parse(text) as WorkspaceState;
      return { state, lastKnownGoodJson: stableWorkspaceJson(state) };
    } catch {
      // Try the next source. Missing/corrupt primary falls back to backup.
    }
  }

  const state = getDefaultWorkspaceState();
  return { state, lastKnownGoodJson: stableWorkspaceJson(state) };
}

/**
 * Merge partial updates into .illusions/workspace.json.
 * Reads the current file, falls back to a backup when the primary is corrupt,
 * shallow-merges the given fields, and replaces the primary via a temp file.
 * No-ops silently if VFS root is not set (standalone mode).
 *
 * @param updates - Partial workspace state fields to merge
 */
export async function persistWorkspaceJson(updates: Partial<WorkspaceState>): Promise<void> {
  const release = await workspaceMutex.acquire();
  try {
    const vfs = getProjectFileService();
    // Guard: VFS root must be set (project mode)
    if ("isReady" in vfs && typeof vfs.isReady === "function" && !vfs.isReady()) return;

    const { state: current, lastKnownGoodJson } = await readWorkspaceState(vfs);
    const merged: WorkspaceState = { ...current, ...updates };
    const tempPath = `${WORKSPACE_JSON_PATH}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      await vfs.writeFile(WORKSPACE_JSON_BACKUP_PATH, lastKnownGoodJson);
      await vfs.writeFile(tempPath, stableWorkspaceJson(merged));
      await vfs.rename(tempPath, WORKSPACE_JSON_PATH);
    } catch (error) {
      try {
        await vfs.deleteFile(tempPath);
      } catch {
        // Best-effort cleanup only.
      }
      throw error;
    }
  } catch {
    // Non-fatal: workspace.json write failure should not crash the app
  } finally {
    release();
  }
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Convert an absolute file path to a project-relative path.
 * Returns null if the path is outside the project root.
 *
 * Handles:
 * - Unix absolute paths (/Users/x/project/file.mdi)
 * - Windows drive paths (C:\Users\x\project\file.mdi)
 * - Already-relative paths (returned as-is)
 * - Separator normalization (backslash → forward slash)
 *
 * @param absolutePath - The file path to convert
 * @param rootPath - Project root path (null for Web mode where paths are already relative)
 */
export function toRelativePath(absolutePath: string, rootPath: string | null): string | null {
  if (!rootPath) {
    // Web mode: paths are already relative
    return absolutePath;
  }
  // Normalize separators
  const normalizedPath = absolutePath.replace(/\\/g, "/");
  const normalizedRoot = rootPath.replace(/\\/g, "/").replace(/\/+$/, "");

  if (!isAbsolutePath(normalizedPath)) {
    // Already relative
    return normalizedPath;
  }

  // Case-insensitive prefix check on Windows (drive letters)
  const pathLower = normalizedPath.toLowerCase();
  const rootLower = normalizedRoot.toLowerCase();

  if (!pathLower.startsWith(rootLower + "/") && pathLower !== rootLower) {
    // Path is outside the project root
    return null;
  }

  return normalizedPath.slice(normalizedRoot.length + 1);
}

/**
 * Convert a project-relative path to an absolute path.
 *
 * @param relativePath - Path relative to project root
 * @param rootPath - Project root path (null for Web mode)
 */
export function toAbsolutePath(relativePath: string, rootPath: string | null): string {
  if (!rootPath) {
    // Web mode: paths stay relative
    return relativePath;
  }
  return joinPath(rootPath, relativePath);
}
