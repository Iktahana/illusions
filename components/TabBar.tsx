"use client";

import { useCallback, useRef, useEffect } from "react";
import { X } from "lucide-react";
import type { TabId, TabState } from "@/lib/tab-types";

interface TabBarProps {
  tabs: TabState[];
  activeTabId: TabId;
  onSwitchTab: (tabId: TabId) => void;
  onCloseTab: (tabId: TabId) => void;
  onPinTab?: (tabId: TabId) => void;
  compactMode?: boolean;
}

export default function TabBar({
  tabs,
  activeTabId,
  onSwitchTab,
  onCloseTab,
  onPinTab,
  compactMode = false,
}: TabBarProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  // Scroll active tab into view when it changes
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeTabId]);

  const handleMiddleClick = useCallback(
    (event: React.MouseEvent, tabId: TabId) => {
      if (event.button === 1) {
        event.preventDefault();
        onCloseTab(tabId);
      }
    },
    [onCloseTab],
  );

  if (tabs.length <= 1 && !tabs[0]?.file && !tabs[0]?.isDirty) {
    // Single untitled clean tab → hide tab bar
    return null;
  }

  return (
    <div
      className={`flex items-stretch ${compactMode ? "h-7" : "h-9"} bg-background-secondary border-b border-border select-none shrink-0`}
      role="tablist"
    >
      <div
        ref={scrollContainerRef}
        className="flex-1 flex items-stretch overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const label = tab.file?.name ?? `新規ファイル${tab.fileType}`;

          return (
            <button
              key={tab.id}
              ref={isActive ? activeTabRef : undefined}
              role="tab"
              aria-selected={isActive}
              className={`
                group relative flex items-center gap-1.5 ${compactMode ? "px-2 min-w-[100px]" : "px-3 min-w-[120px]"} max-w-[200px]
                text-xs whitespace-nowrap transition-colors duration-100
                border-r border-border
                ${
                  isActive
                    ? "bg-background text-foreground border-t-2 border-t-accent"
                    : "bg-background-secondary text-foreground-secondary hover:bg-hover hover:text-foreground border-t-2 border-t-transparent"
                }
              `}
              onClick={() => onSwitchTab(tab.id)}
              onDoubleClick={() => {
                if (tab.isPreview) onPinTab?.(tab.id);
              }}
              onMouseDown={(e) => handleMiddleClick(e, tab.id)}
            >
              {/* Dirty indicator */}
              {tab.isDirty && (
                <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />
              )}

              {/* Tab label */}
              <span className={`truncate flex-1 text-left${tab.isPreview ? " italic opacity-75" : ""}`}>{label}</span>

              {/* Close button */}
              <span
                role="button"
                tabIndex={-1}
                className={`
                  shrink-0 w-4 h-4 flex items-center justify-center rounded-sm
                  hover:bg-hover-strong transition-colors
                  ${isActive ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-60 hover:!opacity-100"}
                `}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <X size={12} />
              </span>
            </button>
          );
        })}
      </div>

    </div>
  );
}
