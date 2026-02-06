/**
 * GitHubAuthPanel Component
 * 
 * UI for GitHub authentication (login/logout) with Device Flow.
 */

"use client";

import { useGitHubAuth } from "@/lib/hooks/use-github-auth";
import { Github, LogOut, Copy, ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";

export default function GitHubAuthPanel() {
  const {
    isAuthenticated,
    user,
    isLoading,
    error,
    deviceCode,
    isAuthenticating,
    login,
    logout,
    clearError,
  } = useGitHubAuth();

  const [copySuccess, setCopySuccess] = useState(false);

  const handleCopyCode = async () => {
    if (deviceCode) {
      try {
        await navigator.clipboard.writeText(deviceCode.user_code);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch (err) {
        console.error("Failed to copy code:", err);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-foreground-secondary" />
        <span className="ml-2 text-sm text-foreground-secondary">読み込み中...</span>
      </div>
    );
  }

  // Authenticated state
  if (isAuthenticated && user) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-start gap-3">
          <img
            src={user.avatar_url}
            alt={user.name}
            className="w-12 h-12 rounded-full"
          />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-foreground truncate">
              {user.name}
            </div>
            <div className="text-sm text-foreground-secondary truncate">
              @{user.login}
            </div>
            {user.email && (
              <div className="text-xs text-foreground-tertiary truncate mt-1">
                {user.email}
              </div>
            )}
          </div>
        </div>

        <div className="pt-3 border-t border-border">
          <button
            onClick={logout}
            className="flex items-center gap-2 text-sm text-foreground-secondary hover:text-foreground transition-colors"
          >
            <LogOut size={16} />
            ログアウト
          </button>
        </div>
      </div>
    );
  }

  // Device code flow in progress
  if (isAuthenticating && deviceCode) {
    return (
      <div className="p-4 space-y-4">
        <div className="text-sm text-foreground-secondary">
          ブラウザで以下のコードを入力してください:
        </div>

        <div className="bg-background-secondary rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-mono text-2xl font-bold text-foreground tracking-wider">
              {deviceCode.user_code}
            </div>
            <button
              onClick={handleCopyCode}
              className="p-2 hover:bg-hover rounded-md transition-colors"
              title="コードをコピー"
            >
              {copySuccess ? (
                <span className="text-xs text-green-600 dark:text-green-400">
                  ✓ コピー済み
                </span>
              ) : (
                <Copy size={16} className="text-foreground-secondary" />
              )}
            </button>
          </div>

          <a
            href={deviceCode.verification_uri}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-accent hover:underline"
          >
            <ExternalLink size={14} />
            {deviceCode.verification_uri}
          </a>
        </div>

        <div className="flex items-center gap-2 text-sm text-foreground-tertiary">
          <Loader2 className="w-4 h-4 animate-spin" />
          認証を待っています...
        </div>

        <div className="text-xs text-foreground-tertiary">
          ※ ブラウザで GitHub にログインし、コードを入力して承認してください。
          <br />
          承認後、自動的にログインが完了します。
        </div>
      </div>
    );
  }

  // Not authenticated - show login button
  return (
    <div className="p-4 space-y-4">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <div className="text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
          <button
            onClick={clearError}
            className="mt-2 text-xs text-red-600 dark:text-red-400 hover:underline"
          >
            閉じる
          </button>
        </div>
      )}

      <div className="space-y-3">
        <div className="text-sm text-foreground-secondary">
          GitHub にログインして、クラウド同期とバージョン管理機能を有効にします。
        </div>

        <button
          onClick={login}
          disabled={isAuthenticating}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-foreground text-background hover:bg-foreground/90 disabled:bg-foreground/50 rounded-lg transition-colors font-medium"
        >
          {isAuthenticating ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              認証中...
            </>
          ) : (
            <>
              <Github size={18} />
              GitHub にログイン
            </>
          )}
        </button>
      </div>

      <div className="pt-3 border-t border-border">
        <div className="text-xs text-foreground-tertiary space-y-1">
          <p>GitHub ログイン後に利用可能な機能:</p>
          <ul className="list-disc list-inside space-y-0.5 ml-2">
            <li>複数デバイス間での同期</li>
            <li>バージョン履歴の閲覧・復元</li>
            <li>ブランチによる実験的な編集</li>
            <li>クラウドバックアップ</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
