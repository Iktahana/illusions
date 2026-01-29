"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, AlertCircle, BarChart3, ChevronRight, FolderOpen, FilePlus, Edit2, X } from "lucide-react";
import clsx from "clsx";

type Tab = "ai" | "corrections" | "stats";

const MDI_EXTENSION = ".mdi";

function getMdiExtension(name: string) {
  if (name.toLowerCase().endsWith(MDI_EXTENSION)) {
    return name.slice(name.length - MDI_EXTENSION.length);
  }
  return "";
}

function getBaseName(name: string) {
  const extension = getMdiExtension(name);
  return extension ? name.slice(0, -extension.length) : name;
}

interface InspectorProps {
  className?: string;
  wordCount?: number;
  charCount?: number;
  fileName?: string;
  isDirty?: boolean;
  isSaving?: boolean;
  lastSavedTime?: number | null;
  onOpenFile?: () => void;
  onNewFile?: () => void;
  onFileNameChange?: (newName: string) => void;
}

export default function Inspector({
  className,
  wordCount = 0,
  charCount = 0,
  fileName = "無題",
  isDirty = false,
  isSaving = false,
  lastSavedTime = null,
  onOpenFile,
  onNewFile,
  onFileNameChange,
}: InspectorProps) {
  const [activeTab, setActiveTab] = useState<Tab>("ai");
  const [isEditingFileName, setIsEditingFileName] = useState(false);
  const [editedBaseName, setEditedBaseName] = useState(() => getBaseName(fileName));
  const inputRef = useRef<HTMLInputElement>(null);
  const extension = getMdiExtension(fileName);
  const baseName = getBaseName(fileName);
  const displayBaseName = baseName || fileName;

  // Update edited base name when fileName prop changes
  useEffect(() => {
    setEditedBaseName(getBaseName(fileName));
  }, [fileName]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditingFileName && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingFileName]);

  const handleStartEdit = () => {
    setIsEditingFileName(true);
    setEditedBaseName(baseName);
  };

  const handleSaveFileName = () => {
    const trimmedBase = editedBaseName.trim();
    if (trimmedBase) {
      const newName = extension ? `${trimmedBase}${extension}` : trimmedBase;
      if (newName !== fileName) {
        onFileNameChange?.(newName);
      }
    }
    setIsEditingFileName(false);
  };

  const handleCancelEdit = () => {
    setEditedBaseName(baseName);
    setIsEditingFileName(false);
  };

  // Calculate manuscript pages (400 characters per page in Japanese)
  const manuscriptPages = Math.ceil(charCount / 400);

  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return "未保存";
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);

    if (diffSecs < 60) return "たった今";
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}分前`;
    if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}時間前`;
    return date.toLocaleDateString();
  };

  return (
    <aside className={clsx("h-full bg-background border-l border-border flex flex-col", className)}>
      {/* File Status Header */}
      <div className="px-4 py-3 border-b border-border bg-background-secondary">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide">
            現在のファイル
          </p>
          <div className="flex items-center gap-1">
            {onNewFile && (
              <button
                onClick={onNewFile}
                className="p-1 text-foreground-tertiary hover:text-accent hover:bg-active rounded transition-colors"
                title="新規ファイル"
              >
                <FilePlus className="w-4 h-4" />
              </button>
            )}
            {onOpenFile && (
              <button
                onClick={onOpenFile}
                className="p-1 text-foreground-tertiary hover:text-accent hover:bg-active rounded transition-colors"
                title="ファイルを開く"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        
        {/* Editable File Name */}
        {isEditingFileName ? (
          <div className="flex items-center gap-1">
            <div className="flex-1 min-w-0 flex items-center">
              <input
                ref={inputRef}
                type="text"
                value={editedBaseName}
                onChange={(e) => setEditedBaseName(e.target.value)}
                className="flex-1 min-w-0 text-sm font-semibold text-foreground px-2 py-1 border border-border-secondary rounded focus:outline-none focus:ring-2 focus:ring-accent bg-background"
              />
              {extension && (
                <span className="shrink-0 text-xs font-semibold text-foreground-tertiary whitespace-nowrap">{extension}</span>
              )}
            </div>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleSaveFileName}
              className="px-2 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded transition-colors"
              title="保存"
            >
              OK
            </button>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleCancelEdit}
              className="p-1 text-foreground-tertiary hover:bg-hover rounded transition-colors"
              title="キャンセル"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div 
            className="flex items-center gap-2 group cursor-pointer"
            onClick={handleStartEdit}
          >
            <div className="flex-1 min-w-0 flex items-center">
              <p className="min-w-0 text-sm font-semibold text-foreground truncate">{displayBaseName}</p>
              {extension && (
                <span className="shrink-0 text-xs font-semibold text-foreground-tertiary whitespace-nowrap">{extension}</span>
              )}
            </div>
            {onFileNameChange && (
              <Edit2 className="w-3 h-3 text-foreground-muted opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
        )}
        
        <div className="mt-2 flex items-center justify-between text-xs">
          <span>
            {isSaving && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 animate-pulse">
                <span className="mr-1">⟳</span> 保存中...
              </span>
            )}
            {!isSaving && isDirty && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-orange-500 text-white">
                <span className="mr-1">●</span> 未保存
              </span>
            )}
            {!isSaving && !isDirty && lastSavedTime === null && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-gray-500 text-white">
                <span className="mr-1">●</span> 待保存
              </span>
            )}
            {!isSaving && !isDirty && lastSavedTime !== null && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-green-500 text-white">
                <span className="mr-1">✓</span> 保存済み
              </span>
            )}
          </span>
          {lastSavedTime && !isDirty && (
            <span className="text-foreground-tertiary">{formatTime(lastSavedTime)}</span>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="h-12 border-b border-border flex items-center">
        <button
          onClick={() => setActiveTab("ai")}
          className={clsx(
            "flex-1 h-full flex items-center justify-center gap-2 text-sm transition-colors",
            activeTab === "ai"
              ? "text-foreground border-b-2 border-accent"
              : "text-foreground-tertiary hover:text-foreground-secondary"
          )}
        >
          <Bot className="w-4 h-4" />
          AI
        </button>
        <button
          onClick={() => setActiveTab("corrections")}
          className={clsx(
            "flex-1 h-full flex items-center justify-center gap-2 text-sm transition-colors",
            activeTab === "corrections"
              ? "text-foreground border-b-2 border-accent"
              : "text-foreground-tertiary hover:text-foreground-secondary"
          )}
        >
          <AlertCircle className="w-4 h-4" />
          校正
        </button>
        <button
          onClick={() => setActiveTab("stats")}
          className={clsx(
            "flex-1 h-full flex items-center justify-center gap-2 text-sm transition-colors",
            activeTab === "stats"
              ? "text-foreground border-b-2 border-accent"
              : "text-foreground-tertiary hover:text-foreground-secondary"
          )}
        >
          <BarChart3 className="w-4 h-4" />
          統計
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "ai" && <AIPanel />}
        {activeTab === "corrections" && <CorrectionsPanel />}
        {activeTab === "stats" && <StatsPanel wordCount={wordCount} charCount={charCount} manuscriptPages={manuscriptPages} />}
      </div>
    </aside>
  );
}

