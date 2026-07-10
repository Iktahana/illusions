// Electron のメインプロセス入口

const { app, BrowserWindow, powerMonitor } = require("electron");
const path = require("path");

// Configure module resolution paths for ASAR environment
if (app.isPackaged) {
  const unpackedPath = path.join(
    process.resourcesPath,
    "app.asar.unpacked",
    "dist-main",
    "node_modules",
  );
  const packedPath = path.join(__dirname, "node_modules");

  // Set NODE_PATH to include both packed and unpacked locations
  const existingPath = process.env.NODE_PATH || "";
  process.env.NODE_PATH = [unpackedPath, packedPath, existingPath]
    .filter(Boolean)
    .join(path.delimiter);

  // Reinitialize module paths
  require("module").Module._initPaths();
}

const { registerNlpHandlers } = require("./ipc/nlp-ipc");
const { registerStorageHandlers, getStorageManager } = require("./ipc/storage-ipc");
const { registerVFSHandlers } = require("./ipc/vfs-ipc");
const { setupAutoUpdater, checkForUpdates } = require("./auto-updater");
const { createMainWindow, broadcastPowerState, broadcastPowerEvent } = require("./window-manager");
const {
  handleMdiFileOpen,
  getPendingFilePath,
  setPendingFilePath,
  registerFileHandlers,
} = require("./ipc/file-ipc");
const { registerShellHandlers } = require("./ipc/shell-ipc");
const { registerSystemHandlers } = require("./ipc/system-ipc");
const { registerPtyHandlers } = require("./ipc/pty-ipc");
const { killAllSessions, killSessionsForWindow } = require("./ipc/terminal-session-registry");
const { registerAuthHandlers, handleAuthCallback } = require("./ipc/auth-ipc");
const { registerEditorHandlers } = require("./ipc/editor-ipc");
const { registerDictHandlers } = require("./ipc/dict-ipc");
const { getDictManager } = require("./dict-manager");
const { registerRulesetsHandlers } = require("./ipc/rulesets-ipc");
const { getRulesetsManager } = require("./rulesets-manager");
const { registerAnalyticsHandlers } = require("./ipc/analytics-ipc");
const { registerErrorReportingHandlers } = require("./ipc/error-reporting-ipc");
const {
  initializeErrorReporting,
  captureMainError,
  captureRendererError,
} = require("./error-reporting");
const { DICT_CHANNELS, POWER_CHANNELS, RULESETS_CHANNELS } = require("./lib/ipc-channels");

// --- Aptabase（匿名使用統計）初期化 ---
// initialize() は app.whenReady() より前に呼ぶ必要がある（内部でカスタムプロトコルを
// privileged scheme として登録するため）。App Key はビルド時に esbuild の define で
// 埋め込まれる（scripts/bundle-electron.mjs）。未設定（OSSビルド等）の場合は計測を無効化する。
const APTABASE_APP_KEY = process.env.APTABASE_APP_KEY || "";
if (APTABASE_APP_KEY) {
  const { initialize: initializeAnalytics } = require("@aptabase/electron/main");
  initializeAnalytics(APTABASE_APP_KEY);
}

const HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000;
let sessionStartedAt = null;
let heartbeatTimer = null;
let hadFocusEventSinceLastHeartbeat = false;
let hasHandledAppClosed = false;

// Keep these boundaries in sync with lib/analytics/usage-events.ts bucketSessionDuration.
function bucketSessionDuration(ms) {
  const minutes = ms / 60000;
  if (minutes < 1) return "lt_1m";
  if (minutes < 5) return "1_5m";
  if (minutes < 15) return "5_15m";
  if (minutes < 60) return "15_60m";
  return "gte_60m";
}

initializeErrorReporting({
  dsn: process.env.ERROR_REPORT_DSN || "",
  getStorageManager,
  getRelease: () => app.getVersion(),
  environment: app.isPackaged ? "production" : "development",
});

process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
  void captureMainError(err, { source: "uncaughtException" });
});
process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled rejection:", reason);
  void captureMainError(reason, { source: "unhandledRejection" });
});

// --- Single-instance lock ---
// Ensure only one instance of the app is running. On Windows/Linux this prevents
// duplicate windows when a user double-clicks a .mdi file while the app is already open.
// In dev mode, skip the lock so dev and production can run side-by-side.
const { isDev } = require("./app-constants");

