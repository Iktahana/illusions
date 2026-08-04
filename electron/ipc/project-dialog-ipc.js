const { BrowserWindow, ipcMain, app, screen } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");
const { PROJECT_DIALOG_CHANNELS } = require("../lib/ipc-channels");
const { isDev } = require("../app-constants");

const dialogs = new Map();

function getCenteredWindowPosition(parent, width, height) {
  const parentBounds = parent.getBounds();
  const workArea = screen.getDisplayMatching(parentBounds).workArea;
  const preferredX = Math.round(parentBounds.x + (parentBounds.width - width) / 2);
  const preferredY = Math.round(parentBounds.y + (parentBounds.height - height) / 2);
  return {
    x: Math.max(workArea.x, Math.min(preferredX, workArea.x + workArea.width - width)),
    y: Math.max(workArea.y, Math.min(preferredY, workArea.y + workArea.height - height)),
  };
}

function restoreParentAfterModal(parent, callback) {
  if (parent.isDestroyed()) {
    callback();
    return;
  }

  parent.setFocusable(true);
  if (parent.isMinimized()) parent.restore();
  parent.show();
  parent.focus();
  setImmediate(callback);
}

function registerProjectDialogHandlers() {
  ipcMain.handle(PROJECT_DIALOG_CHANNELS.invoke.open, (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    if (!parent || parent.isDestroyed()) return null;

    return new Promise((resolve) => {
      const width = 640;
      const height = 540;
      const macWindowOptions =
        process.platform === "darwin"
          ? {
              ...getCenteredWindowPosition(parent, width, height),
              modal: false,
              alwaysOnTop: true,
              skipTaskbar: true,
            }
          : { parent, modal: true };
      const win = new BrowserWindow({
        ...macWindowOptions,
        width,
        height,
        minWidth: 560,
        minHeight: 480,
        show: false,
        frame: false,
        transparent: true,
        hasShadow: true,
        backgroundColor: "#00000000",
        title: "新規プロジェクト",
        webPreferences: {
          preload: path.join(__dirname, "preload.js"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      if (process.platform === "darwin") {
        parent.setFocusable(false);
        win.setAlwaysOnTop(true, "modal-panel");
      }
      const webContentsId = win.webContents.id;
      dialogs.set(webContentsId, { resolve, completed: false, result: null });

      win.webContents.on("preload-error", (_event, preloadPath, error) => {
        console.error("[Project dialog] Preload error:", preloadPath, error);
      });
      win.webContents.on("did-fail-load", (_event, code, description, url) => {
        console.error("[Project dialog] Failed to load:", code, description, url);
      });
      win.once("ready-to-show", () => {
        win.show();
        win.focus();
      });
      win.on("closed", () => {
        const entry = dialogs.get(webContentsId);
        dialogs.delete(webContentsId);

        if (!parent.isDestroyed()) {
          const { setActiveWindowId, rebuildApplicationMenu } = require("../menu");
          setActiveWindowId(parent.id);
          void rebuildApplicationMenu();
        }
        restoreParentAfterModal(parent, () => {
          if (entry) entry.resolve(entry.completed ? entry.result : null);
        });
      });

      const url = isDev
        ? "http://localhost:3020?create-project"
        : `${pathToFileURL(path.join(app.getAppPath(), "out", "index.html")).href}?create-project`;
      void win.loadURL(url);
    });
  });

  ipcMain.handle(PROJECT_DIALOG_CHANNELS.invoke.complete, (event, result) => {
    const entry = dialogs.get(event.sender.id);
    if (!entry || entry.completed) return false;
    const validResult =
      result === null ||
      (result &&
        typeof result === "object" &&
        typeof result.name === "string" &&
        [".mdi", ".md", ".txt"].includes(result.fileExtension));
    if (!validResult) return false;
    entry.completed = true;
    entry.result = result ?? null;
    BrowserWindow.fromWebContents(event.sender)?.close();
    return true;
  });
}

module.exports = { registerProjectDialogHandlers };
