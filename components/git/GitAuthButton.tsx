/**
 * Git Authentication Button Component
 * 
 * Displays login/logout button and user profile information.
 * Integrates with GitHub OAuth flow.
 */

"use client";

import { useState } from "react";
import { LogOut, Github } from "lucide-react";
import { GitHubUser } from "@/lib/git/git-storage-types";

export interface GitAuthButtonProps {
  isAuthenticated: boolean;
  user: GitHubUser | undefined;
  onLogin: () => Promise<void>;
  onLogout: () => Promise<void>;
  isLoading?: boolean;
}

export function GitAuthButton({
  isAuthenticated,
  user,
  onLogin,
  onLogout,
  isLoading = false,
}: GitAuthButtonProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogin = async () => {
    try {
      await onLogin();
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await onLogout();
      setShowUserMenu(false);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  if (!isAuthenticated) {
    return (
      <button
        onClick={handleLogin}
        disabled={isLoading}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm font-medium transition-colors"
        title="ログイン"
      >
        <Github className="w-4 h-4" />
        <span>ログイン</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowUserMenu(!showUserMenu)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        title={user?.name || "User"}
      >
        {user?.avatar_url && (
          <img
            src={user.avatar_url}
            alt={user.name || user.login}
            className="w-5 h-5 rounded-full"
          />
        )}
        <span className="text-sm text-gray-700 dark:text-gray-300">
          {user?.name || user?.login || "User"}
        </span>
      </button>

      {showUserMenu && (
        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
          {user && (
            <>
              <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {user.name || user.login}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  @{user.login}
                </p>
              </div>
            </>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>ログアウト</span>
          </button>
        </div>
      )}
    </div>
  );
}
