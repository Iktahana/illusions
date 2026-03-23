"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export interface DiffStats {
  added: number;
  removed: number;
  addedText: string;
  removedText: string;
}

// -----------------------------------------------------------------------
// Utils
// -----------------------------------------------------------------------

/**
 * Compute approximate character-level additions and removals
 * by matching common prefix and suffix between two strings.
 * O(n) time, no external library required.
 *
 * 共通の接頭辞と接尾辞を照合して文字レベルの追加・削除数を近似計算する。
 */
export function computeDiffStats(oldText: string, newText: string): DiffStats {
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

  const removedStart = prefixLen;
  const removedEnd = oldLen - suffixLen;
  const addedStart = prefixLen;
  const addedEnd = newLen - suffixLen;

  const removedText = oldText.slice(removedStart, removedEnd);
  const addedText = newText.slice(addedStart, addedEnd);

  return {
    added: addedText.length,
    removed: removedText.length,
    addedText,
    removedText,
  };
}

// -----------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------

/** Total number of signs (+/−) in the git-style bar */
const TOTAL_SIGNS = 5;

interface DiffIndicatorProps {
  diffStats?: DiffStats;
  isFirstVersion: boolean;
}

/**
 * Git-style proportional diff bar with separate addition/removal lines.
 * 前のバージョンとの差分を git 風の +/− バーで比率表示する。
 *
 * Example output:
 *   +++++ +68
 *   −−    −10
 */
export default function DiffIndicator({ diffStats, isFirstVersion }: DiffIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);

  const showTip = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setShowTooltip(true);
  }, []);

  const hideTip = useCallback(() => {
    hideTimerRef.current = setTimeout(() => setShowTooltip(false), 100);
  }, []);

  useEffect(() => {
    if (showTooltip && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setTooltipPos({ top: rect.top, left: rect.left });
    } else {
      setTooltipPos(null);
    }
  }, [showTooltip]);

  if (isFirstVersion) {
    return (
      <span className="text-[10px] tabular-nums text-foreground-tertiary">
        初版
      </span>
    );
  }

  if (!diffStats) return null;

  const { added, removed, addedText, removedText } = diffStats;

  if (added === 0 && removed === 0) {
    return (
      <span className="text-[10px] tabular-nums text-foreground-tertiary">
        変更なし
      </span>
    );
  }

  const total = added + removed;
  let plusCount: number;
  let minusCount: number;

  if (added > 0 && removed > 0) {
    // Split proportionally, ensure at least 1 each
    plusCount = Math.max(1, Math.round((added / total) * TOTAL_SIGNS));
    minusCount = TOTAL_SIGNS - plusCount;
    if (minusCount < 1) {
      minusCount = 1;
      plusCount = TOTAL_SIGNS - 1;
    }
  } else if (added > 0) {
    plusCount = TOTAL_SIGNS;
    minusCount = 0;
  } else {
    plusCount = 0;
    minusCount = TOTAL_SIGNS;
  }

  const MAX_PREVIEW_LEN = 80;

  return (
    <div
      ref={triggerRef}
      className="flex flex-col gap-0 cursor-help"
      onMouseEnter={showTip}
      onMouseLeave={hideTip}
    >
      {added > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-mono leading-tight text-success">
            {"+".repeat(plusCount)}
          </span>
          <span className="text-[10px] tabular-nums text-success">
            {added.toLocaleString()}
          </span>
        </div>
      )}
      {removed > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-mono leading-tight text-error">
            {"\u2212".repeat(minusCount)}
          </span>
          <span className="text-[10px] tabular-nums text-error">
            {removed.toLocaleString()}
          </span>
        </div>
      )}

      {/* Portal tooltip rendered at document root */}
      {showTooltip && tooltipPos && createPortal(
        <div
          className="fixed min-w-[200px] max-w-[300px] max-h-[300px] overflow-y-auto p-1.5 rounded-lg bg-background-secondary border border-border shadow-lg text-[11px] leading-none"
          style={{
            zIndex: 9999,
            top: tooltipPos.top,
            left: tooltipPos.left,
            transform: "translateY(-100%) translateY(-8px)",
          }}
          onMouseEnter={showTip}
          onMouseLeave={hideTip}
        >
          {removed > 0 && (
            <div className={added > 0 ? "mb-0.5" : ""}>
              <div className="text-error whitespace-pre-wrap break-words line-through" style={{ lineHeight: 1.15 }}>
                {removedText.length > MAX_PREVIEW_LEN
                  ? removedText.slice(0, MAX_PREVIEW_LEN) + "…"
                  : removedText}
              </div>
            </div>
          )}
          {added > 0 && (
            <div>
              <div className="text-success whitespace-pre-wrap break-words" style={{ lineHeight: 1.15 }}>
                {addedText.length > MAX_PREVIEW_LEN
                  ? addedText.slice(0, MAX_PREVIEW_LEN) + "…"
                  : addedText}
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
