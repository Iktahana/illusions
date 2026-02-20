"use client";

import type { ReactNode } from "react";
import GlassDialog from "@/components/GlassDialog";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  dangerous?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Reusable confirmation dialog built on GlassDialog. */
export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "確認",
  cancelLabel = "キャンセル",
  dangerous = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element {
  return (
    <GlassDialog isOpen={isOpen} onBackdropClick={onCancel} ariaLabel={title}>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-2 text-sm text-foreground-secondary whitespace-pre-wrap">
        {message}
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm font-medium text-foreground-secondary hover:bg-hover transition-colors"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={
            dangerous
              ? "rounded-lg px-4 py-2 text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
              : "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover transition-colors"
          }
        >
          {confirmLabel}
        </button>
      </div>
    </GlassDialog>
  );
}
