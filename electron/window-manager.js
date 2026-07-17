// Window management: creation, lifecycle, and power state broadcasting

const { app, BrowserWindow, dialog, shell, ipcMain } = require("electron");
const path = require("path");
const { isDev } = require("./app-constants");
const { isSafeExternalUrl, normalizeExternalUrl } = require("./lib/url-policy");
const { SYSTEM_CHANNELS, POWER_CHANNELS } = require("./lib/ipc-channels");

// #1839: backstop timeout for the quit-and-install close handshake. If the
// renderer neither closes nor signals abort within this window, we treat it as
// aborted (quit cancelled, data preserved) rather than hang forever.
const CLOSE_HANDSHAKE_TIMEOUT_MS = 30000;

let mainWindow = null;
const allWindows = new Set();
// Settings is a singleton utility window, not an editor window.  Keeping it
// outside `allWindows` prevents editor close/save and power broadcasts from
// treating settings as a document-bearing window.
let settingsWindow = null;

// --- Power state monitoring ---

/**
 * Broadcast a power state change to all renderer windows.
 */
function broadcastPowerState(state) {
  for (const win of allWindows) {
    if (!win.isDestroyed()) {
      win.webContents.send(POWER_CHANNELS.event.stateChanged, state);
    }
  }
}

/**
 * Broadcast an arbitrary power lifecycle event (no payload) to all renderer
 * windows. Used for resume / suspend / lock-screen signals (M-1/M-2/M-5).
 *
 * @param {string} channel - One of POWER_CHANNELS.event.*
 */
function broadcastPowerEvent(channel) {
  for (const win of allWindows) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel);
    }
  }
}

function getMainWindow() {
  return mainWindow;
}

function getAllWindows() {
  return allWindows;
}

function getSettingsWindow() {
  return settingsWindow;
}

function isSettingsWindow(win) {
  return Boolean(win && settingsWindow === win && !win.isDestroyed());
}

/**
 * Create (or focus) the one global Settings window.
 *
 * The page is still index.html with a query mode so it works with Next's
 * static export as well as the development server; no separately emitted
 * settings.html artifact is required.
 */
async function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }

  const preloadPath = path.join(__dirname, "preload.js");
  const newWindow = new BrowserWindow({
    width: 960,
    height: 760,
    minWidth: 680,
    minHeight: 520,
    show: false,
    title: "設定",
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      plugins: true,
    },
  });
  settingsWindow = newWindow;

  newWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.protocol === "file:") return;
    if (isDev && parsedUrl.hostname === "localhost") return;
    event.preventDefault();
    console.warn("[Security] Blocked navigation to:", navigationUrl);
  });
  newWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      shell.openExternal(normalizeExternalUrl(url)).catch((error) => {
        console.warn("[Security] shell.openExternal failed:", error);
      });
    }
    return { action: "deny" };
  });
  newWindow.webContents.on("preload-error", (_event, preloadPathForError, error) => {
    console.error("[Main] Preload error:", preloadPathForError, error);
  });
  newWindow.once("ready-to-show", () => newWindow.show());
  newWindow.on("closed", () => {
    if (settingsWindow === newWindow) settingsWindow = null;
  });

  if (isDev) {
    newWindow.loadURL("http://localhost:3020?settings");
  } else {
    const filePath = path.join(app.getAppPath(), "out", "index.html");
    newWindow.loadURL(require("url").pathToFileURL(filePath).href + "?settings");
  }

  return newWindow;
}

