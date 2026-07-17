const { ipcMain, shell, BrowserWindow, app } = require("electron");
const crypto = require("crypto");
const { AUTH_CHANNELS } = require("../lib/ipc-channels");
const { isMasBuild } = require("../app-constants");

const PROVIDER_URL = "https://my.illusions.app";
const OAUTH_CLIENT_ID = "illusions";
const REDIRECT_URI = "illusions://auth/callback";
const ACCOUNT_DELETION_URL = `${PROVIDER_URL}/delete-account`;

// These are the top-level identity-provider origins offered by the hosted
// sign-in page. Keep the allowlist exact: an OAuth BrowserWindow must not turn
// into a general-purpose browser just because it hosts third-party sign-in.
const OAUTH_IDP_ORIGINS = new Set([
  "https://github.com",
  "https://accounts.google.com",
  "https://appleid.apple.com",
]);

/** @type {Map<string, { codeVerifier: string, windowId: number }>} state → { codeVerifier, windowId } */
const pendingAuthByState = new Map();
/** @type {Map<string, Electron.BrowserWindow>} state → MAS authorization window */
const authWindowByState = new Map();

function isProviderUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.origin === PROVIDER_URL;
  } catch {
    return false;
  }
}

function isAllowedOAuthUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      (parsed.origin === PROVIDER_URL || OAUTH_IDP_ORIGINS.has(parsed.origin))
    );
  } catch {
    return false;
  }
}

function isAuthCallbackUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "illusions:" && parsed.host === "auth" && parsed.pathname === "/callback"
    );
  } catch {
    return false;
  }
}

/**
 * Open the authorization page inside a restricted, parented window for the
 * Mac App Store build. OAuth credentials never receive the app preload or
 * Node APIs, and top-level navigation is limited to the first-party provider
 * until it returns to the custom-scheme callback.
 */
