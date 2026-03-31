"use client";

import {
  FolderPlus,
  FolderOpen,
  FileText,
  Clock,
  X,
  UserCircle,
  User,
  Settings,
  LogOut,
} from "lucide-react";
import clsx from "clsx";
import { useEffect, useState, useRef } from "react";
import DesktopAppDownloadButton from "@/components/DesktopAppDownloadButton";
import GlassDialog from "@/components/GlassDialog";
import { useAuth } from "@/contexts/AuthContext";

interface RecentProject {
  projectId: string;
  name: string;
  lastAccessedAt: number;
  rootDirName?: string;
}

interface WelcomeScreenProps {
  onCreateProject: () => void;
  onOpenProject: () => void;
  onOpenStandaloneFile: () => void;
  onOpenRecentProject: (projectId: string) => void;
  onDeleteRecentProject?: (projectId: string) => void;
  recentProjects: RecentProject[];
  isProjectModeSupported: boolean;
  /** Error message from auto-restore failure */
  restoreError?: string | null;
  /** Dismiss the restore error banner */
  onDismissRestoreError?: () => void;
  onOpenAccountSettings?: () => void;
}

/**
 * Format a timestamp as a Japanese relative time string.
 * タイムスタンプを日本語の相対時間文字列にフォーマットする。
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSeconds < 60) {
    return "たった今";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}分前`;
  }
  if (diffHours < 24) {
    return `${diffHours}時間前`;
  }
  if (diffDays === 1) {
    return "昨日";
  }
  if (diffDays < 7) {
    return `${diffDays}日前`;
  }
  if (diffWeeks < 5) {
    return `${diffWeeks}週間前`;
  }
  if (diffMonths < 12) {
    return `${diffMonths}ヶ月前`;
  }
  return `${Math.floor(diffMonths / 12)}年前`;
}

/**
 * WelcomeScreen - the main landing screen shown when no file or project is open.
 * ファイルやプロジェクトが開かれていないときに表示されるウェルカム画面。
 */