// Register custom protocol for OAuth callbacks
if (!isDev) {
  app.setAsDefaultProtocolClient("illusions");
}

const gotTheLock = isDev || app.requestSingleInstanceLock();
console.log("[DEBUG] Single instance lock:", gotTheLock, isDev ? "(skipped in dev)" : "");
if (!gotTheLock) {
  console.log("[DEBUG] Another instance is running, quitting.");
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    const { getMainWindow } = require("./window-manager");
    // Focus existing window
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    // Check for auth callback URL (Windows/Linux)
    const authUrl = commandLine.find((a) => a.startsWith("illusions://auth/"));
    if (authUrl) {
      handleAuthCallback(authUrl);
      return;
    }
    // Extract .mdi path from argv (Windows/Linux pass file path as CLI argument)
    const mdiArg = commandLine.find(
      (a) => path.extname(a).toLowerCase() === ".mdi" && !a.startsWith("-"),
    );
    if (mdiArg) {
      const resolvedPath = path.resolve(mdiArg);
      void handleMdiFileOpen(resolvedPath);
    }
  });
}

// Handle .mdi file association (macOS: open-file event, Windows/Linux: process.argv)
app.on("open-file", async (event, filePath) => {
  event.preventDefault();
  const { getMainWindow } = require("./window-manager");
  const mainWindow = getMainWindow();
  if (mainWindow && mainWindow.webContents) {
    await handleMdiFileOpen(filePath);
  } else {
    setPendingFilePath(filePath);
  }
});

// Handle OAuth callback via custom URL scheme (macOS)
app.on("open-url", (event, url) => {
  event.preventDefault();
  if (url.startsWith("illusions://auth/")) {
    handleAuthCallback(url);
  }
});

