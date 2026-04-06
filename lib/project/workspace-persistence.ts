/**
 * Mutex-protected read-modify-write for .illusions/workspace.json.
 *
 * All writes to workspace.json MUST go through persistWorkspaceJson()
 * to prevent TOCTOU races and partial overwrites.
 *
 * workspace.json への書き込みはすべて persistWorkspaceJson() を通す。
 * TOCTOU レースコンディションと部分上書きを防止する。
 */

import { AsyncMutex } from "@/lib/utils/async-mutex";
import { getVFS } from "@/lib/vfs";
import { isAbsolutePath, joinPath } from "@/lib/vfs/path-utils";
import type { WorkspaceState } from "./project-types";
import { getDefaultWorkspaceState } from "./project-types";

const workspaceMutex = new AsyncMutex();
const WORKSPACE_JSON_PATH = ".illusions/workspace.json";

/**
 * Merge partial updates into .illusions/workspace.json atomically.
 * Reads the current file, shallow-merges the given fields, and writes back.
 * No-ops silently if VFS root is not set (standalone mode).
 *
 * @param updates - Partial workspace state fields to merge
 */
export async function persistWorkspaceJson(updates: Partial<WorkspaceState>): Promise<void> {
  const release = await workspaceMutex.acquire();
  try {
    const vfs = getVFS();
    // Guard: VFS root must be set (project mode)
    if ("isReady" in vfs && typeof vfs.isReady === "function" && !vfs.isReady()) return;

    let current: WorkspaceState;
    try {
      const text = await vfs.readFile(WORKSPACE_JSON_PATH);
      current = JSON.parse(text) as WorkspaceState;
    } catch {
      current = getDefaultWorkspaceState();
    }
    const merged: WorkspaceState = { ...current, ...updates };
    await vfs.writeFile(WORKSPACE_JSON_PATH, JSON.stringify(merged, null, 2));
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