function openMasAuthWindow({ authUrl, parent, state }) {
  const authWindow = new BrowserWindow({
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    modal: Boolean(parent && !parent.isDestroyed()),
    width: 520,
    height: 720,
    minWidth: 400,
    minHeight: 500,
    show: false,
    title: "Sign in to illusions",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  authWindowByState.set(state, authWindow);

  let receivedCallback = false;
  const cancelPendingLogin = () => {
    if (!receivedCallback) pendingAuthByState.delete(state);
  };

  const interceptNavigation = (event, navigationUrl) => {
    // Chromium may emit both redirect and navigation events for a redirect;
    // process the callback exactly once even in that case.
    if (receivedCallback) {
      event.preventDefault();
      return;
    }
    if (isAuthCallbackUrl(navigationUrl)) {
      event.preventDefault();
      receivedCallback = true;
      handleAuthCallback(navigationUrl);
      authWindow.close();
      return;
    }
    if (!isAllowedOAuthUrl(navigationUrl)) {
      event.preventDefault();
      console.warn("[auth] Blocked OAuth window navigation to:", navigationUrl);
    }
  };
  authWindow.webContents.on("will-navigate", interceptNavigation);
  // OAuth server redirects to the custom protocol, so intercept it before
  // Chromium attempts to hand the URL to an external protocol handler.
  authWindow.webContents.on("will-redirect", interceptNavigation);
  authWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  authWindow.once("ready-to-show", () => authWindow.show());
  authWindow.on("closed", () => {
    authWindowByState.delete(state);
    cancelPendingLogin();
  });

  // Do not await loadURL: the renderer should enter its login-pending state
  // immediately, rather than wait for the user to finish authorization.
  void authWindow.loadURL(authUrl).catch((error) => {
    console.error("[auth] Failed to load OAuth authorization page:", error);
    cancelPendingLogin();
    if (!authWindow.isDestroyed()) authWindow.close();
  });
}

/**
 * Guideline 5.1.1(v) requires account deletion to begin in the app. The
 * account service already owns the authenticated confirmation flow, so MAS
 * hosts that page in a restricted, app-owned window rather than Safari.
 */
function openMasAccountDeletionWindow(parent) {
  const deletionWindow = new BrowserWindow({
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    modal: Boolean(parent && !parent.isDestroyed()),
    width: 560,
    height: 720,
    minWidth: 440,
    minHeight: 560,
    show: false,
    title: "アカウントを削除",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const interceptDeletionNavigation = (event, navigationUrl) => {
    if (!isProviderUrl(navigationUrl)) {
      event.preventDefault();
      console.warn("[auth] Blocked account-deletion navigation to:", navigationUrl);
    }
  };
  deletionWindow.webContents.on("will-navigate", interceptDeletionNavigation);
  deletionWindow.webContents.on("will-redirect", interceptDeletionNavigation);
  deletionWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  deletionWindow.once("ready-to-show", () => deletionWindow.show());
  void deletionWindow.loadURL(ACCOUNT_DELETION_URL).catch((error) => {
    console.error("[auth] Failed to load account deletion page:", error);
    if (!deletionWindow.isDestroyed()) deletionWindow.close();
  });
}

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function registerAuthHandlers() {
  ipcMain.handle(AUTH_CHANNELS.invoke.startLogin, async (event) => {
    const state = crypto.randomBytes(16).toString("hex");
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const win = BrowserWindow.fromWebContents(event.sender);
    const windowId = win ? win.id : -1;
    pendingAuthByState.set(state, { codeVerifier, windowId });

    const params = new URLSearchParams({
      response_type: "code",
      client_id: OAUTH_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: "openid profile email",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    const authUrl = `${PROVIDER_URL}/api/oauth/authorize?${params}`;
    if (isMasBuild) {
      openMasAuthWindow({ authUrl, parent: win, state });
    } else {
      try {
        await shell.openExternal(authUrl);
      } catch (error) {
        pendingAuthByState.delete(state);
        throw error;
      }
    }
    return { state };
  });

  ipcMain.handle(AUTH_CHANNELS.invoke.exchangeCode, async (_event, { code, state }) => {
    const entry = pendingAuthByState.get(state);
    if (!entry) {
      throw new Error("Invalid state parameter");
    }
    const { codeVerifier } = entry;
    pendingAuthByState.delete(state);

    const response = await fetch(`${PROVIDER_URL}/api/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: OAUTH_CLIENT_ID,
        code_verifier: codeVerifier,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error_description || "Token exchange failed");
    }

    return response.json();
  });

  ipcMain.handle(AUTH_CHANNELS.invoke.refreshToken, async (_event, refreshToken) => {
    const response = await fetch(`${PROVIDER_URL}/api/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: OAUTH_CLIENT_ID,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const error = new Error(err.error_description || "Token refresh failed");
      // Attach HTTP status and OAuth error code so the renderer can distinguish
      // permanent (e.g. invalid_grant) vs transient (5xx / network) failures.
      error.status = response.status;
      if (err.error) error.oauthError = err.error;
      throw error;
    }
    return response.json();
  });

  ipcMain.handle(AUTH_CHANNELS.invoke.getUserInfo, async (_event, accessToken) => {
    const response = await fetch(`${PROVIDER_URL}/api/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const error = new Error("Failed to fetch user info");
      // Attach HTTP status so the renderer can distinguish permanent vs transient errors
      error.status = response.status;
      throw error;
    }
    return response.json();
  });

  ipcMain.handle(AUTH_CHANNELS.invoke.logout, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      const winId = win.id;
      for (const [state, entry] of pendingAuthByState) {
        if (entry.windowId === winId) {
          pendingAuthByState.delete(state);
          const authWindow = authWindowByState.get(state);
          if (authWindow && !authWindow.isDestroyed()) authWindow.close();
        }
      }
    }
    return { success: true };
  });

  ipcMain.handle(AUTH_CHANNELS.invoke.openDeleteAccount, async (event) => {
    if (!isMasBuild) return false;
    openMasAccountDeletionWindow(BrowserWindow.fromWebContents(event.sender));
    return true;
  });

  // Clean up pending auth entries when a window is closed
  function attachAuthCleanup(win) {
    win.on("closed", () => {
      const winId = win.id;
      for (const [state, entry] of pendingAuthByState) {
        if (entry.windowId === winId) {
          pendingAuthByState.delete(state);
          const authWindow = authWindowByState.get(state);
          if (authWindow && !authWindow.isDestroyed()) authWindow.close();
        }
      }
    });
  }
  // Register for windows that already exist (e.g. main window created before this call)
  for (const win of BrowserWindow.getAllWindows()) {
    attachAuthCleanup(win);
  }
  // Register for future windows
  app.on("browser-window-created", (_, win) => {
    attachAuthCleanup(win);
  });
}

function handleAuthCallback(url) {
  try {
    const parsed = new URL(url);
    // illusions://auth/callback?code=xxx&state=yyy
    if (parsed.host !== "auth" || parsed.pathname !== "/callback") return;

    const code = parsed.searchParams.get("code");
    const state = parsed.searchParams.get("state");
    const error = parsed.searchParams.get("error");

    let targetWindow = null;

    // Route callback to the specific window that initiated the login flow
    const entry = state ? pendingAuthByState.get(state) : null;
    // Never deliver a callback for an unknown state to an arbitrary window.
    // Apart from enforcing the OAuth CSRF invariant, this prevents a custom
    // protocol URL from targeting the currently focused document.
    if (!entry) {
      console.warn("[auth] Ignored OAuth callback with missing or invalid state");
      return;
    }
    const originWin = BrowserWindow.fromId(entry.windowId);
    if (originWin && !originWin.isDestroyed()) targetWindow = originWin;

    // An error callback does not result in exchangeCode(), so it must release
    // its verifier here. Successful callbacks retain it for exchangeCode.
    if (error) pendingAuthByState.delete(state);

    if (targetWindow) {
      if (targetWindow.isMinimized()) targetWindow.restore();
      targetWindow.focus();
      targetWindow.webContents.send(AUTH_CHANNELS.event.callback, { code, state, error });
    }
  } catch (err) {
    console.error("[auth] Failed to handle callback URL:", err);
  }
}

module.exports = {
  registerAuthHandlers,
  handleAuthCallback,
  isAllowedOAuthUrl,
  isProviderUrl,
};