// 新しいウィンドウを作成（マルチウィンドウ対応）
// showWelcome: true の場合、自動復元をスキップしてウェルカム画面を表示する
async function createWindow({ showWelcome = false, hasPendingFile = false } = {}) {
  const preloadPath = path.join(__dirname, "preload.js");

  const newWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    // #1856: 狭いウィンドウで本文先頭やツールバーがクリップされるのを防ぐため
    // 最小サイズの床を設ける。ActivityBar(48) + サイドパネル最小(200) +
    // 読みやすい本文幅(>=360) が収まる値（lib/editor-page/responsive-layout.ts の
    // MIN_WINDOW_WIDTH / MIN_WINDOW_HEIGHT と一致）。
    minWidth: 640,
    minHeight: 480,
    show: false,
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      plugins: true,
    },
  });

  // Navigation guards: block navigation away from the app
  newWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    // Allow dev server and file:// protocol
    if (parsedUrl.protocol === "file:") return;
    if (isDev && parsedUrl.hostname === "localhost") return;
    event.preventDefault();
    console.warn("[Security] Blocked navigation to:", navigationUrl);
  });

  // Block new window creation from renderer
  newWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Only allow strictly-parsed http(s) URLs in the default browser.
    // All other schemes (file:, smb:, javascript:, ...) and unparseable
    // URLs are denied — fail closed (#1567 S3).
    if (isSafeExternalUrl(url)) {
      // Open the normalized form, not the raw renderer string; handle the
      // returned promise so OS handler failures cannot become unhandled
      // rejections in the main process.
      shell.openExternal(normalizeExternalUrl(url)).catch((error) => {
        console.warn("[Security] shell.openExternal failed:", error);
      });
    } else {
      console.warn("[Security] Blocked external open of non-http(s) URL:", url);
    }
    return { action: "deny" };
  });

  // Preload error detection
  newWindow.webContents.on("preload-error", (_event, _preloadPath, error) => {
    console.error("[Main] Preload error:", _preloadPath, error);
  });

  // ウィンドウをセットに追加
  allWindows.add(newWindow);

  // 最初のウィンドウの場合はメインウィンドウに設定
  if (!mainWindow) {
    mainWindow = newWindow;
  }

  newWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[Main] Renderer process gone:", details.reason, details.exitCode);
  });

  newWindow.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) console.log(`[Renderer] ${message}`);
  });

  newWindow.once("ready-to-show", () => {
    newWindow?.show();
  });

  // ウィンドウ終了前に状態をフラッシュする（未保存の場合はダイアログも表示）
  let isHandlingClose = false;

  // #1839 (Codex F-04): 保存失敗で renderer が closeAborted を送ったら、通常 close
  // 経路でも isHandlingClose を戻す。これがないと 2 回目の close が「処理中」とみなされ
  // 確認なしで閉じてしまう（実 close は destroy 経由なので close イベントは常に prevent）。
  const onWindowCloseAborted = (event) => {
    if (!newWindow.isDestroyed() && event.sender === newWindow.webContents) {
      isHandlingClose = false;
    }
  };
  ipcMain.on(SYSTEM_CHANNELS.send.closeAborted, onWindowCloseAborted);

  newWindow.on("close", (event) => {
    // 実際のクローズは saveDoneAndClose → win.destroy() 経由のみ。close イベントは
    // 常に prevent し、処理中（isHandlingClose）の再入もブロックする（Codex F-04）。
    if (isHandlingClose) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    isHandlingClose = true;

    if (newWindow.isDocumentEdited()) {
      // 未保存の変更がある場合は確認ダイアログを表示（3 ボタン）
      dialog
        .showMessageBox(newWindow, {
          type: "question",
          buttons: ["保存", "保存しない", "キャンセル"],
          defaultId: 0,
          cancelId: 2,
          message: "変更が保存されていません",
          detail: "保存しない場合、変更は失われます。",
        })
        .then(({ response }) => {
          if (response === 0) {
            // "保存": flush state + save dirty files, then close
            newWindow.webContents.send(SYSTEM_CHANNELS.event.requestSaveBeforeClose);
          } else if (response === 1) {
            // "保存しない": flush state only (preserve tab/layout), then close
            newWindow.webContents.send(SYSTEM_CHANNELS.event.requestFlushStateBeforeClose);
          } else {
            // "キャンセル": ウィンドウを開いたまま
            isHandlingClose = false;
          }
        })
        .catch(() => {
          isHandlingClose = false;
        });
    } else {
      // 変更なし: タブ・レイアウト状態をフラッシュしてから閉じる
      newWindow.webContents.send(SYSTEM_CHANNELS.event.requestFlushStateBeforeClose);
    }
  });

  // ウィンドウ閉鎖時にセットから削除
  newWindow.on("closed", () => {
    ipcMain.removeListener(SYSTEM_CHANNELS.send.closeAborted, onWindowCloseAborted);
    allWindows.delete(newWindow);
    if (mainWindow === newWindow) {
      mainWindow = allWindows.values().next().value || null;
    }
  });

  const queryParts = [];
  if (showWelcome) queryParts.push("welcome");
  if (hasPendingFile) queryParts.push("pending-file");
  const query = queryParts.length ? `?${queryParts.join("&")}` : "";
  if (isDev) {
    newWindow.loadURL(`http://localhost:3020${query}`);
    newWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // Next.js の静的出力 — app.getAppPath() はパッケージのルートを返す
    const filePath = path.join(app.getAppPath(), "out", "index.html");
    const fileUrl = require("url").pathToFileURL(filePath).href + (query ?? "");
    newWindow.loadURL(fileUrl);
  }

  // アプリメニューを設定（最近のプロジェクトを含む）
  // Defer require to avoid circular dependency with menu.js
  const { rebuildApplicationMenu } = require("./menu");
  await rebuildApplicationMenu();

  return newWindow;
}

// 従来のコードに対応
async function createMainWindow({ hasPendingFile = false } = {}) {
  return createWindow({ hasPendingFile });
}

