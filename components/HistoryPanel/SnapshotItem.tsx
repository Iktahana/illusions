"use client";

import { useState, useEffect, useRef } from "react";
import { Pin, RotateCcw, Loader2, Bookmark, GitCompare, MoreVertical } from "lucide-react";
import clsx from "clsx";

import type { SnapshotEntry } from "@/lib/services/history-service";
import DiffIndicator from "./DiffIndicator";
import type { DiffStats } from "./DiffIndicator";
import { formatTimeJa, getSnapshotTypeLabel, getSnapshotTypeBadgeClass } from "./snapshot-utils";

export interface SnapshotItemProps {
  snapshot: SnapshotEntry;
  isRestoring: boolean;
  onRestore: (snapshot: SnapshotEntry) => void;
  onCompare: (snapshot: SnapshotEntry) => void;
  isLoadingDiff: boolean;
  diffStats?: DiffStats;
  isFirstVersion: boolean;
  isBookmarked: boolean;
  onToggleBookmark: (snapshotId: string) => void;
}

export default function SnapshotItem({
  snapshot,
  isRestoring,
  onRestore,
  onCompare,
  isLoadingDiff,
  diffStats,
  isFirstVersion,
  isBookmarked,
  onToggleBookmark,
}: SnapshotItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <div className="bg-background-secondary rounded-lg p-3 border border-border">
      {/* Row 1: Time + type badge + char count */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold tabular-nums text-foreground">
            {formatTimeJa(snapshot.timestamp)}
          </span>
          <span
            className={clsx(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0",
              getSnapshotTypeBadgeClass(snapshot.type)
            )}
          >
            {snapshot.type === "milestone" && (
              <Pin className="w-2.5 h-2.5" />
            )}
            {getSnapshotTypeLabel(snapshot.type)}
          </span>
        </div>
        <span className="text-[10px] text-foreground-tertiary tabular-nums flex-shrink-0">
          {snapshot.characterCount.toLocaleString()}文字
        </span>
      </div>

      {/* Milestone label */}
      {snapshot.label && (
        <p className="text-xs font-medium text-foreground-secondary mb-1">
          {snapshot.label}
        </p>
      )}

      {/* Row 2: Diff indicator + actions */}
      <div className="flex items-end justify-between">
        <DiffIndicator diffStats={diffStats} isFirstVersion={isFirstVersion} />

        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Bookmark button */}
          <button
            onClick={() => onToggleBookmark(snapshot.id)}
            className={clsx(
              "p-1 rounded transition-colors",
              isBookmarked
                ? "text-accent"
                : "text-foreground-tertiary hover:text-accent hover:bg-hover"
            )}
            title={isBookmarked ? "ブックマークを解除" : "ブックマークに追加"}
          >
            <Bookmark className="w-3.5 h-3.5" fill={isBookmarked ? "currentColor" : "none"} />
          </button>

          {/* Three-dot menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="p-1 rounded transition-colors text-foreground-tertiary hover:text-foreground-secondary hover:bg-hover"
              title="メニュー"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 bottom-full mb-1 z-10 min-w-[120px] rounded-lg border border-border bg-background-secondary shadow-lg py-1">
                <button
                  onClick={() => { setMenuOpen(false); onRestore(snapshot); }}
                  disabled={isRestoring}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] font-medium text-foreground-secondary hover:bg-hover transition-colors disabled:opacity-50"
                >
                  {isRestoring ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                  復元
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onCompare(snapshot); }}
                  disabled={isLoadingDiff}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] font-medium text-foreground-secondary hover:bg-hover transition-colors disabled:opacity-50"
                >
                  {isLoadingDiff ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <GitCompare className="w-3.5 h-3.5" />
                  )}
                  比較
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
