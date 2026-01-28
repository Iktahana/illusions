"use client";

interface ChromeVersionWarningProps {
  onDismiss: () => void;
}

export default function ChromeVersionWarning({ onDismiss }: ChromeVersionWarningProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
      <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-800">
          需要更新的組件支援 AI 功能
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          本軟體需要更新的組件支援 AI 功能，請確保您的系統已安裝最新的 Chrome/Edge 核心（Chrome 127 以上）。
        </p>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
}

