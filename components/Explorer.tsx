"use client";

import { useState, useEffect } from "react";
import { FolderTree, Settings, Palette } from "lucide-react";
import clsx from "clsx";
import { ChaptersPanel } from "./explorer/ChaptersPanel";
import { SettingsPanel } from "./explorer/SettingsPanel";
import { StylePanel } from "./explorer/StylePanel";
import { localPreferences } from "@/lib/local-preferences";
import type { Tab, ExplorerProps } from "./explorer/types";

// Re-export for backward compatibility with existing consumers
export { FilesPanel } from "./explorer/FilesPanel";
export type { ExplorerProps, FileTreeEntry, EditingEntry, Tab } from "./explorer/types";

export default function Explorer({
  className,
  content = "",
  onChapterClick,
  onInsertText,
  compactMode = false,
}: ExplorerProps) {
  const [activeTab, setActiveTab] = useState<Tab>("chapters");

  useEffect(() => {
    const savedTab = localPreferences.getLeftTab();
    if (savedTab === "chapters" || savedTab === "settings" || savedTab === "style") {
      setActiveTab(savedTab as Tab);
    }
  }, []);

  useEffect(() => {
    localPreferences.setLeftTab(activeTab);
  }, [activeTab]);

  return (
    <aside className={clsx("h-full bg-background border-r border-border flex flex-col", className)}>
      {/* Tabs */}
      <div className={clsx("border-b border-border flex items-center", compactMode ? "h-10" : "h-12")}>
        <button
          onClick={() => setActiveTab("chapters")}
          className={clsx(
            "flex-1 h-full flex items-center justify-center gap-2 text-sm transition-colors",
            activeTab === "chapters"
              ? "text-foreground border-b-2 border-accent"
              : "text-foreground hover:text-foreground"
          )}
          title="章"
        >
          <FolderTree className="w-4 h-4" />
          <span className="hidden sm:inline">章</span>
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={clsx(
            "flex-1 h-full flex items-center justify-center gap-2 text-sm transition-colors",
            activeTab === "settings"
              ? "text-foreground border-b-2 border-accent"
              : "text-foreground hover:text-foreground"
          )}
          title="設定"
        >
          <Settings className="w-4 h-4" />
          <span className="hidden sm:inline">設定</span>
        </button>
        <button
          onClick={() => setActiveTab("style")}
          className={clsx(
            "flex-1 h-full flex items-center justify-center gap-2 text-sm transition-colors",
            activeTab === "style"
              ? "text-foreground border-b-2 border-accent"
              : "text-foreground hover:text-foreground"
          )}
          title="行間"
        >
          <Palette className="w-4 h-4" />
          <span className="hidden sm:inline">行間</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "chapters" && <div className={compactMode ? "p-3" : "p-4"}><ChaptersPanel content={content} onChapterClick={onChapterClick} onInsertText={onInsertText} /></div>}
        {activeTab === "settings" && <div className={compactMode ? "p-3" : "p-4"}><SettingsPanel /></div>}
        {activeTab === "style" && (
          <div className={compactMode ? "p-3" : "p-4"}>
            <StylePanel />
          </div>
        )}
      </div>
    </aside>
  );
}
