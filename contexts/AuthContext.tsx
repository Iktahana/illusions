"use client";

/**
 * Thin auth provider.
 *
 * All session logic lives in `lib/auth/`:
 * - `use-auth-session.ts` — session state controller (restore / refresh / login / logout)
 * - `electron-session.ts` — Electron adapter (safeStorage tokens + auth IPC)
 * - `web-session.ts` — Web adapter (httpOnly cookies via API routes)
 * - `refresh-scheduler.ts` — refresh timer with guaranteed cleanup
 */

import React, { createContext, useContext, useMemo } from "react";
import { useAuthSession } from "@/lib/auth/use-auth-session";
import type { AuthUser } from "@/lib/auth/auth-user";

export type { AuthUser } from "@/lib/auth/auth-user";

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading, login, logout } = useAuthSession();

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
