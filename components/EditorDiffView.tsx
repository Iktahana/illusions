"use client";

import { useMemo } from "react";
import { X } from "lucide-react";
import { computeDiff, getDiffStats } from "@/lib/diff-service";
import { useTypographySettings } from "@/contexts/EditorSettingsContext";

import type { DiffChunk } from "@/lib/diff-service";

interface EditorDiffViewProps {
  /** Snapshot content (old) */
  snapshotContent: string;
  /** Current editor content (new) */
  currentContent: string;
  /** Snapshot timestamp label (e.g. "14:30 (自動)") */
  snapshotLabel: string;
  /** Close callback */
  onClose: () => void;
}

export default function EditorDiffView({
  snapshotContent,
  currentContent,
  snapshotLabel,
  onClose,
}: EditorDiffViewProps) {
  const { fontScale, lineHeight, fontFamily, charsPerLine, textIndent, paragraphSpacing } = useTypographySettings();
  const chunks = useMemo(
    () => computeDiff(snapshotContent, currentContent),
    [snapshotContent, currentContent]
  );

  const stats = useMemo(() => getDiffStats(chunks), [chunks]);

  // Calculate max-width from charsPerLine using 1em approximation
  const maxWidth = charsPerLine > 0 ? `${charsPerLine}em` : undefined;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header bar (sticky) */}
      <div className="h-12 border-b border-border bg-background flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-medium text-foreground whitespace-nowrap">
            差分表示
          </h3>
          <span className="text-xs text-foreground-secondary truncate">
            {snapshotLabel}
          </span>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-success font-medium">
              +{stats.addedChars}文字
            </span>
            <span className="text-error font-medium">
              -{stats.removedChars}文字
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Legend */}
          <div className="flex items-center gap-3 text-[10px] text-foreground-tertiary">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-success/20 border border-success/30" />
              追加
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-error/20 border border-error/30" />
              削除
            </span>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium bg-accent text-accent-foreground hover:bg-accent-hover transition-colors"
          >
            <X className="w-4 h-4" />
            <span>閉じる</span>
          </button>
        </div>
      </div>

      {/* Diff content area - matches editor styling */}
      <div className="flex-1 bg-background-secondary overflow-y-auto pt-12">
        <div
          className="p-8 mx-auto"
          style={{
            fontSize: `${fontScale}%`,
            fontFamily: `"${fontFamily}", serif`,
            lineHeight,
            maxWidth,
          }}
        >
          <DiffContent
            chunks={chunks}
            textIndent={textIndent}
            paragraphSpacing={paragraphSpacing}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Render diff chunks as paragraphs, preserving paragraph breaks.
 * Splits content by newlines and renders each paragraph with proper indent/spacing.
 */
function DiffContent({
  chunks,
  textIndent,
  paragraphSpacing,
}: {
  chunks: DiffChunk[];
  textIndent: number;
  paragraphSpacing: number;
}) {
  // Build paragraph-aware rendering:
  // Walk chunks, splitting on \n to create paragraph boundaries
  const elements: React.ReactNode[] = [];
  let currentParagraph: React.ReactNode[] = [];
  let paraIndex = 0;

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      elements.push(
        <p
          key={`p-${paraIndex}`}
          style={{
            textIndent: `${textIndent}em`,
            marginBottom: `${paragraphSpacing}em`,
          }}
        >
          {currentParagraph}
        </p>
      );
      currentParagraph = [];
      paraIndex++;
    }
  };

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const lines = chunk.value.split("\n");

    for (let li = 0; li < lines.length; li++) {
      // A newline boundary means flush current paragraph
      if (li > 0) {
        flushParagraph();
      }

      const text = lines[li];
      if (text.length === 0 && li > 0) {
        // Empty line after split — just the paragraph break (already flushed)
        continue;
      }

      if (text.length > 0) {
        currentParagraph.push(
          <DiffChunkSpan key={`c${ci}-l${li}`} type={chunk.type} value={text} />
        );
      }
    }
  }

  // Flush remaining
  flushParagraph();

  return <div>{elements}</div>;
}

function DiffChunkSpan({ type, value }: { type: DiffChunk["type"]; value: string }) {
  switch (type) {
    case "added":
      return (
        <span className="bg-success/20 text-success border-b border-success/40">
          {value}
        </span>
      );
    case "removed":
      return (
        <span className="bg-error/20 text-error line-through border-b border-error/40">
          {value}
        </span>
      );
    case "unchanged":
      return <span>{value}</span>;
  }
}