export default function WelcomeScreen({
  onCreateProject,
  onOpenProject,
  onOpenStandaloneFile,
  onOpenRecentProject,
  onDeleteRecentProject,
  recentProjects,
  isProjectModeSupported,
  restoreError,
  onDismissRestoreError,
  onOpenAccountSettings,
}: WelcomeScreenProps): React.JSX.Element {
  const { isAuthenticated, user, login, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  // Client-side only check to avoid hydration mismatch
  // Start with null (don't show modal), then check on mount
  const [showUnsupportedModal, setShowUnsupportedModal] = useState(false);

  // Close user menu on outside click
  useEffect(() => {
    if (!showUserMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showUserMenu]);

  useEffect(() => {
    // Check if running in Electron
    const isElectron =
      typeof window !== "undefined" &&
      "electronAPI" in window &&
      Boolean((window as { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron);

    // Only show modal if browser is unsupported AND not in Electron
    if (!isProjectModeSupported && !isElectron) {
      setShowUnsupportedModal(true);
    } else {
      setShowUnsupportedModal(false);
    }
  }, [isProjectModeSupported]);

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-background p-4">
      {/* User avatar (bottom-left) */}
      <div ref={userMenuRef} className="absolute bottom-4 left-4 z-10">
        <button
          type="button"
          onClick={() => setShowUserMenu((prev) => !prev)}
          className="flex items-center justify-center rounded-full transition-colors hover:ring-2 hover:ring-border"
          title={isAuthenticated && user ? user.name : "アカウント"}
        >
          {isAuthenticated && user?.image ? (
            <img src={user.image} alt={user.name} className="h-8 w-8 rounded-full object-cover" />
          ) : isAuthenticated && user ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
              {user.name.charAt(0).toUpperCase()}
            </span>
          ) : (
            <UserCircle className="h-8 w-8 text-foreground-tertiary hover:text-foreground transition-colors" />
          )}
        </button>

        {showUserMenu && (
          <div className="absolute bottom-full left-0 mb-2 z-50 w-48 rounded-lg border border-border bg-background-elevated shadow-lg py-1">
            {isAuthenticated && user ? (
              <>
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                  <p className="text-xs text-foreground-tertiary truncate">{user.email}</p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowUserMenu(false);
                    window.open("https://my.illusions.app", "_blank");
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-hover transition-colors"
                >
                  <User className="w-4 h-4" />
                  マイページ
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowUserMenu(false);
                    onOpenAccountSettings?.();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-hover transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  設定
                </button>

                <div className="border-t border-border my-1" />

                <button
                  type="button"
                  onClick={() => {
                    setShowUserMenu(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-hover transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  ログアウト
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setShowUserMenu(false);
                  login();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-hover transition-colors"
              >
                <UserCircle className="w-4 h-4" />
                ログイン
              </button>
            )}
          </div>
        )}
      </div>

      {/* Ambient gradient glow — decorative, non-interactive */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/3 h-[480px] w-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.06] blur-3xl"
      />

      <div className="relative flex w-full max-w-lg flex-col items-center gap-8 animate-fade-in">
        {/* Restore error banner */}
        {restoreError && (
          <div className="w-full rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-red-400">{restoreError}</p>
            {onDismissRestoreError && (
              <button
                type="button"
                onClick={onDismissRestoreError}
                className="shrink-0 rounded p-1 text-red-400 hover:bg-red-500/20 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* Header */}
        <div className="text-center">
          {/* Logo SVG with dark mode inversion */}
          <div className="mb-4 flex justify-center">
            <img
              src="./logo/illusions.min.svg"
              alt="illusions"
              className="h-16 w-auto dark:invert drop-shadow-sm"
            />
          </div>
          <p className="mt-2 text-sm text-foreground-secondary">日本語小説を書くためのエディタ</p>
        </div>

        {/* Action buttons */}
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={onCreateProject}
            disabled={!isProjectModeSupported}
            className={clsx(
              "flex flex-col items-center gap-2 rounded-xl border border-border p-5 transition-all duration-200",
              isProjectModeSupported
                ? "hover:bg-hover hover:border-border-secondary hover:shadow-md hover:scale-[1.02] active:scale-[0.99] cursor-pointer"
                : "cursor-not-allowed opacity-50",
            )}
          >
            <FolderPlus className="h-6 w-6 text-accent" />
            <span className="text-sm font-medium text-foreground">新規プロジェクト</span>
          </button>

          <button
            type="button"
            onClick={onOpenProject}
            disabled={!isProjectModeSupported}
            className={clsx(
              "flex flex-col items-center gap-2 rounded-xl border border-border p-5 transition-all duration-200",
              isProjectModeSupported
                ? "hover:bg-hover hover:border-border-secondary hover:shadow-md hover:scale-[1.02] active:scale-[0.99] cursor-pointer"
                : "cursor-not-allowed opacity-50",
            )}
          >
            <FolderOpen className="h-6 w-6 text-accent" />
            <span className="text-sm font-medium text-foreground">プロジェクトを開く</span>
          </button>

          <button
            type="button"
            onClick={onOpenStandaloneFile}
            className="flex flex-col items-center gap-2 rounded-xl border border-border p-5 transition-all duration-200 hover:bg-hover hover:border-border-secondary hover:shadow-md hover:scale-[1.02] active:scale-[0.99] cursor-pointer"
          >
            <FileText className="h-6 w-6 text-accent" />
            <span className="text-sm font-medium text-foreground">ファイルを開く</span>
          </button>
        </div>

        {/* Non-dismissible modal for unsupported browsers (not shown in Electron) */}
        <GlassDialog
          isOpen={showUnsupportedModal}
          panelClassName="mx-4 w-full max-w-md p-8 text-center"
        >
          <h2 className="text-xl font-bold text-foreground">
            現在お使いのブラウザでは、illusions のWeb版はご利用いただけません。
          </h2>
          <p className="mt-3 text-sm text-foreground-secondary">
            すべての機能を利用するには、デスクトップ版をお試しください。
          </p>
          <DesktopAppDownloadButton className="mt-6 px-6 py-3 text-base" />
        </GlassDialog>

        {/* Recent projects */}
        {recentProjects.length > 0 && (
          <div className="w-full">
            <h2 className="mb-3 text-sm font-medium text-foreground-secondary">
              最近のプロジェクト
            </h2>
            <ul className="flex flex-col gap-1">
              {recentProjects.map((project) => (
                <li
                  key={project.projectId}
                  className="group flex items-center rounded-lg hover:bg-hover"
                >
                  <button
                    type="button"
                    onClick={() => onOpenRecentProject(project.projectId)}
                    className="flex flex-1 min-w-0 items-center gap-3 px-3 py-2 text-left transition-colors"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-foreground-tertiary" />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">{project.name}</span>
                      {project.rootDirName && (
                        <span className="block truncate text-xs text-foreground-muted">
                          ~/{project.rootDirName}
                        </span>
                      )}
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-foreground-muted">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(project.lastAccessedAt)}
                    </span>
                  </button>
                  {onDeleteRecentProject && (
                    <button
                      type="button"
                      onClick={() => onDeleteRecentProject(project.projectId)}
                      className="mr-2 shrink-0 rounded p-1 text-foreground-muted opacity-0 transition-opacity hover:bg-hover hover:text-foreground group-hover:opacity-100"
                      title="一覧から削除"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
