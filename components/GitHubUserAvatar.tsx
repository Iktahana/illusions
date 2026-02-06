/**
 * GitHubUserAvatar Component
 * 
 * Displays GitHub user avatar or GitHub icon at the bottom of ActivityBar.
 * Shows a dropdown menu with login/logout options.
 */

"use client";

import { useGitHubAuth } from "@/lib/hooks/use-github-auth";
import { Github, LogOut, ExternalLink, Loader2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import clsx from "clsx";

export default function GitHubUserAvatar() {
  const { isAuthenticated, user, isLoading, login, logout } = useGitHubAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        buttonRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  const handleToggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleLogin = async () => {
    setIsMenuOpen(false);
    await login();
  };

  const handleLogout = async () => {
    setIsMenuOpen(false);
    await logout();
  };

  const handleOpenGitHub = () => {
    if (user?.html_url) {
      window.open(user.html_url, "_blank");
    }
    setIsMenuOpen(false);
  };

  const handleSignup = () => {
    window.open("https://github.com/signup", "_blank");
    setIsMenuOpen(false);
  };

  if (isLoading) {
    return (
      <div className="w-10 h-10 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-foreground-tertiary" />
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleToggleMenu}
        className={clsx(
          "w-10 h-10 flex items-center justify-center rounded-md transition-all relative group",
          isMenuOpen
            ? "bg-accent text-accent-foreground"
            : "text-foreground-tertiary hover:text-foreground hover:bg-hover"
        )}
        title={isAuthenticated ? user?.name : "GitHub"}
      >
        {isAuthenticated && user?.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user.name}
            className="w-7 h-7 rounded-full"
          />
        ) : (
          <Github className="w-5 h-5" />
        )}

        {/* Tooltip */}
        <span className="absolute left-full ml-2 px-2 py-1 bg-background-elevated border border-border text-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
          {isAuthenticated ? user?.name : "GitHub"}
        </span>
      </button>

      {/* Dropdown menu */}
      {isMenuOpen && (
        <div
          ref={menuRef}
          className="absolute bottom-full left-12 mb-1 w-56 bg-background-elevated border border-border rounded-lg shadow-lg overflow-hidden z-50"
        >
          {isAuthenticated && user ? (
            // Logged in menu
            <div className="py-1">
              <div className="px-3 py-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <img
                    src={user.avatar_url}
                    alt={user.name}
                    className="w-8 h-8 rounded-full"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground text-sm truncate">
                      {user.name}
                    </div>
                    <div className="text-xs text-foreground-secondary truncate">
                      @{user.login}
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleOpenGitHub}
                className="w-full px-3 py-2 flex items-center gap-2 text-sm text-foreground hover:bg-hover transition-colors text-left"
              >
                <ExternalLink size={16} />
                自分のGitHubを開く
              </button>

              <button
                onClick={handleLogout}
                className="w-full px-3 py-2 flex items-center gap-2 text-sm text-foreground hover:bg-hover transition-colors text-left"
              >
                <LogOut size={16} />
                ログアウト
              </button>
            </div>
          ) : (
            // Not logged in menu
            <div className="py-1">
              <button
                onClick={handleLogin}
                className="w-full px-3 py-2 flex items-center gap-2 text-sm text-foreground hover:bg-hover transition-colors text-left"
              >
                <Github size={16} />
                GitHubにログイン
              </button>

              <button
                onClick={handleSignup}
                className="w-full px-3 py-2 flex items-center gap-2 text-sm text-foreground hover:bg-hover transition-colors text-left"
              >
                <ExternalLink size={16} />
                GitHubアカウント登録
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
