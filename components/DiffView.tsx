"use client";

import { useMemo } from "react";
import { X } from "lucide-react";
import { computeDiff, getDiffStats } from "@/lib/diff-service";

import type { DiffChunk } from "@/lib/diff-service";

interface DiffViewProps {
  /** Snapshot content (old) */
  snapshotContent: string;
  /** Current editor content (new) */
  currentContent: string;
  /** Snapshot timestamp label */
  snapshotLabel: string;
  /** Close callback */
  onClose: () => void;
}

export default function DiffView({
  snapshotContent,
  currentContent,
  snapshotLabel,
  onClose,
}: DiffViewProps) {
  const chunks = useMemo(
    () => computeDiff(snapshotContent, currentContent),
    [snapshotContent, currentContent]
  );

  const stats = useMemo(() => getDiffStats(chunks), [chunks]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide">
          差分表示
        </h3>
        <button
          onClick={onClose}
          className="p-1 text-foreground-tertiary hover:text-foreground hover:bg-hover rounded transition-colors"
          title="閉じる"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Snapshot label */}
      <div className="text-xs text-foreground-secondary">
        比較対象: <span className="font-medium">{snapshotLabel}</span>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 text-[10px]">
        <span className="text-success font-medium">
          +{stats.addedChars}文字
        </span>
        <span className="text-error font-medium">
          -{stats.removedChars}文字
        </span>
      </div>

      {/* Diff content */}
      <div className="bg-background-secondary rounded-lg p-3 border border-border max-h-96 overflow-y-auto">
        <div className="text-sm leading-relaxed font-serif whitespace-pre-wrap break-all">
          {chunks.map((chunk, i) => (
            <DiffChunkSpan key={i} chunk={chunk} />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-foreground-tertiary">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-success/20 border border-success/30" />
          追加
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-error/20 border border-error/30" />
          削除
        </span>
      </div>
    </div>
  );
}

function DiffChunkSpan({ chunk }: { chunk: DiffChunk }) {
  switch (chunk.type) {
    case "added":
      return (
        <span className="bg-success/20 text-success border-b border-success/40">
          {chunk.value}
        </span>
      );
    case "removed":
      return (
        <span className="bg-error/20 text-error line-through border-b border-error/40">
          {chunk.value}
        </span>
      );
    case "unchanged":
      return <span>{chunk.value}</span>;
  }
}