console.log("[DEBUG] Waiting for app ready...");
app.whenReady().then(async () => {
  console.log("[DEBUG] App is ready, creating window...");
  // Content Security Policy
  const { session } = require("electron");
  const { isDev } = require("./app-constants");
  // Read persisted aiBaseUrl so the custom AI Gateway origin can be added to CSP.
  // We read directly via storage manager (synchronous SQLite) before setting up the header filter.
  let extraAiConnectSrc = "";
  try {
    const { getStorageManager } = require("./ipc/storage-ipc");
    const appState = getStorageManager().loadAppState();
    const aiBaseUrl = appState?.aiBaseUrl;
    if (aiBaseUrl) {
      const origin = new URL(aiBaseUrl).origin;
      // Only add if it is not already covered by the static list
      const staticHosts = [
        "https://my.illusions.app",
        "https://api.openai.com",
        "https://api.anthropic.com",
        "https://generativelanguage.googleapis.com",
      ];
      if (!staticHosts.includes(origin)) {
        extraAiConnectSrc = ` ${origin}`;
      }
    }
  } catch (e) {
    console.warn("[CSP] Failed to read aiBaseUrl for dynamic CSP:", e);
  }

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // Skip CSP rewriting for Chromium internal URLs (PDF viewer extension, etc.)
    const url = details.url;
    if (
      url.startsWith("chrome-extension://") ||
      url.startsWith("chrome://") ||
      url.startsWith("blob:")
    ) {
      callback({ cancel: false });
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        // Note: 'unsafe-inline' is required in script-src because Next.js App Router
        // static export generates inline <script> tags for RSC flight data.
        // Removing it causes a white screen. XSS is mitigated by contextIsolation
        // + nodeIntegration:false + file:// protocol.
        "Content-Security-Policy": [
          [
            "default-src 'self'",
            // blob: は外部ルールセットを lint worker 内で ESM `import(blobURL)` する
            // ために必要（dynamic import は worker-src ではなく script-src で評価される）。
            // blob は同一オリジンのスクリプトからしか生成できず、ルールセットは
            // sha256 検証済みコードのみを Blob 化するため XSS 面は限定的。
            `script-src 'self' 'unsafe-inline' blob:${isDev && !app.isPackaged ? " 'unsafe-eval'" : ""}`,
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data: https://fonts.gstatic.com",
            `connect-src 'self' https://my.illusions.app https://bug-report.api.illusions.app https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com${extraAiConnectSrc} ws://localhost:*`,
            "worker-src 'self' blob:",
            "object-src blob:",
            "frame-src blob:",
          ].join("; "),
        ],
      },
    });
  });

  // Windows/Linux: check process.argv for .mdi file association
  if (process.platform !== "darwin" && !getPendingFilePath()) {
    const mdiArg = process.argv.find(
      (a) => path.extname(a).toLowerCase() === ".mdi" && !a.startsWith("-"),
    );
    if (mdiArg) setPendingFilePath(path.resolve(mdiArg));
  }

  console.log("[DEBUG] Calling createMainWindow...");
  await createMainWindow({ hasPendingFile: !!getPendingFilePath() });
  console.log("[DEBUG] Window created successfully");

  // Register IPC handlers
  registerNlpHandlers();
  registerStorageHandlers();
  registerVFSHandlers();
  registerFileHandlers();
  registerShellHandlers();
  registerSystemHandlers();
  registerPtyHandlers();
  registerAuthHandlers();
  registerEditorHandlers();
  registerDictHandlers();
  registerRulesetsHandlers();
  registerAnalyticsHandlers({ hasAppKey: () => Boolean(APTABASE_APP_KEY) });
  registerErrorReportingHandlers({ captureRendererError });

  // 匿名使用統計：起動イベント（同意フラグ未設定時はデフォルト ON）
  if (APTABASE_APP_KEY) {
    try {
      const appState = await getStorageManager().loadAppState();
      if (appState?.usageAnalyticsConsent !== false) {
        const { trackEvent } = require("@aptabase/electron/main");
        // Fire-and-forget: a failed/offline beacon must not stop sessionStartedAt
        // and the heartbeat timer from being set up below (they're purely local
        // clock/state and don't depend on this network call succeeding).
        void trackEvent("app_launched", { platform: process.platform }).catch((trackError) => {
          console.warn("[Analytics] Failed to send app_launched event:", trackError);
        });
        sessionStartedAt = Date.now();

        heartbeatTimer = setInterval(() => {
          const isFocusedNow = BrowserWindow.getAllWindows().some((w) => w.isFocused());
          const shouldSend = hadFocusEventSinceLastHeartbeat || isFocusedNow;
          hadFocusEventSinceLastHeartbeat = false;
          if (!shouldSend) return;

          // Re-check consent on every tick: the user can toggle it off mid-session
          // from Settings, and unlike the one-shot app_launched event, this timer
          // keeps firing for the rest of the session unless we recheck.
          void (async () => {
            try {
              const currentState = await getStorageManager().loadAppState();
              if (currentState?.usageAnalyticsConsent === false) return;
            } catch {
              // Unreadable — fail open, same default-on convention as above.
            }
            trackEvent("app_heartbeat").catch((err) => {
              console.warn("[Analytics] Failed to send app_heartbeat event:", err);
            });
          })();
        }, HEARTBEAT_INTERVAL_MS);
      }
    } catch (err) {
      console.warn("[Analytics] Failed to send app_launched event:", err);
    }
  }

  // Power state monitoring
  powerMonitor.on("on-ac", () => broadcastPowerState("ac"));
  powerMonitor.on("on-battery", () => broadcastPowerState("battery"));

  // System lifecycle events (M-1/M-2 resume, M-5 lock-screen)
  // "resume" fires after the system wakes from sleep; the renderer must
  // re-arm its auto-save timer and flush dirty tabs immediately.
  powerMonitor.on("resume", () => broadcastPowerEvent(POWER_CHANNELS.event.resumed));
  // "suspend" fires just before sleep; renderer gets an early-warning signal.
  powerMonitor.on("suspend", () => broadcastPowerEvent(POWER_CHANNELS.event.suspended));
  // "lock-screen" fires when the user locks the screen (macOS/Windows only);
  // the renderer must flush dirty tabs immediately.
  powerMonitor.on("lock-screen", () => broadcastPowerEvent(POWER_CHANNELS.event.lockScreen));

  // ウィンドウ作成後に auto-updater を初期化
  setupAutoUpdater();

  // 起動時に自動でアップデート確認（少し遅らせる）
  setTimeout(() => {
    checkForUpdates(false);
  }, 3000);

  // 辞典データ更新確認（AppState の dictAutoCheckUpdates が true の場合のみ）
  setTimeout(async () => {
    try {
      const appState = await getStorageManager().loadAppState();
      // Default to checking if not explicitly disabled
      const shouldCheck = appState?.dictAutoCheckUpdates !== false;
      if (shouldCheck) {
        const mgr = getDictManager();
        const status = mgr.getStatus();
        if (status.status === "installed") {
          const updateInfo = await mgr.checkUpdate().catch(() => null);
          if (updateInfo?.updateAvailable) {
            console.log("[Dict] Update available:", updateInfo.latestVersion);
            // Notify the focused window (if any)
            const focusedWin = BrowserWindow.getFocusedWindow();
            if (focusedWin && !focusedWin.isDestroyed()) {
              focusedWin.webContents.send(DICT_CHANNELS.event.updateAvailable, updateInfo);
            }
          }
        }
      }
    } catch (err) {
      console.error("[Dict] Auto update check failed:", err);
    }
  }, 5000);

  // 公式校正ルールセットの自動ダウンロード/更新（同意不要・サイレント・best-effort）。
  // 起動を妨げないよう遅延実行し、失敗は握りつぶす（オフライン等でも問題なし）。
  // AppState の rulesetsAutoSync が明示的に false のときのみ無効化。
  setTimeout(async () => {
    try {
      const appState = await getStorageManager().loadAppState();
      if (appState?.rulesetsAutoSync === false) return;
      const summary = await getRulesetsManager().syncAllOfficial();
      const installed = summary.filter((s) => s.status === "installed");
      if (installed.length > 0) {
        const ids = installed.map((s) => s.id);
        console.log("[Rulesets] auto-sync installed:", ids.join(", "));
        // Notify every open renderer so its lint worker (re)loads the freshly
        // installed rulesets WITHOUT an app restart. The interactive sync IPC
        // handler emits the same event; this closes the gap on first launch
        // where a newly-added ruleset would otherwise stay inactive until the
        // next start (the mount-time syncLoadedRulesets had already run before
        // this delayed download finished, and nothing re-signaled the renderer).
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send(RULESETS_CHANNELS.event.changed, {
              reason: "installed",
              ids,
            });
          }
        }
      }
    } catch (err) {
      console.warn("[Rulesets] auto-sync failed:", err);
    }
  }, 6000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createMainWindow();
  });
});

