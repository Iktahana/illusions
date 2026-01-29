"use client";

interface ChromeVersionWarningProps {
  onDismiss: () => void;
}

export default function ChromeVersionWarning({ onDismiss }: ChromeVersionWarningProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
      <div className="mx-4 w-full max-w-md rounded-xl bg-background-elevated p-6 shadow-xl border border-border">
        <h2 className="text-lg font-semibold text-foreground">
          需要更新的組件支援 AI 功能
        </h2>
        <p className="mt-2 text-sm text-foreground-secondary">
          本軟體需要更新的組件支援 AI 功能，請確保您的系統已安裝最新的 Chrome/Edge 核心（Chrome 127 以上）。
        </p>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
}

