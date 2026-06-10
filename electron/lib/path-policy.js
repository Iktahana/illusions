"use strict";
/**
 * Shared path-security policy for the Electron main process (#1435).
 *
 * Single source of truth for the system-sensitive deny rules and the IPC
 * content-size limit that were previously duplicated between
 * electron/ipc/file-ipc.js (isSavePathDenied) and
 * electron/ipc/vfs-ipc.js (isDeniedPath).
 *
 * Intentional differences between the two consumers are NOT hidden here —
 * they are passed in explicitly:
 * - vfs-ipc.js adds Windows credential-store suffixes via
 *   `extraHomeSensitiveSuffixes` (VFS grants read access to a whole tree).
 * - file-ipc.js uses the base policy as-is (save-file writes are additionally
 *   gated by dialog approval and an extension allowlist).
 */
const os = require("os");
const {
  normalizeSeparators,
  trimTrailingSlashes,
  getWindowsDenyPrefixes,
} = require("./path-utils");

/**
 * Maximum UTF-8 content size in bytes (50 MB) accepted by save/export/write
 * IPC handlers. Intentionally the same value for file-ipc.js and vfs-ipc.js.
 * Comparisons MUST use Buffer.byteLength(content, "utf-8") — see #1573 and
 * the regression guard in electron/ipc/__tests__/file-ipc-size-validation.test.ts.
 */
const MAX_CONTENT_BYTES = 50 * 1024 * 1024;

/**
 * System root directories (Unix + macOS) denied as prefixes:
 * the directory itself AND any nested path under it are blocked.
 * Identical for the save-file and VFS policies.
 * @type {readonly string[]}
 */
const SYSTEM_DENY_PREFIXES = Object.freeze([
  "/",
  "/etc",
  "/usr",
  "/bin",
  "/sbin",
  "/var",
  "/tmp",
  "/System",
  "/private",
  "/private/etc",
  "/private/var",
]);

/**
 * Credential / sensitive directories inside the user home, denied as prefixes.
 * Base list shared by both modules. vfs-ipc.js extends it with Windows
 * credential stores via the `extraHomeSensitiveSuffixes` option.
 * @type {readonly string[]}
 */
const HOME_SENSITIVE_SUFFIXES = Object.freeze([
  "/.ssh",
  "/.gnupg",
  "/.aws",
  "/.kube",
  "/.docker",
  "/.config/gcloud",
  "/Library/Keychains",
]);

/**
 * Check whether a forward-slash normalized absolute path points to a
 * system-sensitive location that IPC handlers must never touch.
 *
 * Denies (in fail-closed order, result is a pure boolean):
 * 1. Bare Windows drive roots (C: / C:/)
 * 2. System root directories and anything nested under them
 * 3. The user home directory itself (subpaths of home stay allowed)
 * 4. Sensitive directories under home (base list + caller extras)
 * 5. Windows system directories (case-insensitive, actual system drive)
 *
 * @param {string} normalizedPath - Forward-slash normalized absolute path
 * @param {{ extraHomeSensitiveSuffixes?: readonly string[] }} [options]
 * @param {readonly string[]} [options.extraHomeSensitiveSuffixes] - Additional
 *   home-relative prefixes to deny (caller-specific policy, kept explicit)
 * @returns {boolean} true if the path must be denied
 */
function isSensitiveSystemPath(normalizedPath, { extraHomeSensitiveSuffixes = [] } = {}) {
  const homedir = trimTrailingSlashes(normalizeSeparators(os.homedir()));

  // Bare Windows drive root (C:/ or C:)
  if (/^([a-zA-Z]):?\/?$/.test(normalizedPath)) return true;

  // Treat denied system roots as prefixes — block any nested path under them
  if (
    SYSTEM_DENY_PREFIXES.some(
      (dir) => normalizedPath === dir || normalizedPath.startsWith(`${dir}/`),
    )
  ) {
    return true;
  }

  // The home directory itself is denied; ordinary subpaths of home are allowed
  if (normalizedPath === homedir) return true;

  // Sensitive directories within home (prefix match implies the path is inside home)
  if (HOME_SENSITIVE_SUFFIXES.some((s) => normalizedPath.startsWith(homedir + s))) return true;
  if (extraHomeSensitiveSuffixes.some((s) => normalizedPath.startsWith(homedir + s))) return true;

  // Windows system directories on the actual system drive (case-insensitive)
  const normalizedLower = normalizedPath.toLowerCase();
  if (
    getWindowsDenyPrefixes().some((p) => {
      const pLower = p.toLowerCase();
      return normalizedLower === pLower || normalizedLower.startsWith(`${pLower}/`);
    })
  ) {
    return true;
  }

  return false;
}

module.exports = {
  MAX_CONTENT_BYTES,
  SYSTEM_DENY_PREFIXES,
  HOME_SENSITIVE_SUFFIXES,
  isSensitiveSystemPath,
};
