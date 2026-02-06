"use client";

import { 
  FileText, 
  Settings, 
  Search,
  Book,
  Layers,
  BarChart3,
  Users,
  BookOpen,
  FolderGit2
} from "lucide-react";
import clsx from "clsx";

export type ActivityBarView = "projects" | "explorer" | "inspector" | "settings" | "search" | "outline" | "wordfreq" | "characters" | "dictionary" | "none";

interface ActivityBarProps {
  activeView: ActivityBarView;
  onViewChange: (view: ActivityBarView) => void;
}

interface ActivityBarItem {
  id: ActivityBarView;
  icon: typeof FileText;
  label: string;
  tooltip: string;
}

const ACTIVITY_BAR_ITEMS: ActivityBarItem[] = [
  {
    id: "projects",
    icon: FolderGit2,
    label: "プロジェクト",
    tooltip: "プロジェクト (Ctrl+Shift+P)"
  },
  {
    id: "explorer",
    icon: Layers,
    label: "エクスプローラー",
    tooltip: "エクスプローラー (Ctrl+Shift+E)"
  },
  {
    id: "search",
    icon: Search,
    label: "検索",
    tooltip: "検索 (Ctrl+Shift+F)"
  },
  {
    id: "outline",
    icon: Book,
    label: "アウトライン",
    tooltip: "アウトライン (Ctrl+Shift+O)"
  },
  {
    id: "characters",
    icon: Users,
    label: "登場人物",
    tooltip: "登場人物"
  },
  {
    id: "dictionary",
    icon: BookOpen,
    label: "辭典",
    tooltip: "辭典"
  },
  {
    id: "wordfreq",
    icon: BarChart3,
    label: "語彙統計",
    tooltip: "語彙統計"
  },
  {
    id: "settings",
    icon: Settings,
    label: "設定",
    tooltip: "設定 (Ctrl+,)"
  },
];

export default function ActivityBar({ activeView, onViewChange }: ActivityBarProps) {
  const handleItemClick = (id: ActivityBarView) => {
    // 同じアイテムをクリックした場合はトグル（閉じる）
    if (activeView === id) {
      onViewChange("none");
    } else {
      onViewChange(id);
    }
  };

  return (
    <div className="w-12 bg-background-tertiary border-r border-border flex flex-col items-center py-2 gap-1">
      {ACTIVITY_BAR_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activeView === item.id;
        
        return (
          <button
            key={item.id}
            onClick={() => handleItemClick(item.id)}
            className={clsx(
              "w-10 h-10 flex items-center justify-center rounded-md transition-all relative group",
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-foreground-tertiary hover:text-foreground hover:bg-hover"
            )}
            title={item.tooltip}
          >
            <Icon className="w-5 h-5" />
            
            {/* 激活指示器 */}
            {isActive && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-accent-foreground rounded-r" />
            )}
            
            {/* 悬停提示 */}
            <span className="absolute left-full ml-2 px-2 py-1 bg-background-elevated border border-border text-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              {item.tooltip}
            </span>
          </button>
        );
      })}
    </div>
  );
}
