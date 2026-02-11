"use client";

import GlassDialog from "@/components/GlassDialog";

interface UnsavedWarningDialogProps {
  isOpen: boolean;
  fileName: string;
  onSave: () => Promise<void>;
  onDiscard: () => void;
  onCancel: () => void;
}

export default function UnsavedWarningDialog({
  isOpen,
  fileName,
  onSave,
  onDiscard,
  onCancel,
}: UnsavedWarningDialogProps) {
  return (
    <GlassDialog isOpen={isOpen} onBackdropClick={onCancel}>
      <h2 className="text-lg font-semibold text-foreground">
        未保存の変更があります
      </h2>
      <p className="mt-2 text-sm text-foreground-secondary">
        「{fileName}」への変更を保存しますか？
      </p>
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm font-medium text-foreground-secondary hover:bg-hover transition-colors"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-lg px-4 py-2 text-sm font-medium text-foreground-secondary hover:bg-hover transition-colors"
        >
          保存しない
        </button>
        <button
          type="button"
          onClick={async () => {
            await onSave();
          }}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover transition-colors"
        >
          保存
        </button>
      </div>
    </GlassDialog>
  );
}
