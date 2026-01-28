"use client";

interface RecoveryModalProps {
  onRestore: () => void;
  onDiscard: () => void;
}

export default function RecoveryModal({ onRestore, onDiscard }: RecoveryModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-title"
    >
      <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 id="recovery-title" className="text-lg font-semibold text-slate-800">
          檢測到未儲存的變更，是否還原？
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          發現較新的暫存資料，您可選擇還原到暫存內容，或捨棄暫存並繼續使用目前內容。
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onDiscard}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            捨棄
          </button>
          <button
            type="button"
            onClick={onRestore}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            還原
          </button>
        </div>
      </div>
    </div>
  );
}
