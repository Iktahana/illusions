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
}

async function fetchMe(): Promise<MeResponse> {
  try {
    const res = await fetch("/api/auth/me/", {
      method: "POST",
      credentials: "same-origin",
    });
    if (!res.ok) return { authenticated: false };
    return (await res.json()) as MeResponse;
  } catch {
    return { authenticated: false };
  }
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

  // --- Electron refresh scheduler (unchanged from original) ---
  const scheduleElectronRefresh = useCallback(
    (expiresAt: number, refreshToken: string) => {
      clearRefreshTimer();

      const refreshIn = Math.max(expiresAt - Date.now() - 5 * 60 * 1000, 0);
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
        } catch {
          setUser(null);
          await clearTokens();
        }
      }, refreshIn);
    },
    [clearRefreshTimer],
  );

  // --- Web refresh scheduler ---
  const scheduleWebRefresh = useCallback(
    (expiresAt: number) => {
      clearRefreshTimer();

      const refreshIn = Math.max(expiresAt - Date.now() - 5 * 60 * 1000, 0);
      refreshTimerRef.current = setTimeout(async () => {
        const me = await fetchMe();
        if (me.authenticated && me.user) {
          setUser(me.user);
          if (me.expiresAt) scheduleWebRefresh(me.expiresAt);
        } else {
          setUser(null);
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
            } catch {
              await clearTokens();
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
              } catch {
                await clearTokens();
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
