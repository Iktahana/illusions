/* eslint-disable no-console */
// Shell and OS integration IPC handlers

const { ipcMain, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");
const log = require("electron-log");

function registerShellHandlers() {
  ipcMain.handle("show-in-file-manager", async (_event, dirPath) => {
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

  ipcMain.handle("reveal-in-file-manager", async (_event, filePath) => {
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

  ipcMain.handle("open-external", async (_event, url) => {
    if (typeof url !== "string") return false;
    // Only allow http/https URLs
    if (!url.startsWith("https://") && !url.startsWith("http://")) return false;
    await shell.openExternal(url);
    return true;
  });

  // 辞書ポップアップウィンドウを開く
  ipcMain.handle("open-dictionary-popup", (_event, url, title) => {
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

    popupWindow.loadURL(url);
    return true;
  });

  // ネイティブコンテキストメニューを表示
  ipcMain.handle("show-context-menu", (_event, items) => {
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
