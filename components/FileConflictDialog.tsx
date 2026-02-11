"use client";

import { AlertTriangle } from "lucide-react";

import GlassDialog from "@/components/GlassDialog";

interface FileConflictDialogProps {
  isOpen: boolean;
  fileName: string;
  lastModified: number;
  onResolve: (resolution: "local" | "remote") => void;
}

/**
 * Dialog shown when external file changes are detected.
 * This is a blocking conflict that must be resolved - background click does not dismiss.
 */
export default function FileConflictDialog({
  isOpen,
  fileName,
  lastModified,
  onResolve,
}: FileConflictDialogProps) {
  const formattedTimestamp = new Date(lastModified).toLocaleString("ja-JP");

  return (
    <GlassDialog isOpen={isOpen}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            ファイルが外部で変更されました
          </h2>
          <p className="mt-2 text-sm text-foreground-secondary">
            「{fileName}」が外部のプログラムにより変更されました。
          </p>
          <p className="mt-1 text-xs text-foreground-secondary">
            最終変更: {formattedTimestamp}
          </p>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={() => onResolve("local")}
          className="rounded-lg px-4 py-2 text-sm font-medium text-foreground-secondary hover:bg-hover transition-colors"
        >
          エディタの内容を保持
        </button>
        <button
          type="button"
          onClick={() => onResolve("remote")}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover transition-colors"
        >
          ディスクの内容を読み込む
        </button>
      </div>
    </GlassDialog>
  );
}
