/**
 * Rulesets IPC handlers — main process.
 * Follows the same pattern as dict-ipc.js. All handlers are fail-safe: they
 * return an empty/neutral value rather than throwing across the IPC boundary.
 */

const { ipcMain } = require("electron");
const { getRulesetsManager } = require("../rulesets-manager");
const { RULESETS_CHANNELS } = require("../lib/ipc-channels");

function registerRulesetsHandlers() {
  const mgr = getRulesetsManager();

  // List installed (downloaded) official/external rulesets on disk.
  ipcMain.handle(RULESETS_CHANNELS.invoke.listInstalled, async () => {
    try {
      return mgr.listInstalled();
    } catch (err) {
      console.error("[Rulesets IPC] rulesets:list-installed failed:", err);
      return [];
    }
  });

  // Download/update every official ruleset that is missing or out of date.
  // Streams per-ruleset progress and announces what changed so the renderer can
  // (re)load the affected rulesets into the lint worker without a restart.
  ipcMain.handle(RULESETS_CHANNELS.invoke.sync, async (event) => {
    try {
      const summary = await mgr.syncAllOfficial((progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(RULESETS_CHANNELS.event.syncProgress, progress);
        }
      });
      const changed = summary.filter((s) => s.status === "installed").map((s) => s.id);
      if (changed.length > 0 && !event.sender.isDestroyed()) {
        event.sender.send(RULESETS_CHANNELS.event.changed, { reason: "installed", ids: changed });
      }
      return summary;
    } catch (err) {
      console.error("[Rulesets IPC] rulesets:sync failed:", err);
      return [];
    }
  });

  // Check latest release tags vs installed, without downloading.
  ipcMain.handle(RULESETS_CHANNELS.invoke.checkUpdate, async () => {
    try {
      return await mgr.checkUpdate();
    } catch (err) {
      console.error("[Rulesets IPC] rulesets:check-update failed:", err);
      return [];
    }
  });

  // Read an installed ruleset's verified module code + manifest (external loader).
  ipcMain.handle(RULESETS_CHANNELS.invoke.readModule, async (_event, id) => {
    try {
      return await mgr.readModule(id);
    } catch (err) {
      console.error("[Rulesets IPC] rulesets:read-module failed:", err);
      return { ok: false, id: String(id), reason: String(err?.message ?? err) };
    }
  });

  // Uninstall a third-party ruleset (official/built-in are refused by the manager).
  ipcMain.handle(RULESETS_CHANNELS.invoke.uninstall, async (event, id) => {
    try {
      const result = mgr.uninstall(id);
      if (result.ok && !event.sender.isDestroyed()) {
        event.sender.send(RULESETS_CHANNELS.event.changed, { reason: "uninstalled", ids: [id] });
      }
      return result;
    } catch (err) {
      console.error("[Rulesets IPC] rulesets:uninstall failed:", err);
      return { ok: false, detail: String(err?.message ?? err) };
    }
  });
}

module.exports = { registerRulesetsHandlers };
