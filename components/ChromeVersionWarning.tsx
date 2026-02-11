"use client";

import GlassDialog from "@/components/GlassDialog";

interface ChromeVersionWarningProps {
  onDismiss: () => void;
}

export default function ChromeVersionWarning({ onDismiss }: ChromeVersionWarningProps) {
  return (
    <GlassDialog isOpen={true}>
      <h2 className="text-lg font-semibold text-foreground">
        AI 機能の利用にはブラウザエンジンの更新が必要です
      </h2>
      <p className="mt-2 text-sm text-foreground-secondary">
        本アプリの AI 機能には最新の Chrome/Edge エンジン（Chrome 127 以上）が必要です。システムに最新の Chrome/Edge がインストールされているか確認してください。
      </p>
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
        >
          了解しました
        </button>
      </div>
    </GlassDialog>
  );
}
