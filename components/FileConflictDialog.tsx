"use client";

import { AlertTriangle } from "lucide-react";

import GlassDialog from "@/components/GlassDialog";

interface FileConflictDialogProps {
  isOpen: boolean;
  fileName: string;
  lastModified: number;
  onResolve: (resolution: "local" | "remote") => void;
  localContent?: string;
  remoteContent?: string;
}

/**
 * Dialog shown when external file changes are detected.
 * This is a blocking conflict that must be resolved - background click does not dismiss.
 */
/**
 * Compute simple diff stats between two strings.
 */
interface DiffResult {
  added: number;
  removed: number;
  addedText: string;
  removedText: string;
  contextBefore: string;
  contextAfter: string;
}

const CONTEXT_LEN = 30;

function computeSimpleDiff(oldText: string, newText: string): DiffResult {
  const oldLen = oldText.length;
  const newLen = newText.length;
  const minLen = Math.min(oldLen, newLen);

  let prefixLen = 0;
  while (prefixLen < minLen && oldText[prefixLen] === newText[prefixLen]) {
    prefixLen++;
  }

  let suffixLen = 0;
  const maxSuffix = minLen - prefixLen;
  while (
    suffixLen < maxSuffix &&
    oldText[oldLen - 1 - suffixLen] === newText[newLen - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const removedText = oldText.slice(prefixLen, oldLen - suffixLen);
  const addedText = newText.slice(prefixLen, newLen - suffixLen);

  // Extract surrounding context from the common prefix/suffix
  const ctxStart = Math.max(0, prefixLen - CONTEXT_LEN);
  const contextBefore = oldText.slice(ctxStart, prefixLen);
  const suffixStart = oldLen - suffixLen;
  const contextAfter = oldText.slice(suffixStart, suffixStart + CONTEXT_LEN);

  return {
    added: addedText.length,
    removed: removedText.length,
    addedText,
    removedText,
    contextBefore,
    contextAfter,
  };
}

export default function FileConflictDialog({
  isOpen,
  fileName,
  lastModified,
  onResolve,
  localContent = "",
  remoteContent = "",
}: FileConflictDialogProps) {
  const formattedTimestamp = new Date(lastModified).toLocaleString("ja-JP");

  const diff = computeSimpleDiff(localContent, remoteContent);

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
          {(diff.added > 0 || diff.removed > 0) && (
            <>
              <div className="mt-3 flex items-center gap-3 text-xs">
                {diff.added > 0 && (
                  <span className="text-success">+{diff.added.toLocaleString()} 文字追加</span>
                )}
                {diff.removed > 0 && (
                  <span className="text-error">−{diff.removed.toLocaleString()} 文字削除</span>
                )}
              </div>
              <div className="mt-2 max-h-[200px] overflow-y-auto rounded-lg bg-black/20 p-2.5 text-xs leading-relaxed whitespace-pre-wrap break-words">
                {diff.contextBefore && (
                  <span className="text-foreground-tertiary">…{diff.contextBefore}</span>
                )}
                {diff.removed > 0 && (
                  <span className="text-error line-through">
                    {diff.removedText.length > 200
                      ? diff.removedText.slice(0, 200) + "…"
                      : diff.removedText}
                  </span>
                )}
                {diff.added > 0 && (
                  <span className="text-success">
                    {diff.addedText.length > 200
                      ? diff.addedText.slice(0, 200) + "…"
                      : diff.addedText}
                  </span>
                )}
                {diff.contextAfter && (
                  <span className="text-foreground-tertiary">{diff.contextAfter}…</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={() => onResolve("local")}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-foreground-secondary hover:bg-white/15 transition-colors"
        >
          エディタの内容を保持
        </button>
        <button
          type="button"
          onClick={() => onResolve("remote")}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-foreground-secondary hover:bg-white/15 transition-colors"
        >
          ディスクの内容を読み込む
        </button>
      </div>
    </GlassDialog>
  );
}
