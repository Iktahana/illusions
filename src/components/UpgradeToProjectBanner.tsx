"use client";

import { useEffect, useState } from "react";
import { Lightbulb, X } from "lucide-react";

interface UpgradeToProjectBannerProps {
  onUpgrade: () => void;
  onDismiss: () => void;
}

/**
 * Dismissible banner suggesting standalone mode users upgrade to project mode.
 * スタンドアロンモードのユーザーにプロジェクトモードへのアップグレードを促すバナー。
 */
export default function UpgradeToProjectBanner({
  onUpgrade,
  onDismiss,
}: UpgradeToProjectBannerProps): React.JSX.Element | null {
  const [isVisible, setIsVisible] = useState(false);

  // スライドダウンアニメーションをマウント時にトリガーする
  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      setIsVisible(true);
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  /** 「今はしない」ボタンの処理 */
  function handleDismiss(): void {
    setIsVisible(false);
    // アニメーション完了後にコールバックを呼ぶ
    setTimeout(() => {
      onDismiss();
    }, 300);
  }

  /** 「プロジェクトに変換」ボタンの処理 */
  function handleUpgrade(): void {
    onUpgrade();
  }

  return (
    <div
      className={`
        border-l-4 border-accent bg-background-elevated
        overflow-hidden transition-all duration-300 ease-in-out
        ${isVisible ? "max-h-40 opacity-100" : "max-h-0 opacity-0"}
      `}
    >
      <div className="relative flex items-start gap-3 px-4 py-3">
        {/* アイコン */}
        <div className="flex-shrink-0 mt-0.5 text-accent">
          <Lightbulb size={20} />
        </div>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            プロジェクトへのアップグレードをおすすめします
          </h3>
          <p className="mt-1 text-xs text-foreground-secondary">
            プロジェクト形式にすると、自動履歴管理・バージョン管理が利用できます。
          </p>

          {/* ボタン */}
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={handleUpgrade}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent-hover transition-colors"
            >
              プロジェクトに変換
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground-secondary hover:bg-hover transition-colors"
            >
              今はしない
            </button>
          </div>
        </div>

        {/* 閉じるボタン */}
        <button
          type="button"
          onClick={handleDismiss}
          className="flex-shrink-0 text-foreground-secondary hover:text-foreground transition-colors"
          aria-label="閉じる"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
