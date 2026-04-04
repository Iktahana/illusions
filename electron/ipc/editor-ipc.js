/* eslint-disable no-console */
// Editor popout IPC handlers — multi-window buffer sync

const { ipcMain, BrowserWindow, app } = require("electron");
const path = require("path");
const { isDev } = require("../app-constants");

/**
 * Register IPC handlers for editor popout windows and cross-window buffer sync.
 *
 * Channels handled:
 *   editor:popout-panel        (handle) — open a new popout editor window
 *   editor:buffer-sync         (on)     — broadcast buffer content to all other windows
 *   editor:buffer-close        (on)     — broadcast buffer close to all other windows
 */
function registerEditorHandlers() {
  // Open a new popout editor window for the given buffer
  ipcMain.handle(
    "editor:popout-panel",
    async (event, { bufferId, content, fileName, fileType }) => {
      // Validate required input
      if (!bufferId || typeof bufferId !== "string") {
        console.warn("[editor-ipc] popout-panel: invalid bufferId");
        return { success: false, error: "invalid bufferId" };
      }

      const parentWindow = BrowserWindow.fromWebContents(event.sender);
      const preloadPath = path.join(__dirname, "..", "preload.js");

      const popout = new BrowserWindow({
        width: 800,
        height: 600,
        parent: parentWindow || undefined,
        show: false,
        backgroundColor: "#0f172a",
        webPreferences: {
          preload: preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });

      popout.once("ready-to-show", () => {
        popout.show();
      });

      // Block navigation away from the app
      popout.webContents.on("will-navigate", (navEvent, navigationUrl) => {
        const parsedUrl = new URL(navigationUrl);
        if (parsedUrl.protocol === "file:") return;
        if (isDev && parsedUrl.hostname === "localhost") return;
        navEvent.preventDefault();
        console.warn("[Security] Blocked popout navigation to:", navigationUrl);
      });

      // Block new window creation from renderer
      popout.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

      // Build URL with popout query params
      const params = new URLSearchParams({
        "popout-buffer": bufferId,
        fileName: fileName || "",
        fileType: fileType || "",
      });

      if (isDev) {
        await popout.loadURL(`http://localhost:3020?${params}`);
      } else {
        const filePath = path.join(app.getAppPath(), "out", "index.html");
        await popout.loadURL(`file://${filePath}?${params}`);
      }

      // Send initial content after page has loaded
      if (content !== undefined && content !== null) {
        popout.webContents.send("editor:buffer-sync-broadcast", { bufferId, content });
      }

      return { success: true };
    },
  );

  // Broadcast buffer content update to all windows except the sender
  ipcMain.on("editor:buffer-sync", (event, data) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && win.webContents !== event.sender) {
        win.webContents.send("editor:buffer-sync-broadcast", data);
      }
    }
  });

  // Broadcast buffer close notification to all windows except the sender
  ipcMain.on("editor:buffer-close", (event, bufferId) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && win.webContents !== event.sender) {
        win.webContents.send("editor:buffer-close-broadcast", bufferId);
      }
    }
  });
}

module.exports = { registerEditorHandlers };
