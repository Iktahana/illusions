"use client";

import { Monitor } from "lucide-react";
import GlassDialog from "@/components/GlassDialog";
import DesktopAppDownloadButton from "@/components/DesktopAppDownloadButton";

interface DesktopOnlyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Feature name to display, e.g. "ターミナル" */
  featureName: string;
}

/**
 * Dialog shown to web users when they attempt to use a desktop-only feature.
 * ウェブユーザーがデスクトップ専用機能を使おうとしたときに表示するダイアログ。
 */
export default function DesktopOnlyDialog({
  isOpen,
  onClose,
  featureName,
}: DesktopOnlyDialogProps): React.JSX.Element {
  return (
    <GlassDialog
      isOpen={isOpen}
      onBackdropClick={onClose}
      ariaLabel={`${featureName}はデスクトップ版専用の機能です`}
    >
      {/* アイコン */}
      <div className="flex justify-center text-foreground-secondary mb-4">
        <Monitor size={40} />
      </div>

      {/* 見出し */}
      <h2 className="text-center text-lg font-semibold text-foreground">
        {featureName}はデスクトップ版専用の機能です
      </h2>

      {/* 説明文 */}
      <p className="mt-2 text-center text-sm text-foreground-secondary">
        この機能をご利用いただくには、デスクトップアプリケーションが必要です。
      </p>

      {/* アクションボタン */}
      <div className="mt-6 flex flex-col items-center gap-3">
        <DesktopAppDownloadButton />
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-medium text-foreground-secondary hover:text-foreground transition-colors"
        >
          閉じる
        </button>
      </div>
    </GlassDialog>
  );
}
