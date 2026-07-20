/**
 * Shared path utility functions for VFS implementations.
 *
 * Used by both electron-vfs.ts (absolute paths, Windows backslash support)
 * and web-vfs.ts (relative paths, forward slashes only).
 */

/**
 * Join path segments using "/" separator.
 * - Normalizes backslashes to forward slashes.
 * - Preserves any leading slash on the first segment (absolute path support).
 * - Strips trailing slashes from all segments.
 * - Strips leading slashes from subsequent segments.
 */
export function joinPath(...segments: string[]): string {
  if (segments.length === 0) return "";
  const [first, ...rest] = segments;
  const normalizedFirst = first.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalizedRest = rest
    .map((s) => s.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))
    .filter((s) => s.length > 0);
  return [normalizedFirst, ...normalizedRest].join("/");
}

/**
 * Extract the basename (final path component) from a path string.
 * Normalizes backslashes and strips trailing slashes before extracting.
 */
export function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || path;
}

/**
 * Extract the parent directory path from a file path.
 * Returns "/" if the path has no parent (e.g. root-level file).
 */
export function dirname(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash <= 0) return "/";
  return normalized.substring(0, lastSlash);
}

/**
 * Check if a path is absolute.
 * Handles Unix ("/path"), Windows drive ("C:\path", "D:/path"),
 * and UNC ("\\server\share") formats.
 */
export function isAbsolutePath(p: string): boolean {
  return p.startsWith("/") || p.startsWith("\\\\") || /^[a-zA-Z]:[/\\]/.test(p);
}
