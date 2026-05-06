/* eslint-disable no-console */
/**
 * Dictionary IPC handlers — main process.
 * Follows the same pattern as nlp-ipc.js and storage-ipc.js.
 */

const { ipcMain, BrowserWindow } = require("electron");
const { getDictManager } = require("../dict-manager");

/**
 * Broadcast a dictionary install/replace event to all renderer windows
 * and fire a main-process-internal event so main-side listeners
 * (e.g. the NLP builtin refresher) can react without importing this module.
 */
function broadcastDictInstalled() {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("dict:installed");
    }
  }
  ipcMain.emit("dict:installed-internal");
}

function registerDictHandlers() {
  const mgr = getDictManager();

  // Validate and clamp limit to a safe range (1–100)
  const clampLimit = (raw) => {
    const n = Number(raw ?? 20);
    if (!Number.isFinite(n)) return 20;
    return Math.max(1, Math.min(100, Math.floor(n)));
  };

  // Query by headword
  ipcMain.handle("dict:query", async (_event, { term, limit }) => {
    try {
      return mgr.query(String(term ?? ""), clampLimit(limit));
    } catch (err) {
      console.error("[Dict IPC] dict:query failed:", err);
      return [];
    }
  });

  // Query by kana reading (homophone lookup)
  ipcMain.handle("dict:query-reading", async (_event, { reading, limit }) => {
    try {
      return mgr.queryByReading(String(reading ?? ""), clampLimit(limit));
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
      const result = await mgr.download((progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send("dict:download-progress", { progress });
        }
      });
      if (result?.success) {
        broadcastDictInstalled();
      }
      return result;
    } catch (err) {
      console.error("[Dict IPC] dict:download failed:", err);
      return { success: false, error: String(err?.message ?? err) };
    }
  });

  // Return just the headword strings for noun entries.
  // Keeps renderer payload small — no readings or POS.
  ipcMain.handle("dict:list-noun-headwords", async () => {
    try {
      return mgr.listNouns().map((n) => n.entry);
    } catch (err) {
      console.error("[Dict IPC] dict:list-noun-headwords failed:", err);
      return [];
    }
  });
}

module.exports = { registerDictHandlers, broadcastDictInstalled };
