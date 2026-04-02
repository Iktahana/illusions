"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Bold,
  Italic,
  Strikethrough,
  Quote,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Code,
} from "lucide-react";
import clsx from "clsx";
import type { EditorView } from "@milkdown/prose/view";

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
  | "code";

export default function BubbleMenu({ editorView, onFormat, isVertical = false }: BubbleMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: -9999, left: -9999 });
  const [showHeadingDropdown, setShowHeadingDropdown] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Portal needs to wait for client-side mount
  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    if (!editorView) return;

    const { state } = editorView;
    const { selection } = state;
    const { from, to } = selection;

    if (from === to) {
      setIsVisible(false);
      setShowHeadingDropdown(false);
      return;
    }

    setIsVisible(true);

    const menuEl = menuRef.current;
    if (!menuEl) return;
    const menuWidth = menuEl.offsetWidth;
    const menuHeight = menuEl.offsetHeight;
    const gap = 8;

    // coordsAtPos returns viewport-relative coordinates
    const startCoords = editorView.coordsAtPos(from);

    // Clamp within the scroll container bounds
    const scrollContainer = editorView.dom.closest(
      ".bg-background-secondary",
    ) as HTMLElement | null;
    const bounds = scrollContainer
      ? scrollContainer.getBoundingClientRect()
      : { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight };

    const clampX = (x: number): number =>
      Math.max(bounds.left, Math.min(bounds.right - menuWidth, x));
    const clampY = (y: number): number =>
      Math.max(bounds.top, Math.min(bounds.bottom - menuHeight, y));

    if (isVertical) {
      // Vertical mode: place to the LEFT of the selection to avoid blocking text
      const endCoords = editorView.coordsAtPos(to);
      const selLeft = Math.min(startCoords.left, endCoords.left);
      setPosition({
        left: clampX(selLeft - menuWidth - gap),
        top: clampY(startCoords.top),
      });
      return;
    }

    // Horizontal: above selection start, left-aligned to cursor
    setPosition({
      left: clampX(startCoords.left),
      top: clampY(startCoords.top - menuHeight - gap),
    });
  }, [editorView, isVertical]);

  useEffect(() => {
    if (!editorView) return;

    document.addEventListener("selectionchange", updatePosition);
    editorView.dom.addEventListener("mouseup", updatePosition);
    editorView.dom.addEventListener("keyup", updatePosition);
    window.addEventListener("resize", updatePosition);

    return () => {
      document.removeEventListener("selectionchange", updatePosition);
      editorView.dom.removeEventListener("mouseup", updatePosition);
      editorView.dom.removeEventListener("keyup", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, [editorView, updatePosition]);

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
  ];

  const menu = (
    <div
      ref={menuRef}
      className={clsx(
        "fixed z-50 bg-background-elevated rounded-lg shadow-lg border border-border flex gap-1 p-1 transition-opacity duration-100",
        isVertical ? "flex-col items-center" : "items-center",
        isVisible ? "opacity-100" : "opacity-0 pointer-events-none",
      )}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      {/* 見出し */}
      <div className="relative">
        <button
          onClick={() => setShowHeadingDropdown(!showHeadingDropdown)}
          className={clsx(
            "p-2 rounded hover:bg-hover transition-colors",
            showHeadingDropdown && "bg-hover",
          )}
          title="見出し"
        >
          <Heading1 className="w-4 h-4 text-foreground-secondary" />
        </button>

        {showHeadingDropdown && (
          <div
            className={clsx(
              "absolute bg-background-elevated rounded-lg shadow-lg border border-border py-1 min-w-[120px]",
              isVertical ? "left-full top-0 ml-1" : "top-full left-0 mt-1",
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

      {/* 書式 */}
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

  // Render via portal to document.body to escape dockview's transform context
  if (!mounted) return null;
  return createPortal(menu, document.body);
}
