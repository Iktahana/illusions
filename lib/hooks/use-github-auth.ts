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
      setError(err instanceof Error ? err.message : "認証の確認に失敗しました");
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
      setError(err instanceof Error ? err.message : "ログインに失敗しました");
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
      setError(err instanceof Error ? err.message : "ログアウトに失敗しました");
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
