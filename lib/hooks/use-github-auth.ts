/**
 * useGitHubAuth Hook
 * 
 * React hook for managing GitHub authentication state.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { getGitHubAuthService } from "../github/auth";
import type { GitHubUser, DeviceCodeResponse } from "../github/types";

interface UseGitHubAuthReturn {
  // Authentication state
  isAuthenticated: boolean;
  user: GitHubUser | null;
  isLoading: boolean;
  error: string | null;
  
  // Device flow state
  deviceCode: DeviceCodeResponse | null;
  isAuthenticating: boolean;
  
  // Actions
  login: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

/**
 * Translate common English error messages to Japanese for user-facing display.
 */
function translateErrorMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("network error")) {
    return "ネットワーク接続に失敗しました。インターネット接続を確認してください。";
  }
  if (lower.includes("unauthorized") || lower.includes("401")) {
    return "認証が無効です。再度ログインしてください。";
  }
  if (lower.includes("forbidden") || lower.includes("403")) {
    return "アクセスが拒否されました。権限を確認してください。";
  }
  if (lower.includes("not found") || lower.includes("404")) {
    return "リソースが見つかりませんでした。";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "接続がタイムアウトしました。しばらくしてから再度お試しください。";
  }
  if (lower.includes("rate limit") || lower.includes("429")) {
    return "リクエスト回数の上限に達しました。しばらくしてから再度お試しください。";
  }
  if (lower.includes("server error") || lower.includes("500") || lower.includes("internal server")) {
    return "サーバーエラーが発生しました。しばらくしてから再度お試しください。";
  }
  return message;
}

export function useGitHubAuth(): UseGitHubAuthReturn {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deviceCode, setDeviceCode] = useState<DeviceCodeResponse | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const authService = getGitHubAuthService();

  // Check existing authentication on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    setIsLoading(true);
    try {
      const currentUser = await authService.getCurrentUser();
      if (currentUser) {
        setIsAuthenticated(true);
        setUser(currentUser);
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
    } catch (err) {
      console.error("Failed to check authentication:", err);
      setError(err instanceof Error ? translateErrorMessage(err.message) : "認証の確認に失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  const login = useCallback(async () => {
    setError(null);
    setIsAuthenticating(true);
    setDeviceCode(null);

    try {
      const authenticatedUser = await authService.login((response: DeviceCodeResponse) => {
        // Show device code to user
        setDeviceCode(response);
      });

      setIsAuthenticated(true);
      setUser(authenticatedUser);
      setDeviceCode(null);
    } catch (err) {
      console.error("Login failed:", err);
      setError(err instanceof Error ? translateErrorMessage(err.message) : "ログインに失敗しました");
      setDeviceCode(null);
    } finally {
      setIsAuthenticating(false);
    }
  }, [authService]);

  const logout = useCallback(async () => {
    setError(null);
    try {
      await authService.logout();
      setIsAuthenticated(false);
      setUser(null);
    } catch (err) {
      console.error("Logout failed:", err);
      setError(err instanceof Error ? translateErrorMessage(err.message) : "ログアウトに失敗しました");
    }
  }, [authService]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isAuthenticated,
    user,
    isLoading,
    error,
    deviceCode,
    isAuthenticating,
    login,
    logout,
    clearError,
  };
}