app.on("before-quit", () => {
  // Kill all active PTY sessions before the process exits
  killAllSessions();

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  if (!APTABASE_APP_KEY || sessionStartedAt === null || hasHandledAppClosed) return;
  hasHandledAppClosed = true;

  // Deliberately does NOT preventDefault()/delay quit: window-manager.js's
  // per-window `close` handler owns the unsaved-changes save dialog and state
  // flush (see the quitAndInstall backstop at #1839), and this must never race
  // or get skipped for an analytics beacon. Fire-and-forget, same as
  // app_launched — losing an occasional app_closed event on a fast quit is a
  // fine trade-off; losing a user's unsaved manuscript is not.
  const duration_bucket = bucketSessionDuration(Date.now() - sessionStartedAt);
  void (async () => {
    try {
      // Re-check consent: it may have been toggled off after app_launched.
      const appState = await getStorageManager().loadAppState();
      if (appState?.usageAnalyticsConsent === false) return;
    } catch {
      // Unreadable — fail open, same default-on convention as elsewhere.
    }
    const { trackEvent } = require("@aptabase/electron/main");
    trackEvent("app_closed", { duration_bucket }).catch((err) => {
      console.warn("[Analytics] Failed to send app_closed event:", err);
    });
  })();
});

// Per-window menu state lifecycle: focus → swap active state; closed → cleanup
app.on("browser-window-focus", (_event, win) => {
  const { setActiveWindowId, rebuildApplicationMenu } = require("./menu");
  setActiveWindowId(win.id);
  void rebuildApplicationMenu();
});

// Kill PTY sessions for a window when it is closed
app.on("browser-window-created", (_event, win) => {
  const wcId = win.webContents.id;
  const winId = win.id;

  if (APTABASE_APP_KEY) {
    win.on("focus", () => {
      hadFocusEventSinceLastHeartbeat = true;
    });
    if (win.isFocused()) hadFocusEventSinceLastHeartbeat = true;
  }

  win.on("closed", () => {
    killSessionsForWindow(wcId);
    // Remove per-window menu state to prevent memory leak
    const { removeWindowState } = require("./menu");
    removeWindowState(winId);
  });

  // Kill orphaned PTYs if the renderer crashes
  win.webContents.on("destroyed", () => {
    killSessionsForWindow(wcId);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
