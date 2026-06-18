/* eslint-disable no-console */
/**
 * Dictionary IPC handlers — main process.
 * Follows the same pattern as nlp-ipc.js and storage-ipc.js.
 */

const { ipcMain } = require("electron");
const { getDictManager } = require("../dict-manager");
const { DICT_CHANNELS } = require("../lib/ipc-channels");

function registerDictHandlers() {
  const mgr = getDictManager();

  // Validate and clamp limit to a safe range (1–100)
  const clampLimit = (raw) => {
    const n = Number(raw ?? 20);
    if (!Number.isFinite(n)) return 20;
    return Math.max(1, Math.min(100, Math.floor(n)));
  };

  // Query by headword
  ipcMain.handle(DICT_CHANNELS.invoke.query, async (_event, { term, limit }) => {
    try {
      return mgr.query(String(term ?? ""), clampLimit(limit));
    } catch (err) {
      console.error("[Dict IPC] dict:query failed:", err);
      return [];
    }
  });

  // Query by kana reading (homophone lookup)
  ipcMain.handle(DICT_CHANNELS.invoke.queryReading, async (_event, { reading, limit }) => {
    try {
      return mgr.queryByReading(String(reading ?? ""), clampLimit(limit));
    } catch (err) {
      console.error("[Dict IPC] dict:query-reading failed:", err);
      return [];
    }
  });

  // Max headwords accepted in a single batch lookup. The renderer-side facade
  // chunks larger sets; this is a defensive cap so a malformed payload can't
  // build an unbounded SQL statement.
  const MAX_BATCH_TERMS = 1000;

  // Exact-match batch lookup (lightweight projection) for analysis features
  ipcMain.handle(DICT_CHANNELS.invoke.lookupBatch, async (_event, { terms } = {}) => {
    try {
      if (!Array.isArray(terms)) return [];
      const safe = terms
        .filter((t) => typeof t === "string" && t.length > 0)
        .slice(0, MAX_BATCH_TERMS);
      return mgr.lookupBatch(safe);
    } catch (err) {
      console.error("[Dict IPC] dict:lookup-batch failed:", err);
      return [];
    }
  });

  // Fast integrity check (used to detect a corrupt DB and prompt re-download)
  ipcMain.handle(DICT_CHANNELS.invoke.verify, async () => {
    try {
      return mgr.verify();
    } catch (err) {
      console.error("[Dict IPC] dict:verify failed:", err);
      return { ok: false, reason: "malformed" };
    }
  });

  // Get installation status and installed version
  ipcMain.handle(DICT_CHANNELS.invoke.getStatus, async () => {
    try {
      return mgr.getStatus();
    } catch (err) {
      console.error("[Dict IPC] dict:get-status failed:", err);
      return { status: "error", error: String(err?.message ?? err) };
    }
  });

  // Check GitHub Releases for the latest version
  ipcMain.handle(DICT_CHANNELS.invoke.checkUpdate, async () => {
    try {
      return await mgr.checkUpdate();
    } catch (err) {
      console.error("[Dict IPC] dict:check-update failed:", err);
      return { error: String(err?.message ?? err) };
    }
  });

  // Download and install the latest database, streaming progress back to the renderer
  ipcMain.handle(DICT_CHANNELS.invoke.download, async (event) => {
    try {
      return await mgr.download((progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(DICT_CHANNELS.event.downloadProgress, { progress });
        }
      });
    } catch (err) {
      console.error("[Dict IPC] dict:download failed:", err);
      return { success: false, error: String(err?.message ?? err) };
    }
  });
}

module.exports = { registerDictHandlers };
