const { BrowserWindow, ipcMain, app, dialog, nativeTheme, screen } = require("electron");
const path = require("path");
const { EXPORT_CHANNELS } = require("../lib/ipc-channels");
const { isDev } = require("../app-constants");

const requests = new Map();

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

function registerExportDialogHandlers() {
  ipcMain.handle(EXPORT_CHANNELS.invoke.openExportDialog, (event, request) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    if (!parent || parent.isDestroyed() || !request || typeof request !== "object") return null;
    return new Promise((resolve) => {
      const isTxt = request.kind === "txt";
      const isEpub = request.kind === "document" && request.format === "epub";
      const width = isTxt ? 520 : isEpub ? 760 : 1280;
      const height = isTxt ? 480 : 820;
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
        minWidth: isTxt ? 420 : isEpub ? 640 : 960,
        minHeight: isTxt ? 380 : isEpub ? 640 : 620,
        show: false,
        // Prevent the native compositor from flashing its default white
        // surface while the renderer catches up during live resize.
        backgroundColor: nativeTheme.shouldUseDarkColors ? "#080808" : "#fcfcfc",
        title: "エクスポート設定",
        webPreferences: {
          // The Electron main process is bundled into dist-main/main.js, so
          // bundled modules share dist-main as __dirname at runtime. The
          // bundled preload is emitted beside main.js.
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
      requests.set(webContentsId, { request, resolve, completed: false, result: null });
      win.webContents.on("preload-error", (_event, preloadPath, error) => {
        console.error("[Export dialog] Preload error:", preloadPath, error);
      });
      win.webContents.on("did-fail-load", (_event, code, description, url) => {
        console.error("[Export dialog] Failed to load:", code, description, url);
      });
      win.webContents.on("console-message", (_event, level, message) => {
        console.error(`[Export dialog] renderer console (${level}):`, message);
      });
      win.once("ready-to-show", () => {
        win.show();
        win.focus();
      });
      win.on("closed", () => {
        const entry = requests.get(webContentsId);
        requests.delete(webContentsId);
        // Focusing the modal temporarily makes it the active menu window.
        // Restore the editor's retained menu state explicitly when the modal
        // closes; macOS does not consistently emit browser-window-focus for
        // the parent again after dismissing a child sheet/window.
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
        ? "http://localhost:3020?export-dialog"
        : require("url").pathToFileURL(path.join(app.getAppPath(), "out", "index.html")).href +
          "?export-dialog";
      void win.loadURL(url);
    });
  });
  ipcMain.handle(
    EXPORT_CHANNELS.invoke.getExportDialogRequest,
    (event) => requests.get(event.sender.id)?.request ?? null,
  );
  ipcMain.handle(EXPORT_CHANNELS.invoke.confirmExportDialogDiscard, async (event) => {
    if (!requests.has(event.sender.id)) return false;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return false;
    const result = await dialog.showMessageBox(win, {
      type: "warning",
      title: "エクスポートをキャンセル",
      message: "エクスポートをキャンセルしますか？",
      detail: "変更したエクスポート設定は適用されません。",
      buttons: ["キャンセルする", "続ける"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    return result.response === 0;
  });
  ipcMain.handle(EXPORT_CHANNELS.invoke.completeExportDialog, (event, result) => {
    const entry = requests.get(event.sender.id);
    if (!entry || entry.completed) return false;
    entry.completed = true;
    entry.result = result ?? null;
    BrowserWindow.fromWebContents(event.sender)?.close();
    return true;
  });
}
module.exports = { registerExportDialogHandlers };
