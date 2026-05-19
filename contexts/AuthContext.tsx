"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { isElectronRenderer } from "@/lib/utils/runtime-env";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
  plan: string;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth は AuthProvider の内側で使用してください");
  return ctx;
}

/**
 * Safe variant that returns null when called outside an AuthProvider.
 * Use in components that may render without auth context (e.g. export dialogs).
 */
export function useAuthSafe(): AuthContextValue | null {
  return useContext(AuthContext);
}

// ---------------------------------------------------------------------------
// Electron-only token persistence (safeStorage / IPC)
// ---------------------------------------------------------------------------

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

async function saveTokens(tokens: StoredTokens): Promise<void> {
  const api = window.electronAPI;
  if (!api?.safeStorage || !api?.storage) return;

  try {
    const isAvailable = await api.safeStorage.isAvailable();
    if (isAvailable) {
      const json = JSON.stringify(tokens);
      const encrypted = await api.safeStorage.encrypt(json);
      if (encrypted) {
        await api.storage.setItem("auth:tokens", encrypted);
        return;
      }
    }
  } catch {
    // safeStorage not available, fall back to plain storage
  }

  // Fallback: store without encryption (less secure but functional)
  await api.storage.setItem("auth:tokens", JSON.stringify(tokens));
}

async function loadTokens(): Promise<StoredTokens | null> {
  const api = window.electronAPI;
  if (!api?.storage) return null;

  try {
    const stored = await api.storage.getItem("auth:tokens");
    if (!stored) return null;

    // Try to decrypt first (encrypted data)
    if (api.safeStorage) {
      try {
        const isAvailable = await api.safeStorage.isAvailable();
        if (isAvailable) {
          const decrypted = await api.safeStorage.decrypt(stored);
          if (decrypted) {
            return JSON.parse(decrypted) as StoredTokens;
          }
        }
      } catch {
        // Not encrypted or decryption failed, try parsing directly
      }
    }

    // Fallback: try parsing as plain JSON
    return JSON.parse(stored) as StoredTokens;
  } catch {
    return null;
  }
}

async function clearTokens(): Promise<void> {
  const api = window.electronAPI;
  if (!api?.storage) return;
  await api.storage.removeItem("auth:tokens");
}

// ---------------------------------------------------------------------------
// Web-only helpers (httpOnly cookie flow via API routes)
// ---------------------------------------------------------------------------

interface MeResponse {
  authenticated: boolean;
  user?: AuthUser;
  expiresAt?: number;
  /**
   * Indicates whether the auth failure is permanent (token invalid/revoked)
   * or transient (network error, server unavailable).
   * Only meaningful when authenticated === false.
   */
  permanent?: boolean;
}

