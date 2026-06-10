/**
 * Shared IPC channel-name constants (#1434).
 *
 * Single source of truth for channel names, consumed by BOTH sides of the
 * bridge so the renderer/main contract cannot drift:
 * - preload (electron/preload.js) — ipcRenderer.invoke / ipcRenderer.on
 * - main (electron/ipc/*.js, electron/main.js) — ipcMain.handle / webContents.send
 *
 * Structure per namespace:
 * - `invoke`: request/response channels (ipcRenderer.invoke ↔ ipcMain.handle)
 * - `event`:  push channels (webContents.send → ipcRenderer.on)
 *
 * IMPORTANT: these string values are the public IPC contract. Never rename
 * them; renderer payload semantics are pinned in types/electron.d.ts and the
 * drift test in electron/lib/__tests__/ipc-bridge.test.ts.
 *
 * Migration status (incremental, per issue #1434):
 * - storage, dict: migrated
 * - vfs / auth / menu / export / pty / editor popout / nlp / system: follow-up
 */

const STORAGE_CHANNELS = Object.freeze({
  invoke: Object.freeze({
    saveSession: "storage:save-session",
    loadSession: "storage:load-session",
    saveAppState: "storage:save-app-state",
    loadAppState: "storage:load-app-state",
    addToRecent: "storage:add-to-recent",
    getRecentFiles: "storage:get-recent-files",
    removeFromRecent: "storage:remove-from-recent",
    clearRecent: "storage:clear-recent",
    saveEditorBuffer: "storage:save-editor-buffer",
    loadEditorBuffer: "storage:load-editor-buffer",
    clearEditorBuffer: "storage:clear-editor-buffer",
    clearAll: "storage:clear-all",
    addRecentProject: "storage:add-recent-project",
    getRecentProjects: "storage:get-recent-projects",
    removeRecentProject: "storage:remove-recent-project",
    setItem: "storage:set-item",
    getItem: "storage:get-item",
    removeItem: "storage:remove-item",
  }),
  event: Object.freeze({}),
});

const DICT_CHANNELS = Object.freeze({
  invoke: Object.freeze({
    query: "dict:query",
    queryReading: "dict:query-reading",
    getStatus: "dict:get-status",
    checkUpdate: "dict:check-update",
    download: "dict:download",
  }),
  event: Object.freeze({
    downloadProgress: "dict:download-progress",
    updateAvailable: "dict:update-available",
  }),
});

module.exports = { STORAGE_CHANNELS, DICT_CHANNELS };
