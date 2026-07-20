/**
 * Classification of project-open failures (#1965).
 *
 * Opening a recent project calls `vfs:set-root` in the Electron main process.
 * When the stored folder is missing/moved, the handler rejects with an
 * `ENOENT`-prefixed message. That rejection crosses the IPC boundary, where
 * `ipcMain.handle` serialization strips custom error properties such as
 * `.code` — only `.message` survives. So the renderer must detect the
 * not-found case from BOTH a native `.code === "ENOENT"` (Web / direct fs) and
 * the `ENOENT` marker embedded in the IPC error message (Electron).
 */

/** Whether a project-open failure means the project folder was not found. */
export function isProjectNotFoundError(error: unknown): boolean {
  if (error && typeof error === "object" && "code" in error) {
    if ((error as { code?: unknown }).code === "ENOENT") return true;
  }
  return error instanceof Error && error.message.includes("ENOENT");
}
