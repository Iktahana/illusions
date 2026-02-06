/**
 * GitHubUserMenu Component
 * 
 * Displays GitHub user avatar at the bottom of ActivityBar with a dropdown menu.
 */

"use client";

import { useGitHubAuth } from "@/lib/hooks/use-github-auth";
import { Github, LogOut, ExternalLink, LogIn } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import clsx from "clsx";

export default function GitHubUserMenu() {
  const { isAuthenticated, user, isLoading, login, logout } = useGitHubAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
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

  const handleAvatarClick = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleLogout = async () => {
    await logout();
    setIsMenuOpen(false);
  };

  const handleLogin = async () => {
    await login();
    setIsMenuOpen(false);
  };

  const handleOpenGitHub = () => {
    if (user?.html_url) {
      window.open(user.html_url, "_blank", "noopener,noreferrer");
    }
    setIsMenuOpen(false);
  };

  if (isLoading) {
    return (
      <div className="w-10 h-10 rounded-full bg-background-secondary animate-pulse" />
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      {/* User Avatar or Login Button */}
      <button
        onClick={handleAvatarClick}
        className={clsx(
          "w-10 h-10 rounded-full transition-all border-2",
          isMenuOpen
            ? "border-accent scale-110"
            : "border-transparent hover:border-border hover:scale-105"
        )}
        title={isAuthenticated && user ? user.name : "GitHub login"}
      >
        {isAuthenticated && user ? (
          <img
            src={user.avatar_url}
            alt={user.name}
            className="w-full h-full rounded-full object-cover"
          />
        ) : (
          <div className="w-full h-full rounded-full bg-background-secondary flex items-center justify-center">
            <Github className="w-5 h-5 text-foreground-tertiary" />
          </div>
        )}
      </button>

      {/* Dropdown Menu */}
      {isMenuOpen && (
        <div className="absolute bottom-full left-full ml-2 mb-0 bg-background-elevated border border-border rounded-lg shadow-lg overflow-hidden z-50 min-w-[240px]">
          {isAuthenticated && user ? (
            <>
              {/* User Info */}
              <div className="px-4 py-3 border-b border-border">
                <div className="flex items-center gap-3">
                  <img
                    src={user.avatar_url}
                    alt={user.name}
                    className="w-10 h-10 rounded-full"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground truncate text-sm">
                      {user.name}
                    </div>
                    <div className="text-xs text-foreground-secondary truncate">
                      @{user.login}
                    </div>
                  </div>
                </div>
                {user.email && (
                  <div className="text-xs text-foreground-tertiary truncate mt-2">
                    {user.email}
                  </div>
                )}
              </div>

              {/* Menu Items */}
              <div className="py-1">
                <button
                  onClick={handleOpenGitHub}
                  className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-hover transition-colors flex items-center gap-2"
                >
                  <ExternalLink size={16} className="text-foreground-secondary" />
                  Open GitHub Profile
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-hover transition-colors flex items-center gap-2"
                >
                  <LogOut size={16} className="text-foreground-secondary" />
                  ログアウト
                </button>
              </div>
            </>
          ) : (
            /* Login Option */
            <div className="py-1">
              <button
                onClick={handleLogin}
                className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-hover transition-colors flex items-center gap-2"
              >
                <LogIn size={16} className="text-foreground-secondary" />
                GitHub にログイン
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
