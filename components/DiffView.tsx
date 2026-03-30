"use client";

/**
 * DiffView — read-only inline diff viewer for the illusions editor.
 *
 * Displays character-level differences between the editor buffer (local) and
 * the on-disk content (remote) with conflict resolution action buttons.
 *
 * Uses computeDiff() from lib/services/diff-service for diff calculation.
 */

import { useMemo } from "react";
import { HardDrive, FileText } from "lucide-react";
import type { DiffTabState } from "@/lib/tab-manager/tab-types";
import { computeDiff, getDiffStats } from "@/lib/services/diff-service";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Threshold in bytes above which the inline diff is replaced by a fallback message. */
const DIFF_SIZE_LIMIT = 50_000;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DiffViewProps {
  /** The diff tab state containing both content versions and metadata. */
  tab: DiffTabState;
  /** Called when the user clicks "ディスクの内容を採用". */
  onAcceptDisk: () => void;
  /** Called when the user clicks "エディタの内容を保持". */
  onKeepEditor: () => void;
  /** Called when the user clicks "閉じる". */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Read-only diff viewer showing character-level additions/deletions.
 * Renders a toolbar with filename, timestamp, stats, and action buttons.
 * For very large diffs (> 50 KB combined), shows a simplified fallback.
 */
export default function DiffView({ tab, onAcceptDisk, onKeepEditor, onClose }: DiffViewProps) {
  const { sourceFileName, localContent, remoteContent, remoteTimestamp } = tab;

  // Format timestamp for display
  const formattedTimestamp = new Date(remoteTimestamp).toLocaleString("ja-JP");

  // Compute diff (memoized to avoid re-running on every render)
  const { chunks, stats, isTooLarge } = useMemo(() => {
    const combinedSize = localContent.length + remoteContent.length;
    if (combinedSize > DIFF_SIZE_LIMIT) {
      return { chunks: [], stats: null, isTooLarge: true };
    }
    const diffChunks = computeDiff(localContent, remoteContent);
    const diffStats = getDiffStats(diffChunks);
    return { chunks: diffChunks, stats: diffStats, isTooLarge: false };
  }, [localContent, remoteContent]);

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-background-secondary shrink-0 flex-wrap">
        {/* File info */}
        <div className="flex items-center gap-2 min-w-0 shrink">
          <FileText size={14} className="text-foreground-tertiary shrink-0" />
          <span className="text-sm font-medium text-foreground truncate">{sourceFileName}</span>
          <span className="text-xs text-foreground-tertiary whitespace-nowrap">
            （ディスク最終更新: {formattedTimestamp}）
          </span>
        </div>

        {/* Diff stats */}
        {stats && (stats.addedChars > 0 || stats.removedChars > 0) && (
          <div className="flex items-center gap-2 text-xs ml-2">
            {stats.addedChars > 0 && (
              <span className="text-success">+{stats.addedChars.toLocaleString()} 文字追加</span>
            )}
            {stats.removedChars > 0 && (
              <span className="text-error">−{stats.removedChars.toLocaleString()} 文字削除</span>
            )}
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onKeepEditor}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-foreground-secondary bg-white/8 hover:bg-white/12 border border-border transition-colors"
            title="エディタの内容をそのまま保持し、競合状態を解消します"
          >
            <FileText size={12} />
            エディタの内容を保持
          </button>
          <button
            type="button"
            onClick={onAcceptDisk}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-foreground bg-accent hover:bg-accent/90 transition-colors"
            title="ディスクの内容でエディタの内容を上書きします"
          >
            <HardDrive size={12} />
            ディスクの内容を採用
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-foreground-secondary bg-white/8 hover:bg-white/12 border border-border transition-colors"
            title="差分タブを閉じます（競合状態は保持されます）"
          >
            閉じる
          </button>
        </div>
      </div>

      {/* Diff content area */}
      <div className="flex-1 overflow-auto p-4">
        {isTooLarge ? (
          // Fallback for large files
          <LargeDiffFallback onAcceptDisk={onAcceptDisk} onKeepEditor={onKeepEditor} />
        ) : chunks.length === 0 ? (
          // No changes
          <div className="flex items-center justify-center h-full text-foreground-muted text-sm">
            差分なし — 両方の内容は同一です
          </div>
        ) : (
          // Inline diff display
          <InlineDiff chunks={chunks} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// InlineDiff — renders the character-level diff inline
// ---------------------------------------------------------------------------

import type { DiffChunk } from "@/lib/services/diff-service";

interface InlineDiffProps {
  chunks: DiffChunk[];
}

/**
 * Renders character-level diff chunks inline.
 * Added text: green background. Removed text: red strikethrough background.
 * Unchanged text: normal foreground color.
 */
function InlineDiff({ chunks }: InlineDiffProps) {
  return (
    <div
      className="font-mono text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground"
      aria-label="差分表示"
      aria-readonly="true"
    >
      {chunks.map((chunk, index) => {
        if (chunk.type === "added") {
          return (
            <span key={index} className="bg-success/20 text-success rounded-sm">
              {chunk.value}
            </span>
          );
        }
        if (chunk.type === "removed") {
          return (
            <span key={index} className="bg-error/20 text-error line-through rounded-sm">
              {chunk.value}
            </span>
          );
        }
        // unchanged
        return (
          <span key={index} className="text-foreground">
            {chunk.value}
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LargeDiffFallback — shown when diff exceeds the 50 KB threshold
// ---------------------------------------------------------------------------

interface LargeDiffFallbackProps {
  onAcceptDisk: () => void;
  onKeepEditor: () => void;
}

/**
 * Fallback shown for large files where inline diff computation is skipped.
 * Still provides accept/reject action buttons so the conflict can be resolved.
 */
function LargeDiffFallback({ onAcceptDisk, onKeepEditor }: LargeDiffFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
      <p className="text-foreground-secondary text-sm">
        ファイルが大きすぎるため差分の詳細を表示できません
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onKeepEditor}
          className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-foreground-secondary bg-white/8 hover:bg-white/12 border border-border transition-colors"
        >
          <FileText size={14} />
          エディタの内容を保持
        </button>
        <button
          type="button"
          onClick={onAcceptDisk}
          className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-foreground bg-accent hover:bg-accent/90 transition-colors"
        >
          <HardDrive size={14} />
          ディスクの内容を採用
        </button>
      </div>
    </div>
  );
}
