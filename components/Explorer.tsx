"use client";

import { useState, useMemo } from "react";
import { 
  FolderTree, 
  Settings, 
  Palette, 
  ChevronRight,
  FileText,
  Plus
} from "lucide-react";
import clsx from "clsx";
import { parseMarkdownChapters, type Chapter } from "@/lib/utils";

type Tab = "chapters" | "settings" | "style";

interface ExplorerProps {
  className?: string;
  content?: string;
  onChapterClick?: (lineNumber: number) => void;
}

export default function Explorer({ className, content = "", onChapterClick }: ExplorerProps) {
  const [activeTab, setActiveTab] = useState<Tab>("chapters");

  return (
    <aside className={clsx("w-64 bg-white border-r border-slate-200 flex flex-col", className)}>
      {/* Tab Navigation */}
      <div className="h-12 border-b border-slate-200 flex items-center">
        <button
          onClick={() => setActiveTab("chapters")}
          className={clsx(
            "flex-1 h-full flex items-center justify-center gap-2 text-sm transition-colors",
            activeTab === "chapters"
              ? "text-slate-800 border-b-2 border-indigo-500"
              : "text-slate-500 hover:text-slate-700"
          )}
        >
          <FolderTree className="w-4 h-4" />
          章節
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={clsx(
            "flex-1 h-full flex items-center justify-center gap-2 text-sm transition-colors",
            activeTab === "settings"
              ? "text-slate-800 border-b-2 border-indigo-500"
              : "text-slate-500 hover:text-slate-700"
          )}
        >
          <Settings className="w-4 h-4" />
          設定
        </button>
        <button
          onClick={() => setActiveTab("style")}
          className={clsx(
            "flex-1 h-full flex items-center justify-center gap-2 text-sm transition-colors",
            activeTab === "style"
              ? "text-slate-800 border-b-2 border-indigo-500"
              : "text-slate-500 hover:text-slate-700"
          )}
        >
          <Palette className="w-4 h-4" />
          スタイル
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "chapters" && <ChaptersPanel content={content} onChapterClick={onChapterClick} />}
        {activeTab === "settings" && <SettingsPanel />}
        {activeTab === "style" && <StylePanel />}
      </div>
    </aside>
  );
}

function ChaptersPanel({ content, onChapterClick }: { content: string; onChapterClick?: (lineNumber: number) => void }) {
  const chapters = useMemo(() => parseMarkdownChapters(content), [content]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-700">章節管理</h3>
        <button className="p-1 hover:bg-slate-100 rounded">
          <Plus className="w-4 h-4 text-slate-600" />
        </button>
      </div>
      
      {/* Chapter List */}
      <div className="space-y-1">
        {chapters.length > 0 ? (
          chapters.map((chapter, index) => (
            <ChapterItem
              key={index}
              chapter={chapter}
              isActive={index === 0}
              onClick={() => onChapterClick?.(chapter.lineNumber)}
            />
          ))
        ) : (
          <div className="text-xs text-slate-500 px-2 py-2">
            コンテンツに見出しがありません
          </div>
        )}
      </div>
      
      <button className="w-full mt-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-50 rounded border border-dashed border-slate-300">
        + 新しい章を追加
      </button>
    </div>
  );
}

function ChapterItem({ 
  chapter, 
  isActive = false,
  onClick
}: { 
  chapter: Chapter; 
  isActive?: boolean;
  onClick?: () => void;
}) {
  const indent = (chapter.level - 1) * 12; // Indent based on heading level
  
  return (
    <div
      onClick={onClick}
      className={clsx(
        "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors",
        isActive
          ? "bg-indigo-50 text-indigo-700"
          : "hover:bg-slate-50 text-slate-600"
      )}
      style={{ paddingLeft: `${8 + indent}px` }}
    >
      <ChevronRight className="w-4 h-4 flex-shrink-0" />
      <FileText className="w-4 h-4 flex-shrink-0" />
      <span className="text-sm flex-1 truncate">{chapter.title}</span>
      <span className="text-xs text-slate-400 flex-shrink-0">
        {chapter.level}
      </span>
    </div>
  );
}

function SettingsPanel() {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          小説タイトル
        </label>
        <input
          type="text"
          placeholder="無題の小説"
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          著者名
        </label>
        <input
          type="text"
          placeholder="作者名"
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          あらすじ
        </label>
        <textarea
          placeholder="小説の概要を入力..."
          rows={4}
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
      </div>
    </div>
  );
}

function StylePanel() {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          フォント
        </label>
        <select className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option>Noto Serif JP</option>
          <option>Yu Mincho</option>
          <option>Hiragino Mincho</option>
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          文字サイズ
        </label>
        <input
          type="range"
          min="14"
          max="24"
          defaultValue="16"
          className="w-full"
        />
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>小</span>
          <span>中</span>
          <span>大</span>
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          行間
        </label>
        <input
          type="range"
          min="1.5"
          max="2.5"
          step="0.1"
          defaultValue="1.8"
          className="w-full"
        />
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>狭い</span>
          <span>普通</span>
          <span>広い</span>
        </div>
      </div>
    </div>
  );
}
