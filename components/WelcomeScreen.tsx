"use client";

import { FolderPlus, FolderOpen, FileText, Clock, Download } from "lucide-react";
import clsx from "clsx";
import { useEffect, useState } from "react";

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
  recentProjects: RecentProject[];
  isProjectModeSupported: boolean;
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
  recentProjects,
  isProjectModeSupported,
}: WelcomeScreenProps): React.JSX.Element {
  // Client-side only check to avoid hydration mismatch
  // Start with null (don't show modal), then check on mount
  const [showUnsupportedModal, setShowUnsupportedModal] = useState(false);

  useEffect(() => {
    // Check if running in Electron
    const isElectron = typeof window !== "undefined" &&
      "electronAPI" in window &&
      Boolean((window as { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron);

    // Only show modal if browser is unsupported AND not in Electron
    if (!isProjectModeSupported && !isElectron) {
      setShowUnsupportedModal(true);
    }
  }, [isProjectModeSupported]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-lg flex-col items-center gap-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            Illusions
          </h1>
          <p className="mt-2 text-sm text-foreground-secondary">
            日本語小説を書くためのエディタ
          </p>
        </div>

        {/* Action buttons */}
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={onCreateProject}
            disabled={!isProjectModeSupported}
            className={clsx(
              "flex flex-col items-center gap-2 rounded-xl border border-border p-5 transition-colors",
              isProjectModeSupported
                ? "hover:bg-hover hover:border-border-secondary cursor-pointer"
                : "cursor-not-allowed opacity-50"
            )}
          >
            <FolderPlus className="h-6 w-6 text-accent" />
            <span className="text-sm font-medium text-foreground">
              新規プロジェクト
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenProject}
            disabled={!isProjectModeSupported}
            className={clsx(
              "flex flex-col items-center gap-2 rounded-xl border border-border p-5 transition-colors",
              isProjectModeSupported
                ? "hover:bg-hover hover:border-border-secondary cursor-pointer"
                : "cursor-not-allowed opacity-50"
            )}
          >
            <FolderOpen className="h-6 w-6 text-accent" />
            <span className="text-sm font-medium text-foreground">
              プロジェクトを開く
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenStandaloneFile}
            className="flex flex-col items-center gap-2 rounded-xl border border-border p-5 transition-colors hover:bg-hover hover:border-border-secondary cursor-pointer"
          >
            <FileText className="h-6 w-6 text-accent" />
            <span className="text-sm font-medium text-foreground">
              ファイルを開く
            </span>
          </button>
        </div>

        {/* Non-dismissible modal for unsupported browsers (not shown in Electron) */}
        {showUnsupportedModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="mx-4 w-full max-w-md rounded-xl bg-background-elevated p-8 shadow-xl border border-border text-center">
              <h2 className="text-xl font-bold text-foreground">
                現在お使いのブラウザでは、Illusions のWeb版はご利用いただけません。
              </h2>
              <p className="mt-3 text-sm text-foreground-secondary">
                すべての機能を利用するには、デスクトップ版をお試しください。
              </p>
              <a
                href="https://download.illusions.app"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-base font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
              >
                <Download className="h-5 w-5" />
                デスクトップ版をダウンロード
              </a>
            </div>
          </div>
        )}

        {/* Recent projects */}
        {recentProjects.length > 0 && (
          <div className="w-full">
            <h2 className="mb-3 text-sm font-medium text-foreground-secondary">
              最近のプロジェクト
            </h2>
            <ul className="flex flex-col gap-1">
              {recentProjects.map((project) => (
                <li key={project.projectId}>
                  <button
                    type="button"
                    onClick={() => onOpenRecentProject(project.projectId)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-hover"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-foreground-tertiary" />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">
                        {project.name}
                      </span>
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
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
