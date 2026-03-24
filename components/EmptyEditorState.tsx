"use client";

import { useCallback } from "react";

interface EmptyEditorStateProps {
  onNewFile: () => void;
  onOpenFile: () => void;
}

/** VS Code-like empty editor watermark shown when all tabs are closed. */
export function EmptyEditorState({ onNewFile, onOpenFile }: EmptyEditorStateProps) {
  const handleNewFile = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onNewFile();
    },
    [onNewFile],
  );

  const handleOpenFile = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onOpenFile();
    },
    [onOpenFile],
  );

  return (
    <div className="h-full w-full flex items-center justify-center bg-background select-none">
      <div className="flex flex-col items-center gap-6 text-foreground-secondary opacity-60">
        {/* App logo watermark */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="./logo/illusions.min.svg"
          alt="illusions"
          className="h-16 w-auto opacity-20 dark:invert"
          draggable={false}
        />

        {/* Action buttons */}
        <div className="flex flex-col gap-2 text-sm">
          <button
            className="hover:text-foreground transition-colors cursor-pointer"
            onClick={handleNewFile}
          >
            新規ファイル
          </button>
          <button
            className="hover:text-foreground transition-colors cursor-pointer"
            onClick={handleOpenFile}
          >
            ファイルを開く
          </button>
        </div>
      </div>
    </div>
  );
}
