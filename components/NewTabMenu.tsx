"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { SupportedFileExtension } from "@/lib/project/project-types";

interface NewTabMenuProps {
  onNewTab: (fileType: SupportedFileExtension) => void;
  compactMode?: boolean;
}

const FILE_TYPE_OPTIONS: {
  fileType: SupportedFileExtension;
  label: string;
  description: string;
}[] = [
  {
    fileType: ".mdi",
    label: "MDI 文書",
    description: "ルビ・縦中横対応",
  },
  {
    fileType: ".md",
    label: "Markdown",
    description: "標準マークダウン",
  },
  {
    fileType: ".txt",
    label: "テキスト",
    description: "プレーンテキスト",
  },
];

export default function NewTabMenu({ onNewTab, compactMode = false }: NewTabMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback(
    (fileType: SupportedFileExtension) => {
      onNewTab(fileType);
      setIsOpen(false);
    },
    [onNewTab],
  );

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close menu on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        className={`${compactMode ? "w-7" : "w-8"} h-full flex items-center justify-center text-foreground-secondary hover:bg-hover hover:text-foreground transition-colors`}
        onClick={() => setIsOpen((prev) => !prev)}
        title="新しいタブ"
        aria-label="新しいタブ"
      >
        <Plus size={14} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 z-50 min-w-[180px] rounded-lg border border-border bg-background-secondary shadow-lg py-1">
          {FILE_TYPE_OPTIONS.map((option) => (
            <button
              key={option.fileType}
              className="w-full px-3 py-2 text-left text-sm hover:bg-hover transition-colors flex items-center justify-between gap-2"
              onClick={() => handleSelect(option.fileType)}
            >
              <span className="text-foreground">{option.label}</span>
              <span className="text-xs text-foreground-tertiary">
                {option.description}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
