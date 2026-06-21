/**
 * Inspector / tab file-rename transaction (#1870)
 *
 * The inspector's editable file name must perform a *real* file rename — not
 * just change the displayed name. This module centralizes the rename logic so
 * the entry point (app/page.tsx) stays thin and the behavior is unit-testable.
 *
 * Scope (intentionally narrow to avoid overlap with #1868's tree/tab sync):
 * - Project files (tab.file.path is a VFS-relative path): rename on disk via
 *   the same VFS used by the file explorer, with name-collision detection.
 * - Standalone / untitled tabs (no VFS path): no disk file exists at a known
 *   VFS location, so we fall back to a display-only descriptor name change.
 */

import type { VirtualFileSystem } from "../vfs/types";

/** Minimal VFS surface this module needs. Lets tests pass a small fake. */
export type RenameVfs = Pick<VirtualFileSystem, "listDirectory" | "rename">;

export interface RenameRequest {
  /** Current VFS-relative path of the open file (e.g. "chapters/01.mdi"). */
  currentPath: string;
  /** New base file name including extension (e.g. "intro.mdi"). */
  newName: string;
}

export type RenameOutcome =
  | { kind: "noop" }
  | { kind: "collision"; name: string; newPath: string }
  | { kind: "renamed"; oldPath: string; newPath: string; newName: string }
  | { kind: "error"; error: unknown };

/** Derive the parent directory portion of a VFS-relative path. */
export function parentVfsDir(vfsPath: string): string {
  const idx = vfsPath.lastIndexOf("/");
  return idx === -1 ? "" : vfsPath.slice(0, idx);
}

/** Join a parent dir and a name into a VFS-relative path. */
export function joinVfsPath(parentDir: string, name: string): string {
  return parentDir ? `${parentDir}/${name}` : name;
}

/**
 * Check whether `name` already exists inside `parentDir` (case-sensitive match
 * on the entry name). Mirrors FilesPanel.checkFileExists so collision handling
 * is consistent across both rename entry points.
 */
export async function nameExistsInDir(
  vfs: RenameVfs,
  parentDir: string,
  name: string,
): Promise<boolean> {
  try {
    const entries = await vfs.listDirectory(parentDir);
    return entries.some((e) => e.name === name);
  } catch {
    // If the directory can't be listed, fall through and let rename() decide.
    return false;
  }
}

/**
 * Perform the real VFS rename for a project file.
 *
 * @param force - when true, skip the collision check (caller already confirmed
 *                an overwrite). When false, a collision returns
 *                `{ kind: "collision" }` and no disk change is made.
 */
export async function renameProjectFile(
  vfs: RenameVfs,
  { currentPath, newName }: RenameRequest,
  force = false,
): Promise<RenameOutcome> {
  const trimmed = newName.trim();
  if (!trimmed) return { kind: "noop" };

  const oldName = currentPath.split("/").pop() ?? currentPath;
  if (trimmed === oldName) return { kind: "noop" };

  const parentDir = parentVfsDir(currentPath);
  const newPath = joinVfsPath(parentDir, trimmed);

  try {
    if (!force) {
      const exists = await nameExistsInDir(vfs, parentDir, trimmed);
      if (exists) {
        return { kind: "collision", name: trimmed, newPath };
      }
    }
    await vfs.rename(currentPath, newPath);
    return { kind: "renamed", oldPath: currentPath, newPath, newName: trimmed };
  } catch (error) {
    return { kind: "error", error };
  }
}
