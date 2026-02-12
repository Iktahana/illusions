"use client";

import { ReactNode, useMemo, useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import clsx from "clsx";
import { getChaptersFromDOM, parseMarkdownChapters, type Chapter } from "@/lib/utils";

interface OutlineProps {
  className?: string;
  content?: string;
  onHeadingClick?: (anchorId: string) => void;
}

export default function Outline({
  className,
  content = "",
  onHeadingClick,
}: OutlineProps): React.ReactElement {
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  // 10秒ごとに自動更新
  useEffect(() => {
    const timer = setInterval(() => setRefreshToken((v) => v + 1), 10000);
    return () => clearInterval(timer);
  }, []);

  // まずDOMから見出し情報を取得し（より確実）、なければMarkdown解析にフォールバック
  const headings = useMemo(() => {
    const domHeadings = getChaptersFromDOM();
    // DOM側でアンカーIDが取れるなら、それを優先して使う
    if (domHeadings.length > 0 && domHeadings.some((h) => h.anchorId)) {
      return domHeadings;
    }
    // それ以外はMarkdownを解析して見出し情報を作る
    return parseMarkdownChapters(content);
  }, [content, refreshToken]);

  // スクロールイベントで現在のセクションを追跡
  useEffect(() => {
    const handleScroll = () => {
      if (headings.length === 0) return;

      // 全ての見出しのオフセットを取得して、現在のスクロール位置と比較
      let currentHeadingId: string | null = null;

      for (const heading of headings) {
        if (!heading.anchorId) continue;

        const element = document.getElementById(heading.anchorId);
        if (!element) continue;

        const rect = element.getBoundingClientRect();
        // ビューポートの上部から100pxより上にある場合、有効と判定
        if (rect.top <= 100) {
          currentHeadingId = heading.anchorId;
        } else {
          break; // それ以降の見出しはビューポート外
        }
      }

      setActiveHeadingId(currentHeadingId);
    };

    const editorContainer = document.querySelector(".milkdown");
    if (editorContainer) {
      editorContainer.addEventListener("scroll", handleScroll);
      return () => editorContainer.removeEventListener("scroll", handleScroll);
    }
  }, [headings]);

  const handleHeadingClick = useCallback(
    (anchorId: string) => {
      setActiveHeadingId(anchorId);
      onHeadingClick?.(anchorId);
    },
    [onHeadingClick]
  );

  return (
    <aside
      className={clsx(
        "h-full bg-background border-r border-border flex flex-col",
        className
      )}
    >
      {/* ヘッダー */}
      <div className="h-12 border-b border-border flex items-center px-4">
        <h2 className="text-sm font-medium text-foreground flex-1">アウトライン</h2>
        <button
          type="button"
          className="p-1 hover:bg-hover rounded transition-colors text-foreground-tertiary hover:text-foreground"
          title="アウトラインを更新"
          aria-label="アウトラインを更新"
          onClick={() => setRefreshToken((v) => v + 1)}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto p-4">
        {headings.length > 0 ? (
          <div className="space-y-1">
            {headings.map((heading, index) => (
              <OutlineItem
                key={index}
                heading={heading}
                isActive={heading.anchorId === activeHeadingId}
                onClick={() =>
                  heading.anchorId &&
                  handleHeadingClick(heading.anchorId)
                }
              />
            ))}
          </div>
        ) : (
          <div className="text-xs text-foreground-tertiary px-2 py-2">
            コンテンツに見出しがありません
          </div>
        )}
      </div>
    </aside>
  );
}

function OutlineItem({
  heading,
  isActive = false,
  onClick,
}: {
  heading: Chapter;
  isActive?: boolean;
  onClick?: () => void;
}): React.ReactElement {
  const indent = (heading.level - 1) * 12; // 見出しレベルに応じてインデント
  const href = heading.anchorId ? `#${heading.anchorId}` : undefined;

  // 見出しレベルに応じたフォントサイズ
  // CSS既定: h1=2em, h2=1.5em, h3=1.17em, h4=1em, h5=0.83em, h6=0.67em
  // アウトラインではテキストサイズの調整は控えめに、インデントで階層を表現
  const fontSizeClass = {
    1: "font-semibold text-base",
    2: "font-semibold text-sm",
    3: "font-medium text-sm",
    4: "text-sm",
    5: "text-xs",
    6: "text-xs",
  }[heading.level] || "text-sm";

  return (
    <button
      onClick={(event) => {
        if (!href) return;
        event.preventDefault();
        onClick?.();
      }}
      className={clsx(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded text-left cursor-pointer transition-colors",
        isActive
          ? "bg-accent text-accent-foreground"
          : "hover:bg-hover text-foreground"
      )}
      style={{ paddingLeft: `${8 + indent}px` }}
      title={heading.title}
    >
      <span className={clsx("flex-1 truncate", fontSizeClass)}>
        {heading.title}
      </span>
    </button>
  );
}
