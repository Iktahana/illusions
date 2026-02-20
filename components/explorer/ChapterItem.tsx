"use client";

import { FileText } from "lucide-react";
import clsx from "clsx";
import type { Chapter } from "@/lib/utils";
import { renderFormattedTitle } from "./render-formatted-title";

interface ChapterItemProps {
  chapter: Chapter;
  isActive?: boolean;
  onClick?: () => void;
}

/** Renders a single heading entry in the table of contents */
export function ChapterItem({
  chapter,
  isActive = false,
  onClick,
}: ChapterItemProps) {
  const indent = (chapter.level - 1) * 12; // Indent based on heading level
  const href = chapter.anchorId ? `#${chapter.anchorId}` : undefined;

  return (
    <a
      href={href}
      onClick={(event) => {
        if (!href) return;
        event.preventDefault();
        onClick?.();
      }}
      className={clsx(
        "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors",
        isActive
          ? "bg-accent text-accent-foreground"
          : "hover:bg-hover text-foreground"
      )}
      style={{ paddingLeft: `${8 + indent}px` }}
    >
      <FileText className="w-4 h-4 flex-shrink-0" />
      <span className="text-sm flex-1 truncate">{renderFormattedTitle(chapter.title)}</span>
    </a>
  );
}
