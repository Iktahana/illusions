const { ipcMain, shell, BrowserWindow, app } = require("electron");
const crypto = require("crypto");
const { AUTH_CHANNELS } = require("../lib/ipc-channels");
const {
  startMacOSAuthSession,
  cancelMacOSAuthSession,
  cancelAllMacOSAuthSessionsForShutdown,
} = require("../lib/macos-auth-session");

const PROVIDER_URL = "https://my.illusions.app";
const OAUTH_CLIENT_ID = "illusions";
const REDIRECT_URI = "illusions://auth/callback";

/** @type {Map<string, { codeVerifier: string, windowId: number }>} state → { codeVerifier, windowId } */
const pendingAuthByState = new Map();

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
    if (process.platform === "darwin") {
      // ASWebAuthenticationSession uses the system browser and returns the
      // matching callback directly to this process. It avoids embedding any
      // identity provider (especially Apple Account) in an Electron view.
      void Promise.resolve()
        .then(() => startMacOSAuthSession(authUrl, "illusions", state))
        .then((callbackUrl) => handleAuthCallback(callbackUrl))
        .catch(async (error) => {
          if (error?.code === "ERR_AUTH_CANCELLED") {
            pendingAuthByState.delete(state);
            return;
          }
          console.warn(
            "[auth] ASWebAuthenticationSession unavailable; opening system browser:",
            error,
          );
          try {
            await shell.openExternal(authUrl);
          } catch (fallbackError) {
            pendingAuthByState.delete(state);
            console.error(
              "[auth] Failed to open OAuth authorization page in browser:",
              fallbackError,
            );
          }
        });
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
          cancelMacOSAuthSession(state);
        }
      }
    }
    return { success: true };
  });

  // Clean up pending auth entries when a window is closed
  function attachAuthCleanup(win) {
    win.on("closed", () => {
      const winId = win.id;
      for (const [state, entry] of pendingAuthByState) {
        if (entry.windowId === winId) {
          pendingAuthByState.delete(state);
          cancelMacOSAuthSession(state);
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
  app.once("before-quit", () => {
    // Do not let AuthenticationServices call back into a Node runtime that is
    // being torn down. The native bridge suppresses completion callbacks after
    // this explicit shutdown cancellation.
    cancelAllMacOSAuthSessionsForShutdown();
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
};
