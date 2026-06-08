/**
 * Pure helpers for deciding whether a VFS file should be opened with the OS
 * default app (#1465) rather than the in-app editor, and for resolving the
 * native absolute path to hand to the `open-with-default-app` IPC.
 *
 * Kept side-effect-free so the extension gate and path resolution can be unit
 * tested without Electron / React. The hook (`useFileIO.openProjectFile`) wires
 * the result to `notificationManager` and `window.electronAPI.openWithDefaultApp`.
 */

/** Extensions the editor can open in-app. Everything else delegates to the OS. */
export const EDITABLE_EXTENSIONS = [".mdi", ".md", ".txt"] as const;

/** Extract a lowercased dotted extension (".docx") from a VFS path, or "" if none. */
export function extractExtension(vfsPath: string): string {
  const baseName = vfsPath.split("/").pop() ?? "";
  if (!baseName.includes(".")) return "";
  return "." + (baseName.split(".").pop() ?? "").toLowerCase();
}

/** Whether the editor can open this path in-app (true for .mdi/.md/.txt). */
export function isEditableExtension(vfsPath: string): boolean {
  const ext = extractExtension(vfsPath);
  // No extension (e.g. a README without suffix) is treated as editable text.
  if (!ext) return true;
  return (EDITABLE_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Resolve a VFS path to a native absolute path for `shell.openPath`.
 *
 * Already-absolute paths (POSIX `/…` or Windows `C:\…`) pass through; relative
 * paths are joined onto `rootPath`. Returns null when a relative path cannot be
 * resolved (no open root), so the caller can fall back to the normal read path.
 */
export function resolveNativePath(vfsPath: string, rootPath: string | null): string | null {
  if (vfsPath.startsWith("/") || /^[a-zA-Z]:[/\\]/.test(vfsPath)) {
    return vfsPath;
  }
  return rootPath ? rootPath + "/" + vfsPath : null;
}
