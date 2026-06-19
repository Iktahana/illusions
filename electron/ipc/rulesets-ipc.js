/* eslint-disable no-console */
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
  ipcMain.handle(RULESETS_CHANNELS.invoke.sync, async () => {
    try {
      return await mgr.syncAllOfficial();
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
}

module.exports = { registerRulesetsHandlers };