async function fetchMe(): Promise<MeResponse> {
  try {
    const res = await fetch("/api/auth/me/", {
      method: "POST",
      credentials: "same-origin",
    });
    if (res.ok) {
      return (await res.json()) as MeResponse;
    }
    // 401/403 = permanent (token invalid or no session)
    // 5xx = transient (server error)
    const permanent = res.status === 401 || res.status === 403;
    return { authenticated: false, permanent };
  } catch {
    // Network error — transient
    return { authenticated: false, permanent: false };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns whether an error thrown by the Electron auth IPC represents a
 * permanent auth failure (token invalid/revoked) vs a transient error
 * (server unavailable, network issue).
 *
 * The IPC handlers attach `error.status` (HTTP status) and, for the OAuth
 * token endpoint, `error.oauthError` (e.g. `invalid_grant`).
 *
 * Per RFC 6749 §5.2, the token endpoint returns HTTP 400 for client errors
 * such as `invalid_grant` (refresh token expired/revoked). Retrying these
 * cannot succeed, so any 4xx from the auth endpoints must be treated as
 * permanent — otherwise the renderer falls into a tight refresh loop on
 * a revoked token.
 */
function isElectronAuthErrorPermanent(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  const oauthError = (err as Error & { oauthError?: unknown }).oauthError;
  if (
    oauthError === "invalid_grant" ||
    oauthError === "invalid_client" ||
    oauthError === "unauthorized_client" ||
    oauthError === "unsupported_grant_type"
  ) {
    return true;
  }

  if ("status" in err) {
    const status = (err as Error & { status: unknown }).status;
    if (typeof status === "number" && status >= 400 && status < 500) return true;
  }
  // No status attached (network/IPC error) — treat as transient
  return false;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isElectron = useRef(false);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  // --- Electron refresh scheduler ---
  const scheduleElectronRefresh = useCallback(
    (expiresAt: number, refreshToken: string) => {
      clearRefreshTimer();

      // Floor of 60s prevents a tight retry loop when the upstream token has
      // already expired (refreshIn would otherwise compute to 0 and the
      // transient-error branch would re-schedule immediately).
      const TRANSIENT_RETRY_MIN_MS = 60 * 1000;
      const refreshIn = Math.max(expiresAt - Date.now() - 5 * 60 * 1000, TRANSIENT_RETRY_MIN_MS);
      refreshTimerRef.current = setTimeout(async () => {
        const api = window.electronAPI;
        if (!api?.auth) return;

        try {
          const tokenResponse = await api.auth.refreshToken(refreshToken);
          const newExpiresAt = Date.now() + tokenResponse.expires_in * 1000;
          await saveTokens({
            accessToken: tokenResponse.access_token,
            refreshToken: tokenResponse.refresh_token,
            expiresAt: newExpiresAt,
          });

          const userInfo = await api.auth.getUserInfo(tokenResponse.access_token);
          setUser({
            id: userInfo.sub,
            email: userInfo.email,
            name: userInfo.name,
            image: userInfo.picture,
            plan: userInfo.plan,
          });

          scheduleElectronRefresh(newExpiresAt, tokenResponse.refresh_token);
        } catch (err) {
          if (isElectronAuthErrorPermanent(err)) {
            // Permanent failure (4xx / invalid_grant): token is invalid — log out
            setUser(null);
            await clearTokens();
          } else {
            // Transient failure (5xx / network): keep session, retry after the floor delay
            scheduleElectronRefresh(expiresAt, refreshToken);
          }
        }
      }, refreshIn);
    },
    [clearRefreshTimer],
  );

  // --- Web refresh scheduler ---
  const scheduleWebRefresh = useCallback(
    (expiresAt: number) => {
      clearRefreshTimer();

      // 60s floor protects against tight retry loops on transient errors when
      // the session has already expired (refreshIn would otherwise be 0).
      const TRANSIENT_RETRY_MIN_MS = 60 * 1000;
      const refreshIn = Math.max(expiresAt - Date.now() - 5 * 60 * 1000, TRANSIENT_RETRY_MIN_MS);
      refreshTimerRef.current = setTimeout(async () => {
        const me = await fetchMe();
        if (me.authenticated && me.user) {
          setUser(me.user);
          if (me.expiresAt) scheduleWebRefresh(me.expiresAt);
        } else if (me.permanent) {
          // Permanent failure (401/403): token is invalid — log out
          setUser(null);
        } else {
          // Transient failure (5xx / network): keep session, retry after the floor delay
          scheduleWebRefresh(expiresAt);
        }
      }, refreshIn);
    },
    [clearRefreshTimer],
  );

  // --- Initialize auth state on mount ---
  useEffect(() => {
    if (isElectronRenderer()) {
      isElectron.current = true;

      // Electron: restore session from safeStorage
      const api = window.electronAPI;

      async function restoreElectronSession() {
        try {
          const tokens = await loadTokens();
          if (!tokens) {
            setIsLoading(false);
            return;
          }

          const { accessToken, refreshToken, expiresAt } = tokens;

          if (Date.now() >= expiresAt) {
            if (!api?.auth) {
              setIsLoading(false);
              return;
            }

            try {
              const tokenResponse = await api.auth.refreshToken(refreshToken);
              const newExpiresAt = Date.now() + tokenResponse.expires_in * 1000;
              await saveTokens({
                accessToken: tokenResponse.access_token,
                refreshToken: tokenResponse.refresh_token,
                expiresAt: newExpiresAt,
              });

              const userInfo = await api.auth.getUserInfo(tokenResponse.access_token);
              setUser({
                id: userInfo.sub,
                email: userInfo.email,
                name: userInfo.name,
                image: userInfo.picture,
                plan: userInfo.plan,
              });
              scheduleElectronRefresh(newExpiresAt, tokenResponse.refresh_token);
            } catch (err) {
              // Only clear tokens on permanent failures (401/403); ignore transient errors on startup
              if (isElectronAuthErrorPermanent(err)) {
                await clearTokens();
              }
            }
          } else {
            if (!api?.auth) {
              setIsLoading(false);
              return;
            }

            try {
              const userInfo = await api.auth.getUserInfo(accessToken);
              setUser({
                id: userInfo.sub,
                email: userInfo.email,
                name: userInfo.name,
                image: userInfo.picture,
                plan: userInfo.plan,
              });
              scheduleElectronRefresh(expiresAt, refreshToken);
            } catch {
              try {
                const tokenResponse = await api.auth.refreshToken(refreshToken);
                const newExpiresAt = Date.now() + tokenResponse.expires_in * 1000;
                await saveTokens({
                  accessToken: tokenResponse.access_token,
                  refreshToken: tokenResponse.refresh_token,
                  expiresAt: newExpiresAt,
                });

                const userInfo = await api.auth.getUserInfo(tokenResponse.access_token);
                setUser({
                  id: userInfo.sub,
                  email: userInfo.email,
                  name: userInfo.name,
                  image: userInfo.picture,
                  plan: userInfo.plan,
                });
                scheduleElectronRefresh(newExpiresAt, tokenResponse.refresh_token);
              } catch (err) {
                // Only clear tokens on permanent failures (401/403); ignore transient errors on startup
                if (isElectronAuthErrorPermanent(err)) {
                  await clearTokens();
                }
              }
            }
          }
        } catch {
          // Silently fail
        } finally {
          setIsLoading(false);
        }
      }

      void restoreElectronSession();
    } else {
      isElectron.current = false;

      // Web: check session via httpOnly cookies
      async function restoreWebSession() {
        try {
          const me = await fetchMe();
          if (me.authenticated && me.user) {
            setUser(me.user);
            if (me.expiresAt) scheduleWebRefresh(me.expiresAt);
          }
        } catch {
          // No session
        } finally {
          setIsLoading(false);
        }
      }

      void restoreWebSession();
    }

    return clearRefreshTimer;
  }, [scheduleElectronRefresh, scheduleWebRefresh, clearRefreshTimer]);

  // --- Listen for Electron OAuth callback (Electron only) ---
  useEffect(() => {
    if (!isElectron.current) return;

    const api = window.electronAPI;
    const authApi = api?.auth;
    if (!authApi) return;

    const unsubscribe = authApi.onCallback(async (data) => {
      if (data.error) {
        console.error("[auth] OAuth error:", data.error);
        return;
      }

      if (!data.code || !data.state) return;

      try {
        const tokenResponse = await authApi.exchangeCode({
          code: data.code,
          state: data.state,
        });

        const expiresAt = Date.now() + tokenResponse.expires_in * 1000;
        await saveTokens({
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          expiresAt,
        });

        const userInfo = await authApi.getUserInfo(tokenResponse.access_token);
        setUser({
          id: userInfo.sub,
          email: userInfo.email,
          name: userInfo.name,
          image: userInfo.picture,
          plan: userInfo.plan,
        });

        scheduleElectronRefresh(expiresAt, tokenResponse.refresh_token);
      } catch (err) {
        console.error("[auth] Token exchange failed:", err);
      }
    });

    return unsubscribe;
  }, [scheduleElectronRefresh]);

  // --- Login ---
  const login = useCallback(async () => {
    if (isElectron.current) {
      const api = window.electronAPI;
      if (!api?.auth) return;
      await api.auth.startLogin();
    } else {
      // Dynamic import to avoid bundling web-auth in Electron builds
      const { startWebLogin } = await import("@/lib/auth/web-auth");
      await startWebLogin();
    }
  }, []);

  // --- Logout ---
  const logout = useCallback(async () => {
    clearRefreshTimer();

    if (isElectron.current) {
      const api = window.electronAPI;
      if (!api?.auth) return;
      await api.auth.logout();
      await clearTokens();
    } else {
      await fetch("/api/auth/logout/", { method: "POST", credentials: "same-origin" });
    }

    setUser(null);
  }, [clearRefreshTimer]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: user !== null,
      isLoading,
      user,
      login,
      logout,
    }),
    [user, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
