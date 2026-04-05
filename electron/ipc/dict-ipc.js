/* eslint-disable no-console */
/**
 * Dictionary IPC handlers — main process.
 * Follows the same pattern as nlp-ipc.js and storage-ipc.js.
 */

const { ipcMain } = require("electron");
const { getDictManager } = require("../dict-manager");

function registerDictHandlers() {
  const mgr = getDictManager();

  // Query by headword
  ipcMain.handle("dict:query", async (_event, { term, limit }) => {
    try {
      return mgr.query(String(term ?? ""), Number(limit ?? 20));
    } catch (err) {
      console.error("[Dict IPC] dict:query failed:", err);
      return [];
    }
  });

  // Query by kana reading (homophone lookup)
  ipcMain.handle("dict:query-reading", async (_event, { reading, limit }) => {
    try {
      return mgr.queryByReading(String(reading ?? ""), Number(limit ?? 20));
    } catch (err) {
      console.error("[Dict IPC] dict:query-reading failed:", err);
      return [];
    }
  });

  // Get installation status and installed version
  ipcMain.handle("dict:get-status", async () => {
    try {
      return mgr.getStatus();
    } catch (err) {
      console.error("[Dict IPC] dict:get-status failed:", err);
      return { status: "error", error: String(err?.message ?? err) };
    }
  });

  // Check GitHub Releases for the latest version
  ipcMain.handle("dict:check-update", async () => {
    try {
      return await mgr.checkUpdate();
    } catch (err) {
      console.error("[Dict IPC] dict:check-update failed:", err);
      return { error: String(err?.message ?? err) };
    }
  });

  // Download and install the latest database, streaming progress back to the renderer
  ipcMain.handle("dict:download", async (event) => {
    try {
      return await mgr.download((progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send("dict:download-progress", { progress });
        }
      });
    } catch (err) {
      console.error("[Dict IPC] dict:download failed:", err);
      return { success: false, error: String(err?.message ?? err) };
    }
  });
}

module.exports = { registerDictHandlers };
