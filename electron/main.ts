/**
 * Electron main process entry.
 * ESM module. Bundles model manager, AI engine, and IPC handlers.
 */

import { app, BrowserWindow, ipcMain, dialog } from "electron";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

import {
  checkModelExists,
  downloadModel,
  getModelPath,
  listModels,
} from "./model-manager.js";
import { proofreadingEngine } from "./ai-engine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);

const pkg = require("../package.json") as {
  build?: { productName?: string };
  name?: string;
};

const APP_NAME: string = pkg.build?.productName ?? pkg.name ?? "Illusions";

const isDev =
  process.env.NODE_ENV === "development" || process.env.ELECTRON_DEV === "1";

app.commandLine.appendSwitch("enable-optimization-guide-on-device");
app.commandLine.appendSwitch("prompt-api-for-gemini-nano");
app.commandLine.appendSwitch(
  "enable-features",
  "PromptAPIForGeminiNano,OptimizationGuideOnDeviceModel"
);

let mainWindow: BrowserWindow | null = null;
let currentFilePath: string | null = null;
let isDirty = false;
let filesToOpenOnStartup: string[] = [];

// Handle single instance and file associations
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, _argv, _cwd, additionalData: unknown) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }

    // Handle file open from second instance
    const data = additionalData as { file?: string } | null;
    if (data?.file) {
      void openFileInWindow(data.file);
    }
  });
}

function basename(p: string): string {
  const normalized = p.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || p;
}

function updateWindowTitle(): void {
  if (!mainWindow) return;
  const filePart = currentFilePath ? ` - ${basename(currentFilePath)}` : "";
  mainWindow.setTitle(`${APP_NAME}${filePart}`);
}

async function openFileInWindow(filePath: string): Promise<void> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    currentFilePath = filePath;
    isDirty = false;
    updateWindowTitle();
    // Send file content to renderer
    mainWindow?.webContents.send("open-file-from-system", { path: filePath, content });
  } catch (error) {
    console.error("Failed to open file from system:", error);
    if (mainWindow) {
      void dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "Error",
        message: "Failed to open the file.",
      });
    }
  }
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    backgroundColor: "#0f172a",
    title: APP_NAME,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    updateWindowTitle();
  });

  mainWindow.on("close", (event) => {
    if (!isDirty) {
      return;
    }

    event.preventDefault();

    if (!mainWindow) return;

    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: "question",
      buttons: ["Save", "Don't Save", "Cancel"],
      defaultId: 0,
      title: "Unsaved Changes",
      message: "Do you want to save changes before closing?",
    });

    if (choice === 0) {
      // Save
      mainWindow?.webContents.send("electron-request-save-before-close");
    } else if (choice === 1) {
      // Don't Save
      isDirty = false;
      mainWindow?.close();
    }
    // choice === 2: Cancel, do nothing
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "out", "index.html"));
  }

  // Handle files that should be opened on startup
  mainWindow.webContents.on("did-finish-load", () => {
    if (filesToOpenOnStartup.length > 0) {
      const fileToOpen = filesToOpenOnStartup.shift();
      if (fileToOpen) {
        void openFileInWindow(fileToOpen);
      }
    }
  });
}

// IPC handlers

ipcMain.handle("get-chrome-version", () => {
  const v = process.versions.chrome ?? "0";
  const major = Number.parseInt(String(v).split(".")[0] ?? "0", 10);
  return Number.isFinite(major) ? major : 0;
});

ipcMain.handle("open-file", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      { name: "MDI Document", extensions: ["mdi"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (canceled || !filePaths[0]) return null;
  const filePath = filePaths[0];
  const content = await fs.readFile(filePath, "utf-8");
  currentFilePath = filePath;
  isDirty = false;
  updateWindowTitle();
  return { path: filePath, content };
});

ipcMain.handle("save-file", async (
  _event: Electron.IpcMainInvokeEvent,
  filePath: string | null,
  content: string
) => {
  let target = filePath;
  if (!target) {
    const result = await dialog.showSaveDialog({
      filters: [
        { name: "MDI Document", extensions: ["mdi"] },
        { name: "All Files", extensions: ["*"] },
      ],
      defaultPath: "untitled.mdi",
    });
    if (result.canceled || !result.filePath) return null;
    target = result.filePath;
  }
  await fs.writeFile(target, content, "utf-8");
  currentFilePath = target;
  isDirty = false;
  updateWindowTitle();
  return target;
});

ipcMain.handle("set-dirty", (
  _event: Electron.IpcMainInvokeEvent,
  dirty: boolean
) => {
  isDirty = dirty;
});

ipcMain.handle("save-before-close-done", () => {
  isDirty = false;
  mainWindow?.close();
});

ipcMain.handle("check-model-exists", async (
  _event: Electron.IpcMainInvokeEvent,
  modelName: string
) => checkModelExists(modelName));

ipcMain.handle("list-models", async () => listModels());

ipcMain.handle("download-model", async (
  _event: Electron.IpcMainInvokeEvent,
  url: string,
  modelName: string
) => {
  try {
    const modelPath = await downloadModel(url, modelName, (percent) => {
      mainWindow?.webContents.send("model-download-progress", {
        percent,
        modelName,
      });
    });
    return { success: true as const, path: modelPath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false as const, error: message };
  }
});

ipcMain.handle("initialize-ai", async (
  _event: Electron.IpcMainInvokeEvent,
  modelName: string
) => {
  try {
    const modelPath = getModelPath(modelName);
    await proofreadingEngine.initialize(modelPath);
    return { success: true as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false as const, error: message };
  }
});

ipcMain.handle("proofread-text", async (
  _event: Electron.IpcMainInvokeEvent,
  text: string
) => {
  try {
    const result = await proofreadingEngine.proofread(text);
    return { success: true as const, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false as const, error: message };
  }
});

app.whenReady().then(() => {
  // Ensure application name and About panel follow package.json configuration.
  try {
    // app.name is used for the menu bar name on most platforms.
    (app as unknown as { name?: string }).name = APP_NAME;
    if (typeof (app as unknown as { setName?: (name: string) => void }).setName === "function") {
      (app as unknown as { setName: (name: string) => void }).setName(APP_NAME);
    }
    if (typeof (app as unknown as { setAboutPanelOptions?: (opts: { applicationName?: string; applicationVersion?: string }) => void }).setAboutPanelOptions === "function") {
      (app as unknown as { setAboutPanelOptions: (opts: { applicationName?: string; applicationVersion?: string }) => void }).setAboutPanelOptions({
        applicationName: APP_NAME,
        applicationVersion: app.getVersion(),
      });
    }
  } catch {
    // Ignore if setting app metadata fails on some platforms.
  }

  createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

// Handle open-file event (macOS)
app.on("open-file", (event, filePath) => {
  event.preventDefault();
  if (mainWindow && mainWindow.isVisible()) {
    void openFileInWindow(filePath);
  } else {
    filesToOpenOnStartup.push(filePath);
  }
});

app.on("window-all-closed", () => {
  proofreadingEngine.dispose().catch(() => {});
  if (process.platform !== "darwin") app.quit();
});
