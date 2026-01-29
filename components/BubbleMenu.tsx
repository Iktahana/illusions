"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Strikethrough, Quote, List, ListOrdered, Heading1, Heading2, Heading3, Code, Link as LinkIcon } from "lucide-react";
import clsx from "clsx";
import { EditorView } from "@milkdown/prose/view";

interface BubbleMenuProps {
  editorView: EditorView | null;
  onFormat: (format: FormatType, level?: number) => void;
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

export default function BubbleMenu({ editorView, onFormat }: BubbleMenuProps) {
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

      // Calculate position above the selection
      const left = (start.left + end.left) / 2;
      const top = start.top;

      setPosition({
        left: left,
        top: top - 50, // Position above the selection
      });
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
  }, [editorView]);

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
      className="fixed z-50 bg-white rounded-lg shadow-lg border border-slate-200 flex items-center gap-1 p-1"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        transform: "translateX(-50%)",
      }}
    >
      {/* Heading Dropdown */}
      <div className="relative">
        <button
          onClick={() => setShowHeadingDropdown(!showHeadingDropdown)}
          className={clsx(
            "p-2 rounded hover:bg-slate-100 transition-colors",
            showHeadingDropdown && "bg-slate-100"
          )}
          title="見出し"
        >
          <Heading1 className="w-4 h-4 text-slate-700" />
        </button>

        {showHeadingDropdown && (
          <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[120px]">
            {[1, 2, 3].map((level) => {
              const HeadingIcon = level === 1 ? Heading1 : level === 2 ? Heading2 : Heading3;
              return (
                <button
                  key={level}
                  onClick={() => {
                    onFormat("heading", level);
                    setShowHeadingDropdown(false);
                  }}
                  className="w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-100 transition-colors text-left"
                >
                  <HeadingIcon className="w-4 h-4 text-slate-700" />
                  <span className="text-sm text-slate-700">見出し {level}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-slate-200" />

      {/* Format Buttons */}
      {buttons.map(({ icon: Icon, label, format, shortcut }) => (
        <button
          key={format}
          onClick={() => onFormat(format)}
          className="p-2 rounded hover:bg-slate-100 transition-colors group relative"
          title={label}
        >
          <Icon className="w-4 h-4 text-slate-700" />
          {shortcut && (
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              {shortcut}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
