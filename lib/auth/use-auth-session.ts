"use client";

/**
 * Auth session controller hook.
 *
 * Orchestrates startup restore, refresh scheduling, the Electron OAuth
 * callback, and the login/logout entry points on top of the platform
 * adapters (`electron-session.ts` for Electron, `web-session.ts` for Web).
 * `AuthProvider` is a thin wrapper around this hook.
 *
 * Lifecycle guarantees (#1567):
 * - The refresh timer is ALWAYS cleaned up on unmount and on logout.
 * - The async startup restore and refresh tasks are cancel-guarded: when they
 *   resolve after unmount they neither set state nor schedule a new timer
 *   (the per-mount scheduler is disposed in the effect cleanup).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { isElectronRenderer } from "@/lib/utils/runtime-env";
import {
  completeElectronOAuthCallback,
  getElectronAuthApi,
  refreshElectronSession,
  restoreElectronSession,
} from "./electron-session";
import { isElectronAuthErrorPermanent, resetRefreshState } from "./refresh-single-flight";
import { createRefreshScheduler } from "./refresh-scheduler";
import { clearTokens } from "./token-storage";
import { fetchMe, webLogout } from "./web-session";
import type { AuthUser } from "./auth-user";
import type { RefreshScheduler } from "./refresh-scheduler";

export interface AuthSessionState {
  user: AuthUser | null;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

export function useAuthSession(): AuthSessionState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  /** Per-mount scheduler; null before mount and after unmount (disposed). */
  const schedulerRef = useRef<RefreshScheduler | null>(null);
  const isElectron = useRef(false);

  // --- Electron refresh cycle ---
  const scheduleElectronRefresh = useCallback((expiresAt: number, refreshToken: string): void => {
    schedulerRef.current?.schedule(expiresAt, async () => {
      const authApi = getElectronAuthApi();
      if (!authApi) return;

      try {
        const session = await refreshElectronSession(authApi, refreshToken);
        if (!schedulerRef.current) return; // unmounted while refreshing
        setUser(session.user);
        scheduleElectronRefresh(session.expiresAt, session.refreshToken);
      } catch (err) {
        if (isElectronAuthErrorPermanent(err)) {
          // Permanent failure (4xx / invalid_grant): token is invalid — log out
          if (schedulerRef.current) setUser(null);
          await clearTokens();
        } else {
          // Transient failure (5xx / network): keep session, retry after the floor delay
          scheduleElectronRefresh(expiresAt, refreshToken);
        }
      }
    });
  }, []);

  // --- Web refresh cycle ---
  const scheduleWebRefresh = useCallback((expiresAt: number): void => {
    schedulerRef.current?.schedule(expiresAt, async () => {
      const me = await fetchMe();
      if (!schedulerRef.current) return; // unmounted while probing
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
    });
  }, []);

  // --- Initialize auth state on mount ---
  useEffect(() => {
    const scheduler = createRefreshScheduler();
    schedulerRef.current = scheduler;
    let cancelled = false;

    const electron = isElectronRenderer();
    isElectron.current = electron;

    async function restore(): Promise<void> {
      try {
        if (electron) {
          // Electron: restore session from safeStorage-backed token storage
          const session = await restoreElectronSession();
          if (cancelled) return;
          if (session) {
            setUser(session.user);
            scheduleElectronRefresh(session.expiresAt, session.refreshToken);
          }
        } else {
          // Web: check session via httpOnly cookies
          const me = await fetchMe();
          if (cancelled) return;
          if (me.authenticated && me.user) {
            setUser(me.user);
            if (me.expiresAt) scheduleWebRefresh(me.expiresAt);
          }
        }
      } catch {
        // Silently fail — startup restore must never crash the provider
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void restore();

    return () => {
      cancelled = true;
      // Guaranteed cleanup (#1567): cancel any pending refresh timer and make
      // late schedule() calls from in-flight async work a no-op.
      scheduler.dispose();
      if (schedulerRef.current === scheduler) {
        schedulerRef.current = null;
      }
    };
  }, [scheduleElectronRefresh, scheduleWebRefresh]);

  // --- Listen for Electron OAuth callback (Electron only) ---
  useEffect(() => {
    if (!isElectron.current) return;

    const authApi = getElectronAuthApi();
    if (!authApi) return;

    const unsubscribe = authApi.onCallback(async (data) => {
      if (data.error) {
        console.error("[auth] OAuth error:", data.error);
        return;
      }

      if (!data.code || !data.state) return;

      try {
        const session = await completeElectronOAuthCallback(authApi, {
          code: data.code,
          state: data.state,
        });
        if (!schedulerRef.current) return; // unmounted during the exchange
        setUser(session.user);
        scheduleElectronRefresh(session.expiresAt, session.refreshToken);
      } catch (err) {
        console.error("[auth] Token exchange failed:", err);
      }
    });

    return unsubscribe;
  }, [scheduleElectronRefresh]);

  // --- Login ---
  const login = useCallback(async (): Promise<void> => {
    if (isElectron.current) {
      const authApi = getElectronAuthApi();
      if (!authApi) return;
      await authApi.startLogin();
    } else {
      // Dynamic import to avoid bundling web-auth in Electron builds
      const { startWebLogin } = await import("./web-auth");
      await startWebLogin();
    }
  }, []);

  // --- Logout ---
  const logout = useCallback(async (): Promise<void> => {
    // Guaranteed cleanup on logout (#1567): cancel the pending refresh timer.
    schedulerRef.current?.clear();
    // Reset single-flight/permanent-failure state so a subsequent login starts clean.
    resetRefreshState();

    if (isElectron.current) {
      const authApi = getElectronAuthApi();
      if (!authApi) return;
      await authApi.logout();
      await clearTokens();
    } else {
      await webLogout();
    }

    setUser(null);
  }, []);

  return { user, isLoading, login, logout };
}
