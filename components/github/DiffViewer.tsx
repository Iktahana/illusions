/**
 * DiffViewer Component
 * 
 * Displays differences between two text versions.
 */

"use client";

import { useMemo } from "react";
import { diffChars, Change } from "diff";
import clsx from "clsx";

interface DiffViewerProps {
  oldContent: string;
  newContent: string;
  oldLabel?: string;
  newLabel?: string;
}

export default function DiffViewer({
  oldContent,
  newContent,
  oldLabel = "変更前",
  newLabel = "変更後",
}: DiffViewerProps) {
  const changes = useMemo(() => {
    return diffChars(oldContent, newContent);
  }, [oldContent, newContent]);

  const stats = useMemo(() => {
    let additions = 0;
    let deletions = 0;

    changes.forEach((change) => {
      if (change.added) {
        additions += change.value.length;
      } else if (change.removed) {
        deletions += change.value.length;
      }
    });

    return { additions, deletions };
  }, [changes]);

  return (
    <div className="flex flex-col h-full">
      {/* Header with stats */}
      <div className="p-3 border-b border-border bg-background-secondary">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <span className="text-foreground-secondary">{oldLabel} → {newLabel}</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-green-600 dark:text-green-400">
              +{stats.additions} 文字
            </span>
            <span className="text-red-600 dark:text-red-400">
              -{stats.deletions} 文字
            </span>
          </div>
        </div>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-y-auto p-4 bg-background font-mono text-sm leading-relaxed">
        {changes.map((change, index) => {
          if (change.added) {
            return (
              <span
                key={index}
                className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200"
              >
                {change.value}
              </span>
            );
          } else if (change.removed) {
            return (
              <span
                key={index}
                className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 line-through"
              >
                {change.value}
              </span>
            );
          } else {
            return (
              <span key={index} className="text-foreground">
                {change.value}
              </span>
            );
          }
        })}
      </div>
    </div>
  );
}

/**
 * Side-by-side diff viewer (optional, more complex)
 */
interface SideBySideDiffViewerProps {
  oldContent: string;
  newContent: string;
  oldLabel?: string;
  newLabel?: string;
}

export function SideBySideDiffViewer({
  oldContent,
  newContent,
  oldLabel = "変更前",
  newLabel = "変更後",
}: SideBySideDiffViewerProps) {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex border-b border-border bg-background-secondary">
        <div className="flex-1 p-3 border-r border-border">
          <div className="text-sm font-medium text-foreground-secondary">
            {oldLabel}
          </div>
        </div>
        <div className="flex-1 p-3">
          <div className="text-sm font-medium text-foreground-secondary">
            {newLabel}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 border-r border-border bg-background font-mono text-sm leading-relaxed">
          {oldLines.map((line, index) => (
            <div key={index} className="whitespace-pre-wrap">
              {line}
            </div>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4 bg-background font-mono text-sm leading-relaxed">
          {newLines.map((line, index) => (
            <div key={index} className="whitespace-pre-wrap">
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