/**
 * quitAndInstall の前に全ウィンドウの未保存変更を処理するヘルパー。
 *
 * 各ウィンドウについて:
 *   - dirty (isDocumentEdited) なら 保存/保存しない/キャンセル ダイアログを表示する。
 *     - 「保存」: requestSaveBeforeClose を renderer に送信し、renderer が
 *       saveBeforeCloseDone を invoke → win.destroy() されるまで待機する。
 *     - 「保存しない」: requestFlushStateBeforeClose を送信し destroy を待つ。
 *     - 「キャンセル」: false を返す（呼び出し元は quitAndInstall を中止すること）。
 *   - clean なら requestFlushStateBeforeClose を送信して destroy を待つ。
 *
 * @returns {Promise<boolean>} true = 全ウィンドウ処理完了、false = ユーザーがキャンセル
 */
async function saveAllBeforeQuitAndInstall() {
  const windows = Array.from(allWindows).filter((w) => !w.isDestroyed());

  for (const win of windows) {
    const cancelled = await _handleWindowBeforeQuit(win);
    if (cancelled) return false;
  }
  return true;
}

/**
 * 単一ウィンドウの終了前保存処理。
 * @param {import("electron").BrowserWindow} win
 * @returns {Promise<boolean>} true = ユーザーがキャンセルした
 */
async function _handleWindowBeforeQuit(win) {
  if (win.isDestroyed()) return false;

  /**
   * destroy（"closed"）か、renderer からの close 中止シグナル（closeAborted,
   * 保存失敗/コンフリクト時）のどちらかを待つ。abort を待たないと、保存に
   * 失敗して renderer が saveDoneAndClose を呼ばないケースで永久に待ち続け、
   * アップデート再起動がハングしてしまう（#1839）。
   * @returns {Promise<"closed" | "aborted">}
   */
  function waitForCloseOrAbort() {
    if (win.isDestroyed()) return Promise.resolve("closed");
    return new Promise((resolve) => {
      const onClosed = () => {
        cleanup();
        resolve("closed");
      };
      const onAborted = (event) => {
        if (win.isDestroyed() || event.sender === win.webContents) {
          cleanup();
          resolve("aborted");
        }
      };
      // Backstop（レビュー Finding 3）: renderer が saveDoneAndClose も
      // notifyCloseAborted も呼ばずに固まった場合（ハンドラ内の例外など）でも、
      // 永久ハング＋リスナーリークを避けるため一定時間で "aborted" に倒す。
      // "aborted" = quit 中止なので、データは失わずウィンドウが残る安全側。
      const timer = setTimeout(() => {
        cleanup();
        resolve("aborted");
      }, CLOSE_HANDSHAKE_TIMEOUT_MS);
      function cleanup() {
        clearTimeout(timer);
        win.removeListener("closed", onClosed);
        ipcMain.removeListener(SYSTEM_CHANNELS.send.closeAborted, onAborted);
      }
      win.once("closed", onClosed);
      ipcMain.on(SYSTEM_CHANNELS.send.closeAborted, onAborted);
    });
  }

  if (win.isDocumentEdited()) {
    const { response } = await dialog.showMessageBox(win, {
      type: "question",
      buttons: ["保存", "保存しない", "キャンセル"],
      defaultId: 0,
      cancelId: 2,
      message: "変更が保存されていません",
      detail: "保存しない場合、変更は失われます。",
    });

    if (response === 2) {
      // キャンセル
      return true;
    } else if (response === 0) {
      // 「保存」: renderer にフラッシュ＋保存を依頼し、destroy か abort を待つ。
      // 保存失敗で abort されたら quit を中止する（データを守りウィンドウを残す）。
      win.webContents.send(SYSTEM_CHANNELS.event.requestSaveBeforeClose);
      const result = await waitForCloseOrAbort();
      if (result === "aborted") return true;
    } else {
      // 「保存しない」: フラッシュのみ依頼し、destroy を待つ。renderer ハング等で
      // timeout/abort したら安全側で quit を中止する（Codex F-05）。
      win.webContents.send(SYSTEM_CHANNELS.event.requestFlushStateBeforeClose);
      if ((await waitForCloseOrAbort()) === "aborted") return true;
    }
  } else {
    // clean: フラッシュのみ依頼し、destroy を待つ。clean 判定が debounce 遅延で
    // 誤っている可能性もあるため、timeout/abort は安全側で quit を中止（Codex F-05/F-02）。
    win.webContents.send(SYSTEM_CHANNELS.event.requestFlushStateBeforeClose);
    if ((await waitForCloseOrAbort()) === "aborted") return true;
  }

  return false;
}

module.exports = {
  getMainWindow,
  getAllWindows,
  getSettingsWindow,
  isSettingsWindow,
  createWindow,
  createMainWindow,
  createSettingsWindow,
  broadcastPowerState,
  broadcastPowerEvent,
  saveAllBeforeQuitAndInstall,
};
