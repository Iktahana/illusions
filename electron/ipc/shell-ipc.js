// Shell and OS integration IPC handlers

const { ipcMain, BrowserWindow, Menu, shell, app } = require("electron");
const path = require("path");
const { SHELL_CHANNELS } = require("../lib/ipc-channels");

function registerShellHandlers() {
  ipcMain.handle(SHELL_CHANNELS.invoke.showInFileManager, async (_event, dirPath) => {
    if (!dirPath || typeof dirPath !== "string") return false;
    // Reject relative paths and paths containing traversal sequences
    if (!path.isAbsolute(dirPath) || dirPath.includes("..")) {
      console.warn("[Security] Invalid path in show-in-file-manager:", dirPath);
      return false;
    }
    const normalizedPath = path.normalize(dirPath);
    const result = await shell.openPath(normalizedPath);
    return result === ""; // empty string = success
  });

  ipcMain.handle(SHELL_CHANNELS.invoke.revealInFileManager, async (_event, filePath) => {
    if (!filePath || typeof filePath !== "string") return false;
    // Reject relative paths and paths containing traversal sequences
    if (!path.isAbsolute(filePath) || filePath.includes("..")) {
      console.warn("[Security] Invalid path in reveal-in-file-manager:", filePath);
      return false;
    }
    const normalizedPath = path.normalize(filePath);
    shell.showItemInFolder(normalizedPath);
    return true;
  });

  ipcMain.handle(SHELL_CHANNELS.invoke.openWithDefaultApp, async (_event, filePath) => {
    if (!filePath || typeof filePath !== "string") return false;
    if (!path.isAbsolute(filePath) || filePath.includes("..")) {
      console.warn("[Security] Invalid path in open-with-default-app:", filePath);
      return false;
    }
    const result = await shell.openPath(path.normalize(filePath));
    return result === ""; // empty string = success on macOS/Windows
  });

  ipcMain.handle(SHELL_CHANNELS.invoke.openExternal, async (_event, url) => {
    if (typeof url !== "string") return false;
    // Only allow http/https URLs
    if (!url.startsWith("https://") && !url.startsWith("http://")) return false;
    await shell.openExternal(url);
    return true;
  });

  // 辞書ポップアップウィンドウを開く
  ipcMain.handle(SHELL_CHANNELS.invoke.openDictionaryPopup, (_event, url, title) => {
    // Validate URL: only allow https
    if (typeof url !== "string") return false;
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      console.warn("[Security] Invalid dictionary URL:", url);
      return false;
    }
    if (parsedUrl.protocol !== "https:") {
      console.warn("[Security] Blocked non-HTTPS dictionary URL:", url);
      return false;
    }

    const popupWindow = new BrowserWindow({
      width: 800,
      height: 600,
      title: title || "辞典",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // Use isolated session so the app's CSP does not break external pages
        partition: "dictionary",
      },
    });

    // Block navigation away from the initial URL's site (allow subdomains)
    const initialHostParts = parsedUrl.hostname.split(".");
    const initialDomain = initialHostParts.slice(-2).join(".");
    popupWindow.webContents.on("will-navigate", (event, navigationUrl) => {
      try {
        const navUrl = new URL(navigationUrl);
        if (navUrl.protocol !== "https:") {
          event.preventDefault();
          return;
        }
        const navHostParts = navUrl.hostname.split(".");
        const navDomain = navHostParts.slice(-2).join(".");
        if (navDomain !== initialDomain) {
          event.preventDefault();
          console.warn("[Security] Blocked popup navigation to:", navigationUrl);
        }
      } catch {
        event.preventDefault();
      }
    });

    popupWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

    // Tag the popup browser's User-Agent so the dictionary site (dict.illusions.app)
    // can identify in-app requests. Append a token to the default Chromium UA rather
    // than replacing it, to keep compatibility with sites that sniff the browser.
    const baseUserAgent = popupWindow.webContents.getUserAgent();
    const appVersion = app.getVersion();
    const userAgent = `${baseUserAgent} illusions/${appVersion}`;

    popupWindow.loadURL(url, { userAgent });
    return true;
  });

  // ネイティブコンテキストメニューを表示
  ipcMain.handle(SHELL_CHANNELS.invoke.showContextMenu, (_event, items) => {
    // Input validation
    if (!Array.isArray(items) || items.length === 0 || items.length > 50) return null;
    for (const item of items) {
      if (typeof item !== "object" || item === null) return null;
      if (item.action !== "_separator") {
        if (typeof item.label !== "string" || typeof item.action !== "string") return null;
      }
    }

    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;

    return new Promise((resolve) => {
      const template = items.map((item) =>
        item.action === "_separator"
          ? { type: "separator" }
          : {
              label: item.label,
              accelerator: item.accelerator || undefined,
              click: () => resolve(item.action),
            },
      );
      const menu = Menu.buildFromTemplate(template);
      menu.popup({
        window: win,
        callback: () => resolve(null),
      });
    });
  });
}

module.exports = { registerShellHandlers };
