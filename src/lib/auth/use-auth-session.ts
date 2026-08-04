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
 * - Logout is a HARD session boundary (session-epoch.ts): in-flight restore /
 *   refresh / OAuth work started before logout discards its result — no
 *   setUser, no re-persisted tokens, no rescheduled timer.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { isElectronDevelopment, isElectronRenderer } from "@/lib/utils/runtime-env";
import { classifyTelemetryError, trackUsageEvent } from "@/lib/analytics/usage-events";
import {
  completeElectronOAuthCallback,
  getElectronAuthApi,
  refreshElectronSession,
  restoreElectronSession,
} from "./electron-session";
import { isElectronAuthErrorPermanent, resetRefreshState } from "./refresh-single-flight";
import { createRefreshScheduler } from "./refresh-scheduler";
import {
  getSessionEpoch,
  invalidateSessionEpoch,
  isSessionInvalidatedError,
} from "./session-epoch";
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

      const epochAtStart = getSessionEpoch();
      try {
        const session = await refreshElectronSession(authApi, refreshToken, epochAtStart);
        // Unmounted or logged out while refreshing — discard the result.
        if (!schedulerRef.current || getSessionEpoch() !== epochAtStart) return;
        setUser(session.user);
        trackUsageEvent("auth_refresh_completed", { surface: "startup" });
        scheduleElectronRefresh(session.expiresAt, session.refreshToken);
      } catch (err) {
        // Logout fenced this refresh — tokens already handled, never retry.
        if (isSessionInvalidatedError(err) || getSessionEpoch() !== epochAtStart) return;
        trackUsageEvent("auth_refresh_failed", {
          surface: "startup",
          reason: classifyTelemetryError(err),
        });
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
      const epochAtStart = getSessionEpoch();
      const me = await fetchMe();
      // Unmounted or logged out while probing — discard the result.
      if (!schedulerRef.current || getSessionEpoch() !== epochAtStart) return;
      if (me.authenticated && me.user) {
        setUser(me.user);
        trackUsageEvent("auth_refresh_completed", { surface: "startup" });
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
      const epochAtStart = getSessionEpoch();
      try {
        if (electron) {
          // The unsigned development host can block Electron's main thread in
          // macOS Keychain while safeStorage decrypts a persisted production
          // token. Skip only the automatic dev restore; explicit login still
          // works, and packaged beta/stable builds keep persistent sessions.
          const session = isElectronDevelopment()
            ? null
            : await restoreElectronSession(epochAtStart);
          if (cancelled || getSessionEpoch() !== epochAtStart) return;
          if (session) {
            setUser(session.user);
            trackUsageEvent("auth_session_restored", {
              surface: "startup",
              strategy: "electron_tokens",
            });
            scheduleElectronRefresh(session.expiresAt, session.refreshToken);
          }
        } else {
          // Web: check session via httpOnly cookies
          const me = await fetchMe();
          if (cancelled || getSessionEpoch() !== epochAtStart) return;
          if (me.authenticated && me.user) {
            setUser(me.user);
            trackUsageEvent("auth_session_restored", {
              surface: "startup",
              strategy: "web_cookie",
            });
            if (me.expiresAt) scheduleWebRefresh(me.expiresAt);
          }
        }
      } catch (err) {
        // Silently fail — startup restore must never crash the provider
        if (!cancelled) {
          trackUsageEvent("auth_session_restore_failed", {
            surface: "startup",
            reason: classifyTelemetryError(err),
          });
        }
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
        trackUsageEvent("auth_login_failed", {
          surface: "callback",
          stage: "callback",
          reason: "unknown",
        });
        return;
      }

      if (!data.code || !data.state) return;

      const epochAtStart = getSessionEpoch();
      try {
        const session = await completeElectronOAuthCallback(
          authApi,
          { code: data.code, state: data.state },
          epochAtStart,
        );
        // Unmounted or logged out during the exchange — discard the result.
        if (!schedulerRef.current || getSessionEpoch() !== epochAtStart) return;
        setUser(session.user);
        trackUsageEvent("auth_login_completed", { surface: "callback" });
        scheduleElectronRefresh(session.expiresAt, session.refreshToken);
      } catch (err) {
        if (isSessionInvalidatedError(err)) return;
        console.error("[auth] Token exchange failed:", err);
        trackUsageEvent("auth_login_failed", {
          surface: "callback",
          stage: "exchange",
          reason: classifyTelemetryError(err),
        });
      }
    });

    return unsubscribe;
  }, [scheduleElectronRefresh]);

  // --- Login ---
  const login = useCallback(async (): Promise<void> => {
    trackUsageEvent("auth_login_started", { surface: "settings" });
    if (isElectron.current) {
      const authApi = getElectronAuthApi();
      if (!authApi) return;
      try {
        await authApi.startLogin();
      } catch (err) {
        trackUsageEvent("auth_login_failed", {
          surface: "settings",
          stage: "start",
          reason: classifyTelemetryError(err),
        });
        throw err;
      }
    } else {
      // Dynamic import to avoid bundling web-auth in Electron builds
      const { startWebLogin } = await import("./web-auth");
      try {
        await startWebLogin();
      } catch (err) {
        trackUsageEvent("auth_login_failed", {
          surface: "settings",
          stage: "start",
          reason: classifyTelemetryError(err),
        });
        throw err;
      }
    }
  }, []);

  // --- Logout ---
  const logout = useCallback(async (): Promise<void> => {
    // Hard session boundary: invalidate ALL in-flight auth work (restore /
    // refresh / OAuth) so late completions cannot setUser, re-persist rotated
    // tokens, or reschedule a refresh after this point (Codex review, #1437).
    invalidateSessionEpoch();
    // Guaranteed cleanup on logout (#1567): cancel the pending refresh timer.
    schedulerRef.current?.clear();
    // Reset single-flight/permanent-failure state so a subsequent login starts clean.
    resetRefreshState();

    try {
      if (isElectron.current) {
        const authApi = getElectronAuthApi();
        if (!authApi) return;
        await authApi.logout();
        await clearTokens();
      } else {
        await webLogout();
      }
    } catch (err) {
      trackUsageEvent("auth_logout_failed", {
        surface: "settings",
        reason: classifyTelemetryError(err),
      });
      throw err;
    }

    setUser(null);
    trackUsageEvent("auth_logout_completed", { surface: "settings" });
  }, []);

  return { user, isLoading, login, logout };
}