function AIPanel() {
  return (
    <div className="space-y-4">
      <div className="bg-accent-light rounded-lg p-4 border border-border">
        <div className="flex items-start gap-3 mb-3">
          <Bot className="w-5 h-5 text-accent mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-foreground mb-1">AI アシスタント</h3>
            <p className="text-xs text-foreground-secondary">
              執筆をサポートします。質問や提案をお聞きください。
            </p>
          </div>
        </div>
      </div>

      {/* AI Suggestions */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide">提案</h4>
        <AISuggestion
          title="次の展開を提案"
          description="登場人物の心情を深掘りしませんか？"
        />
        <AISuggestion
          title="文章の改善"
          description="より自然な表現に書き換えます"
        />
      </div>

      {/* Input Area */}
      <div className="pt-4 border-t border-border">
        <textarea
          placeholder="AI に質問や指示を入力..."
          rows={3}
          className="w-full px-3 py-2 text-sm border border-border-secondary rounded focus:outline-none focus:ring-2 focus:ring-accent resize-none bg-background text-foreground"
        />
        <button className="w-full mt-2 px-4 py-2 bg-accent text-white text-sm font-medium rounded hover:bg-accent-hover transition-colors">
          送信
        </button>
      </div>
    </div>
  );
}

function AISuggestion({ title, description }: { title: string; description: string }) {
  return (
      <div className="flex items-start gap-2 p-3 rounded-lg hover:bg-hover cursor-pointer transition-colors border border-border">
      <ChevronRight className="w-4 h-4 text-foreground-muted mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground-secondary">{title}</p>
        <p className="text-xs text-foreground-tertiary mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function CorrectionsPanel() {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-foreground-secondary">校正リスト</h3>
      
      <CorrectionItem
        type="warning"
        message="重複する文末表現"
        context="「...だった。...だった。」"
        line={23}
      />
      <CorrectionItem
        type="info"
        message="長い文章"
        context="この文は100文字を超えています"
        line={45}
      />
      <CorrectionItem
        type="warning"
        message="助詞の連続"
        context="「...のの...」"
        line={67}
      />
      
      <div className="pt-4 text-center">
        <p className="text-sm text-foreground-tertiary">その他の問題は見つかりませんでした</p>
      </div>
    </div>
  );
}

function CorrectionItem({
  type,
  message,
  context,
  line,
}: {
  type: "warning" | "info";
  message: string;
  context: string;
  line: number;
}) {
  return (
    <div
      className={clsx(
        "p-3 rounded-lg border cursor-pointer hover:shadow-sm transition-shadow",
        type === "warning"
          ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50"
          : "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/50"
      )}
    >
      <div className="flex items-start gap-2">
        <AlertCircle
          className={clsx(
            "w-4 h-4 mt-0.5 flex-shrink-0",
            type === "warning" 
              ? "text-amber-600 dark:text-amber-500" 
              : "text-blue-600 dark:text-blue-500"
          )}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{message}</p>
          <p className="text-xs text-foreground-secondary mt-1">{context}</p>
          <p className="text-xs text-foreground-tertiary mt-1">行 {line}</p>
        </div>
      </div>
    </div>
  );
}

function StatsPanel({
  wordCount,
  charCount,
  manuscriptPages,
}: {
  wordCount: number;
  charCount: number;
  manuscriptPages: number;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-foreground-secondary">文書統計</h3>
      
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="文字数" value={charCount.toLocaleString()} />
        <StatCard label="単語数" value={wordCount.toLocaleString()} />
        <StatCard label="原稿用紙" value={`${manuscriptPages}枚`} />
        <StatCard label="段落数" value="12" />
      </div>
      
      <div className="pt-4 border-t border-border">
        <h4 className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide mb-3">
          原稿用紙換算
        </h4>
        <div className="bg-background-secondary rounded-lg p-3 text-sm text-foreground-secondary">
          <p className="mb-2">
            400字詰め原稿用紙：<span className="font-semibold">{manuscriptPages}枚</span>
          </p>
          <p className="text-xs text-foreground-tertiary">
            ※ 日本語小説の標準フォーマットで計算
          </p>
        </div>
      </div>
      
      <div className="pt-4 border-t border-border">
        <h4 className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide mb-3">
          執筆ペース
        </h4>
        <div className="space-y-2 text-sm text-foreground-secondary">
          <div className="flex justify-between">
            <span>今日</span>
            <span className="font-medium">+320文字</span>
          </div>
          <div className="flex justify-between">
            <span>今週</span>
            <span className="font-medium">+1,240文字</span>
          </div>
          <div className="flex justify-between">
            <span>平均/日</span>
            <span className="font-medium">177文字</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background-secondary rounded-lg p-3 border border-border">
      <p className="text-xs text-foreground-tertiary mb-1">{label}</p>
      <p className="text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
