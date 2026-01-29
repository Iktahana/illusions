"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Strikethrough, Quote, List, ListOrdered, Heading1, Heading2, Heading3, Code, Link as LinkIcon } from "lucide-react";
import clsx from "clsx";
import { EditorView } from "@milkdown/prose/view";

interface BubbleMenuProps {
  editorView: EditorView | null;
  onFormat: (format: FormatType, level?: number) => void;
  isVertical?: boolean;
}

export type FormatType = 
  | "bold" 
  | "italic" 
  | "strikethrough" 
  | "heading" 
  | "bulletList" 
  | "orderedList" 
  | "blockquote"
  | "code"
  | "link";

export default function BubbleMenu({ editorView, onFormat, isVertical = false }: BubbleMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [showHeadingDropdown, setShowHeadingDropdown] = useState(false);

  useEffect(() => {
    if (!editorView) return;

    const updatePosition = () => {
      const { state } = editorView;
      const { selection } = state;
      const { from, to } = selection;

      // Only show menu if there's a non-empty selection
      if (from === to) {
        setIsVisible(false);
        setShowHeadingDropdown(false);
        return;
      }

      setIsVisible(true);

      // Get the DOM coordinates of the selection
      const start = editorView.coordsAtPos(from);
      const end = editorView.coordsAtPos(to);

      if (isVertical) {
        const top = (start.top + end.top) / 2;
        const left = start.left - 56;
        setPosition({
          left,
          top,
        });
      } else {
        // Calculate position above the selection
        const left = (start.left + end.left) / 2;
        const top = start.top;
        setPosition({
          left: left,
          top: top - 50, // Position above the selection
        });
      }
    };

    // Update position on selection change
    const handleUpdate = () => {
      updatePosition();
    };

    // Listen to editor updates
    editorView.dom.addEventListener("mouseup", handleUpdate);
    editorView.dom.addEventListener("keyup", handleUpdate);

    return () => {
      editorView.dom.removeEventListener("mouseup", handleUpdate);
      editorView.dom.removeEventListener("keyup", handleUpdate);
    };
  }, [editorView, isVertical]);

  // Close heading dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowHeadingDropdown(false);
      }
    };

    if (showHeadingDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showHeadingDropdown]);

  if (!isVisible) return null;

  const buttons: Array<{
    icon: typeof Bold;
    label: string;
    format: FormatType;
    shortcut?: string;
  }> = [
    { icon: Bold, label: "太字", format: "bold", shortcut: "⌘B" },
    { icon: Italic, label: "斜体", format: "italic", shortcut: "⌘I" },
    { icon: Strikethrough, label: "取り消し線", format: "strikethrough" },
    { icon: Quote, label: "引用", format: "blockquote" },
    { icon: List, label: "箇条書き", format: "bulletList" },
    { icon: ListOrdered, label: "番号付き", format: "orderedList" },
    { icon: Code, label: "コード", format: "code" },
    { icon: LinkIcon, label: "リンク", format: "link" },
  ];

  return (
    <div
      ref={menuRef}
      className={clsx(
        "fixed z-50 bg-background-elevated rounded-lg shadow-lg border border-border flex gap-1 p-1",
        isVertical ? "flex-col items-center" : "items-center"
      )}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        transform: isVertical ? "translateY(-50%)" : "translateX(-50%)",
      }}
    >
      {/* Heading Dropdown */}
      <div className="relative">
        <button
          onClick={() => setShowHeadingDropdown(!showHeadingDropdown)}
          className={clsx(
            "p-2 rounded hover:bg-hover transition-colors",
            showHeadingDropdown && "bg-hover"
          )}
          title="見出し"
        >
          <Heading1 className="w-4 h-4 text-foreground-secondary" />
        </button>

        {showHeadingDropdown && (
          <div
            className={clsx(
              "absolute bg-background-elevated rounded-lg shadow-lg border border-border py-1 min-w-[120px]",
              isVertical ? "left-full top-0 ml-1" : "top-full left-0 mt-1"
            )}
          >
            {[1, 2, 3].map((level) => {
              const HeadingIcon = level === 1 ? Heading1 : level === 2 ? Heading2 : Heading3;
              return (
                <button
                  key={level}
                  onClick={() => {
                    onFormat("heading", level);
                    setShowHeadingDropdown(false);
                  }}
                  className="w-full px-3 py-2 flex items-center gap-2 hover:bg-hover transition-colors text-left"
                >
                  <HeadingIcon className="w-4 h-4 text-foreground-secondary" />
                  <span className="text-sm text-foreground-secondary">見出し {level}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className={clsx(isVertical ? "h-px w-6" : "w-px h-6", "bg-border")} />

      {/* Format Buttons */}
      {buttons.map(({ icon: Icon, label, format, shortcut }) => (
        <button
          key={format}
          onClick={() => onFormat(format)}
          className="p-2 rounded hover:bg-hover transition-colors group relative"
          title={label}
        >
          <Icon className="w-4 h-4 text-foreground-secondary" />
          {shortcut && (
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-foreground text-background text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              {shortcut}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
