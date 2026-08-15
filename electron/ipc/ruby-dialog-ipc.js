const { BrowserWindow, ipcMain, app, screen } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");
const { RUBY_DIALOG_CHANNELS } = require("../lib/ipc-channels");
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

function isValidReading(reading) {
  return (
    typeof reading === "string" ||
    (Array.isArray(reading) &&
      reading.length > 0 &&
      reading.every((part) => typeof part === "string" && part.length > 0))
  );
}

function isValidRubySelection(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.base === "string" &&
    isValidReading(value.reading)
  );
}

function isValidRubySegment(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.base === "string" &&
    (value.ruby === undefined || isValidReading(value.ruby))
  );
}

function isValidRubyDialogRequest(request) {
  return (
    request &&
    typeof request === "object" &&
    typeof request.selectedText === "string" &&
    (request.existingRuby === null || isValidRubySelection(request.existingRuby))
  );
}

function isValidRubyDialogResult(result) {
  return (
    result === null ||
    (result &&
      typeof result === "object" &&
      ((result.action === "remove" && Object.keys(result).length === 1) ||
        (result.action === "apply" &&
          Array.isArray(result.segments) &&
          result.segments.every(isValidRubySegment))))
  );
}

function registerRubyDialogHandlers() {
  ipcMain.handle(RUBY_DIALOG_CHANNELS.invoke.open, (event, request) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    if (!parent || parent.isDestroyed() || !isValidRubyDialogRequest(request)) return null;

    return new Promise((resolve) => {
      const width = 720;
      const height = 680;
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
        minWidth: 600,
        minHeight: 560,
        show: false,
        frame: false,
        transparent: true,
        hasShadow: true,
        backgroundColor: "#00000000",
        title: "ルビ設定",
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
      dialogs.set(webContentsId, { request, resolve, completed: false, result: null });

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
        ? "http://localhost:3020?ruby-dialog"
        : `${pathToFileURL(path.join(app.getAppPath(), "out", "index.html")).href}?ruby-dialog`;
      void win.loadURL(url);
    });
  });

  ipcMain.handle(
    RUBY_DIALOG_CHANNELS.invoke.getRequest,
    (event) => dialogs.get(event.sender.id)?.request ?? null,
  );

  ipcMain.handle(RUBY_DIALOG_CHANNELS.invoke.complete, (event, result) => {
    const entry = dialogs.get(event.sender.id);
    if (!entry || entry.completed || !isValidRubyDialogResult(result)) return false;
    entry.completed = true;
    entry.result = result ?? null;
    BrowserWindow.fromWebContents(event.sender)?.close();
    return true;
  });
}

module.exports = { registerRubyDialogHandlers };
