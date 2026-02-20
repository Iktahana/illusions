"use client";

import { useMemo, useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { parseMarkdownChapters, getChaptersFromDOM } from "@/lib/utils";
import { ChapterItem } from "./ChapterItem";
import { MarkdownSyntaxPanel } from "./MarkdownSyntaxPanel";

interface ChaptersPanelProps {
  content: string;
  onChapterClick?: (anchorId: string) => void;
  onInsertText?: (text: string) => void;
}

/** Table of contents panel showing heading-based chapter navigation */
export function ChaptersPanel({ content, onChapterClick, onInsertText }: ChaptersPanelProps) {
  const [refreshToken, setRefreshToken] = useState(0);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => setRefreshToken((v) => v + 1), 10000);
    return () => clearInterval(timer);
  }, []);

  // Prefer DOM-based chapters (more reliable), fall back to Markdown parsing
  const chapters = useMemo(() => {
    const domChapters = getChaptersFromDOM();
    if (domChapters.length > 0 && domChapters.some(ch => ch.anchorId)) {
      return domChapters;
    }
    return parseMarkdownChapters(content);
  }, [content, refreshToken]);
  const [showSyntaxHelp, setShowSyntaxHelp] = useState(false);

  return (
    <div className="space-y-2 relative">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground-secondary">目次</h3>
        <button
          type="button"
          className="p-1 hover:bg-hover rounded"
          title="目次を更新"
          aria-label="目次を更新"
          onClick={() => {
            setShowSyntaxHelp(false);
            setRefreshToken((v) => v + 1);
          }}
        >
          <RefreshCw className="w-4 h-4 text-foreground-secondary" />
        </button>
      </div>

      {/* Chapter list */}
      <div className="space-y-1">
        {chapters.length > 0 ? (
            chapters.map((chapter, index) => (
            <ChapterItem
              key={index}
              chapter={chapter}
              isActive={index === 0}
              onClick={() => {
                if (chapter.anchorId) {
                  onChapterClick?.(chapter.anchorId);
                }
              }}
            />
          ))

        ) : (
          <div className="text-xs text-foreground-tertiary px-2 py-2">
            コンテンツに見出しがありません
          </div>
        )}
      </div>

      <button
        onClick={() => setShowSyntaxHelp(true)}
        className="w-full mt-4 py-2 text-sm text-foreground-secondary hover:text-foreground hover:bg-hover rounded border border-dashed border-border-secondary"
      >
        + 新しい章を追加
      </button>

      {/* Markdown syntax help */}
      {showSyntaxHelp && (
        <MarkdownSyntaxPanel
          onClose={() => setShowSyntaxHelp(false)}
          onInsertText={(text) => {
            onInsertText?.(text);
            setShowSyntaxHelp(false);
          }}
        />
      )}
    </div>
  );
}
