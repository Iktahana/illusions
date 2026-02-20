"use client";

import { useState, useRef, useEffect, ReactNode } from "react";
import { Bot, AlertCircle, BarChart3, Edit2, X, History } from "lucide-react";
import clsx from "clsx";
import { useEditorMode } from "@/contexts/EditorModeContext";
import HistoryPanel from "./HistoryPanel";

import type { ProjectMode } from "@/lib/project-types";
import type { LintIssue, Severity } from "@/lib/linting";

type Tab = "ai" | "corrections" | "stats" | "history";

const rightTabStorageKey = "illusions:rightTab";
const isValidTab = (value: string | null): value is Tab =>
  value === "ai" || value === "corrections" || value === "stats" || value === "history";

const readStoredTab = (): Tab | null => {
  if (typeof window === "undefined") return null;
  try {
    const savedTab = window.localStorage.getItem(rightTabStorageKey);
    return isValidTab(savedTab) ? savedTab : null;
  } catch {
    return null;
  }
};

const writeStoredTab = (tab: Tab) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(rightTabStorageKey, tab);
  } catch (error) {
    console.error("右サイドのタブ状態を保存できませんでした:", error);
  }
};

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
  compactMode?: boolean;
  wordCount?: number;
  charCount?: number;
  selectedCharCount?: number;
  paragraphCount?: number;
  fileName?: string;
  isDirty?: boolean;
  isSaving?: boolean;
  lastSavedTime?: number | null;
  onSaveFile?: () => void;
  onFileNameChange?: (newName: string) => void;
  sentenceCount?: number;
  charTypeAnalysis?: {
    kanji: number;
    hiragana: number;
    katakana: number;
    other: number;
    total: number;
  };
  charUsageRates?: {
    kanjiRate: number;
    hiraganaRate: number;
    katakanaRate: number;
  };
  readabilityAnalysis?: {
    score: number;
    level: string;
    avgSentenceLength: number;
    avgPunctuationSpacing: number;
  };
  // 品詞着色設定
  posHighlightEnabled?: boolean;
  onPosHighlightEnabledChange?: (enabled: boolean) => void;
  // 履歴復元コールバック（プロジェクトモード時に使用）
  onHistoryRestore?: (content: string) => void;
  // 現在開いているファイル名（履歴パネルの切り替え用）
  activeFileName?: string;
  // 現在のエディタ内容（履歴差分表示用）
  currentContent?: string;
  // エディタ領域で差分を表示するコールバック
  onCompareInEditor?: (data: { snapshotContent: string; currentContent: string; label: string }) => void;
  // リンティング結果
  lintIssues?: LintIssue[];
  onNavigateToIssue?: (issue: LintIssue) => void;
  onApplyFix?: (issue: LintIssue) => void;
}

export default function Inspector({
  className,
  compactMode = false,
  wordCount = 0,
  charCount = 0,
  selectedCharCount = 0,
  paragraphCount = 0,
  fileName = "無題",
  isDirty = false,
  isSaving = false,
  lastSavedTime = null,
  onSaveFile,
  onFileNameChange,
  sentenceCount = 0,
  charTypeAnalysis,
  charUsageRates,
  readabilityAnalysis,
  posHighlightEnabled = false,
  onPosHighlightEnabledChange,
  onHistoryRestore,
  activeFileName,
  currentContent = "",
  onCompareInEditor,
  lintIssues,
  onNavigateToIssue,
  onApplyFix,
}: InspectorProps) {
  const { editorMode, isProject } = useEditorMode();
  const projectMode = isProject ? (editorMode as ProjectMode) : null;

  const [activeTab, setActiveTab] = useState<Tab>("ai");
  const hasLoadedRef = useRef(false);
  const [isTabReady, setIsTabReady] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const tabBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Responsive tab bar: hide labels when space is limited
  useEffect(() => {
    if (!tabBarRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        // Hide labels if width is less than 400px
        setShowLabels(width >= 400);
      }
    });

    observer.observe(tabBarRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const storedTab = readStoredTab();
    if (storedTab) {
      setActiveTab(storedTab);
    }
    hasLoadedRef.current = true;
    setIsTabReady(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current) return;
    writeStoredTab(activeTab);
  }, [activeTab]);

  // プロジェクトモードでない場合に履歴タブが選択されていたらフォールバック
  useEffect(() => {
    if (!isProject && activeTab === "history") {
      setActiveTab("ai");
    }
  }, [isProject, activeTab]);
  const [isEditingFileName, setIsEditingFileName] = useState(false);
  const [editedBaseName, setEditedBaseName] = useState(() => getBaseName(fileName));
  const inputRef = useRef<HTMLInputElement>(null);
  const extension = getMdiExtension(fileName);
  const baseName = getBaseName(fileName);
  // isDirty の場合はファイル名に * を追加（クライアント側のみ）
  const displayBaseName = (baseName || fileName) + (isClient && isDirty ? " *" : "");

  // fileName の変更に合わせて編集用のベース名も更新する（編集中は上書きしない）
  useEffect(() => {
    if (!isEditingFileName) {
      setEditedBaseName(getBaseName(fileName));
    }
  }, [fileName, isEditingFileName]);

  // 編集モードに入ったら入力欄へフォーカスする
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

  // 原稿用紙換算（400字/枚）
  const manuscriptPages = Math.ceil(charCount / 400);

   const formatTime = (timestamp: number | null) => {
     if (!timestamp) return "未保存";
     const date = new Date(timestamp);
     const now = new Date();
     const diffMs = now.getTime() - date.getTime();
     const diffSecs = Math.floor(diffMs / 1000);

     if (diffSecs < 60) return "今";
     if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}分前`;
     if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}時間前`;
     return date.toLocaleDateString();
   };

  return (
    <aside
      className={clsx(
        "h-full bg-background border-l border-border flex flex-col transition-opacity duration-150",
        !isTabReady && "opacity-0 pointer-events-none",
        className
      )}
    >
      {/* ファイル状態 */}
      <div className={clsx("border-b border-border bg-background-secondary", compactMode ? "px-3 py-2" : "px-4 py-3")}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide">
            ファイル情報
          </p>
          <div className="flex items-center gap-1">
            {onSaveFile && (
              <button
                onClick={() => void onSaveFile()}
                disabled={!isClient || isSaving || !isDirty}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  !isClient
                    ? 'bg-background text-foreground-muted cursor-not-allowed opacity-50 border border-border'
                    : isSaving
                    ? 'bg-background text-foreground-tertiary cursor-wait border border-border'
                    : isDirty
                    ? 'bg-accent text-white hover:bg-accent-hover'
                    : 'bg-background text-foreground-muted cursor-not-allowed opacity-50 border border-border'
                }`}
                title={
                  !isClient
                    ? '変更なし'
                    : isSaving
                    ? '保存中...'
                    : isDirty
                    ? 'ファイルを保存 (Cmd/Ctrl+S)'
                    : '変更なし'
                }
              >
                {isClient && isSaving ? '保存中...' : '保存'}
              </button>
            )}
          </div>
        </div>
        
        {/* ファイル名（編集可） */}
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
              className="px-2 py-1 text-xs font-medium bg-success text-white hover:opacity-90 rounded transition-opacity"
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
              {isClient && isSaving && (
               <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-info/20 text-info animate-pulse">
                 <span className="mr-1">⟳</span> 保存中
               </span>
             )}
             {isClient && !isSaving && isDirty && (
               <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-warning text-white">
                 <span className="mr-1">●</span> 編集中
               </span>
             )}
             {!isClient || (!isSaving && !isDirty && lastSavedTime === null) ? (
               <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-foreground-muted text-white">
                 <span className="mr-1">●</span> 新規
               </span>
             ) : null}
             {isClient && !isSaving && !isDirty && lastSavedTime !== null && (
               <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-success text-white">
                 <span className="mr-1">✓</span> 保存済み
               </span>
             )}
          </span>
          {isClient && lastSavedTime && !isDirty && (
            <span className="text-foreground-tertiary">{formatTime(lastSavedTime)}</span>
          )}
        </div>
      </div>

      {/* タブ */}
      <div ref={tabBarRef} className={clsx("border-b border-border flex items-center", compactMode ? "h-10" : "h-12")}>
        <button
          onClick={() => setActiveTab("ai")}
          className={clsx(
            "flex-1 h-full flex items-center justify-center text-sm transition-colors",
            showLabels ? "gap-2" : "gap-0",
            activeTab === "ai"
              ? "text-foreground border-b-2 border-accent"
              : "text-foreground-tertiary hover:text-foreground-secondary"
          )}
          title="AI"
        >
          <Bot className="w-4 h-4 shrink-0" />
          {showLabels && <span>AI</span>}
        </button>
        <button
          onClick={() => setActiveTab("corrections")}
          className={clsx(
            "flex-1 h-full flex items-center justify-center text-sm transition-colors",
            showLabels ? "gap-2" : "gap-0",
            activeTab === "corrections"
              ? "text-foreground border-b-2 border-accent"
              : "text-foreground-tertiary hover:text-foreground-secondary"
          )}
          title="校正"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          {showLabels && <span>校正</span>}
        </button>
        <button
          onClick={() => setActiveTab("stats")}
          className={clsx(
            "flex-1 h-full flex items-center justify-center text-sm transition-colors",
            showLabels ? "gap-2" : "gap-0",
            activeTab === "stats"
              ? "text-foreground border-b-2 border-accent"
              : "text-foreground-tertiary hover:text-foreground-secondary"
          )}
          title="統計"
        >
          <BarChart3 className="w-4 h-4 shrink-0" />
          {showLabels && <span>統計</span>}
        </button>
        {isProject && (
          <button
            onClick={() => setActiveTab("history")}
            className={clsx(
              "flex-1 h-full flex items-center justify-center text-sm transition-colors",
              showLabels ? "gap-2" : "gap-0",
              activeTab === "history"
                ? "text-foreground border-b-2 border-accent"
                : "text-foreground-tertiary hover:text-foreground-secondary"
            )}
            title="履歴"
          >
            <History className="w-4 h-4 shrink-0" />
            {showLabels && <span>履歴</span>}
          </button>
        )}
      </div>

       {/* 本文 */}
       <div className={clsx("flex-1 overflow-y-auto", compactMode ? "p-3" : "p-4")}>
         {activeTab === "ai" && <AIPanel />}
         {activeTab === "corrections" && (
           <CorrectionsPanel
             posHighlightEnabled={posHighlightEnabled}
             onPosHighlightEnabledChange={onPosHighlightEnabledChange}
             lintIssues={lintIssues ?? []}
             onNavigateToIssue={onNavigateToIssue}
             onApplyFix={onApplyFix}
           />
         )}
         {activeTab === "stats" && (
           <StatsPanel
             wordCount={wordCount}
             charCount={charCount}
             selectedCharCount={selectedCharCount}
             paragraphCount={paragraphCount}
             manuscriptPages={manuscriptPages}
             sentenceCount={sentenceCount}
             charTypeAnalysis={charTypeAnalysis}
             charUsageRates={charUsageRates}
             readabilityAnalysis={readabilityAnalysis}
           />
         )}
         {activeTab === "history" && projectMode && onHistoryRestore && (
           <HistoryPanel
             projectId={projectMode.projectId}
             mainFileName={activeFileName || projectMode.metadata.mainFile}
             onRestore={onHistoryRestore}
             currentContent={currentContent}
             onCompareInEditor={onCompareInEditor}
           />
         )}
       </div>
    </aside>
  );
}

function AIPanel() {
  return (
    <div className="space-y-4">
      <div className="bg-accent-light rounded-lg p-4 border border-border">
        <div className="flex items-start gap-3">
          <Bot className="w-5 h-5 text-accent mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-foreground mb-1">AI アシスタント</h3>
            <p className="text-xs text-foreground-tertiary">
              この機能は現在開発中です。今後のアップデートをお待ちください。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Severity filter options for the corrections panel */
type SeverityFilter = "all" | Severity;

interface CorrectionsPanelProps {
  posHighlightEnabled: boolean;
  onPosHighlightEnabledChange?: (enabled: boolean) => void;
  lintIssues: LintIssue[];
  onNavigateToIssue?: (issue: LintIssue) => void;
  onApplyFix?: (issue: LintIssue) => void;
}

/** Returns the display color class for a severity level */
function severityColor(severity: Severity): string {
  switch (severity) {
    case "error":
      return "bg-error";
    case "warning":
      return "bg-warning";
    case "info":
      return "bg-info";
  }
}

function CorrectionsPanel({
  posHighlightEnabled,
  onPosHighlightEnabledChange,
  lintIssues,
  onNavigateToIssue,
  onApplyFix,
}: CorrectionsPanelProps) {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");

  const filteredIssues = severityFilter === "all"
    ? lintIssues
    : lintIssues.filter((issue) => issue.severity === severityFilter);

  const filterOptions: { value: SeverityFilter; label: string }[] = [
    { value: "all", label: "全て" },
    { value: "error", label: "エラー" },
    { value: "warning", label: "警告" },
    { value: "info", label: "情報" },
  ];

  return (
    <div className="space-y-3">
      {/* POS highlight toggle (existing feature) */}
      <div className="bg-background-secondary rounded-lg p-3 border border-border">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-foreground">構文ハイライト</h4>
            <p className="text-xs text-foreground-tertiary mt-0.5">
              動詞・助詞などを色分け表示
            </p>
          </div>
          <button
            onClick={() => onPosHighlightEnabledChange?.(!posHighlightEnabled)}
            className={clsx(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
              posHighlightEnabled ? "bg-accent" : "bg-border-secondary"
            )}
          >
            <span
              className={clsx(
                "inline-block h-4 w-4 transform rounded-full bg-background transition-transform",
                posHighlightEnabled ? "translate-x-6" : "translate-x-1"
              )}
            />
          </button>
        </div>
        {posHighlightEnabled && (
          <p className="text-xs text-foreground-tertiary mt-2">
            色の設定は「設定 → 品詞ハイライト」で変更できます
          </p>
        )}
      </div>

      {/* Issue count summary */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground-secondary">検出結果</h3>
        <span className="text-xs text-foreground-tertiary">
          {lintIssues.length}件の問題を検出
        </span>
      </div>

      {/* Severity filter buttons */}
      <div className="flex gap-1">
        {filterOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => setSeverityFilter(option.value)}
            className={clsx(
              "flex-1 px-2 py-1 text-xs font-medium rounded transition-colors",
              severityFilter === option.value
                ? "bg-accent text-white"
                : "bg-background-secondary text-foreground-tertiary hover:text-foreground-secondary border border-border"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Issue list */}
      {filteredIssues.length === 0 ? (
        <div className="pt-4 text-center">
          <p className="text-sm text-foreground-tertiary">問題は検出されませんでした</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredIssues.map((issue, index) => (
            <button
              key={`${issue.ruleId}-${issue.from}-${issue.to}-${index}`}
              type="button"
              onClick={() => onNavigateToIssue?.(issue)}
              className="w-full text-left bg-background-secondary rounded-lg p-3 border border-border hover:border-border-secondary transition-colors"
            >
              <div className="flex items-start gap-2">
                {/* Severity indicator */}
                <span
                  className={clsx(
                    "mt-1 w-2.5 h-2.5 rounded-full shrink-0",
                    severityColor(issue.severity)
                  )}
                  title={issue.severity}
                />
                <div className="flex-1 min-w-0">
                  {/* Japanese message */}
                  <p className="text-sm text-foreground leading-snug">
                    {issue.messageJa}
                  </p>
                  {/* Position info */}
                  <p className="text-xs text-foreground-tertiary mt-1">
                    位置: {issue.from}-{issue.to}
                  </p>
                  {/* Reference info */}
                  {issue.reference && (
                    <p className="text-xs text-foreground-tertiary mt-0.5">
                      {issue.reference.standard}
                      {issue.reference.section ? ` ${issue.reference.section}` : ""}
                    </p>
                  )}
                </div>
              </div>
              {/* Fix button */}
              {issue.fix && (
                <div className="mt-2 flex justify-end">
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onApplyFix?.(issue);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        onApplyFix?.(issue);
                      }
                    }}
                    className="inline-flex items-center px-2 py-1 text-xs font-medium text-accent hover:text-accent-hover bg-accent/10 hover:bg-accent/20 rounded transition-colors cursor-pointer"
                  >
                    修正: {issue.fix.labelJa}
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


// 情報アイコン用のツールチップ
function InfoTooltip({ content, className, children }: { content: string; className?: string; children: ReactNode }) {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0, placement: 'top' as 'top' | 'bottom' });
  const ref = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  
  const handleMouseEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setTooltipPos({
        top: rect.top - 8,
        left: rect.left + rect.width / 2,
        placement: 'top',
      });
    }
    setIsVisible(true);
  };

  useEffect(() => {
    if (!isVisible || !tooltipRef.current || !ref.current) return;
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const iconRect = ref.current.getBoundingClientRect();
    const margin = 8;

    let left = iconRect.left + iconRect.width / 2;
    const minLeft = margin + tooltipRect.width / 2;
    const maxLeft = window.innerWidth - margin - tooltipRect.width / 2;
    if (left < minLeft) left = minLeft;
    if (left > maxLeft) left = maxLeft;

    let top = iconRect.top - 8;
    let placement: 'top' | 'bottom' = 'top';
    if (top - tooltipRect.height < margin) {
      top = iconRect.bottom + 8;
      placement = 'bottom';
    }

    setTooltipPos({ top, left, placement });
  }, [isVisible]);
  
  return (
    <span 
      ref={ref}
      className={clsx("info-tooltip-wrapper cursor-help", className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <span 
          ref={tooltipRef}
          className="info-tooltip-content"
          style={{
            position: 'fixed',
            top: `${tooltipPos.top}px`,
            left: `${tooltipPos.left}px`,
            transform: tooltipPos.placement === 'top'
              ? 'translateX(-50%) translateY(-100%)'
              : 'translateX(-50%) translateY(0)'
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}

function StatsPanel({
  wordCount: _wordCount,
  charCount,
  selectedCharCount,
  paragraphCount,
  manuscriptPages,
  sentenceCount = 0,
  charTypeAnalysis,
  charUsageRates,
  readabilityAnalysis,
}: {
  wordCount: number;
  charCount: number;
  selectedCharCount: number;
  paragraphCount: number;
  manuscriptPages: number;
  sentenceCount?: number;
  charTypeAnalysis?: {
    kanji: number;
    hiragana: number;
    katakana: number;
    other: number;
    total: number;
  };
  charUsageRates?: {
    kanjiRate: number;
    hiraganaRate: number;
    katakanaRate: number;
  };
  readabilityAnalysis?: {
    score: number;
    level: string;
    avgSentenceLength: number;
    avgPunctuationSpacing: number;
  };
}) {
  // 選択範囲の分析かどうか
  const isSelection = selectedCharCount > 0;
  const activeCharCount = isSelection ? selectedCharCount : charCount;

  // 1. 文字数の詳細（概算）
  // 本文文字数を概算（空白・約物などを除外）
  // 注意: ここでは簡易推定。厳密にはエディタの生テキストを用いる
  // 約物は全体の 10-15% 程度と仮定
  const estimatedPunctuation = Math.floor(activeCharCount * 0.12);
  const pureTextCount = activeCharCount - estimatedPunctuation;
  const punctuationRatio = activeCharCount > 0 ? (estimatedPunctuation / activeCharCount * 100).toFixed(1) : '0.0';

   // 文体の判定
   let styleHint = '';
   const ratio = parseFloat(punctuationRatio);
   if (ratio > 15) {
     styleHint = '会話文が中心';
   } else if (ratio < 8) {
     styleHint = '地の文が中心';
   } else {
     styleHint = 'バランス型';
   }

  // 2. 段落構成
  const avgParagraphLength = paragraphCount > 0 ? Math.floor(activeCharCount / paragraphCount) : 0;

  let paragraphWarning = '';
  if (avgParagraphLength >= 300) {
    paragraphWarning =
        '一段落に含まれる情報量がやや多いようです。内容のまとまりごとに区切ると、読みやすさが向上するかもしれません。';

  } else if (avgParagraphLength >= 200) {
    paragraphWarning =
        '読み応えのある段落構成です。公的文書や解説文としては安定していますが、スマホでは少し長く感じられる場合があります。';

  } else if (avgParagraphLength >= 120) {
    paragraphWarning =
        '段落の長さは標準的で、エッセイや一般的な文章に適した構成です。落ち着いて読み進められます。';

  } else if (avgParagraphLength >= 80) {
    paragraphWarning =
        '小説向きの自然な段落長です。文章のリズムと情報量のバランスが保たれています。';

  } else if (avgParagraphLength > 0) {
    paragraphWarning =
        '段落がコンパクトで、テンポよく読めます。会話やスマホでの読書に向いた構成です。';
  }

  // 3. 読了時間（シーン別の目安）
  const calculateReadTime = (charsPerMinute: number) => {
    if (activeCharCount === 0) return '0秒';
    const minutes = Math.floor(activeCharCount / charsPerMinute);
    const seconds = Math.round((activeCharCount % charsPerMinute) / charsPerMinute * 60);

    if (minutes === 0) {
      return `${seconds}秒`;
    } else if (seconds === 0) {
      return `${minutes}分`;
    } else {
      return `${minutes}分${seconds}秒`;
    }
  };

   const fastReadTime = calculateReadTime(900);    // 速読
   const normalReadTime = calculateReadTime(500);  // 通常読書
   const deepReadTime = calculateReadTime(250);    // 精読

    const getReadabilityLevelLabel = (level?: string) => {
      switch (level) {
        case 'easy':
          return 'やさしい';
        case 'normal':
          return '標準';
        case 'difficult':
          return '難しい';
        default:
          return '未分析';
      }
    };

    return (
      <div className="space-y-3 stats-panel">
        {/* 0. 原稿用紙枚数（全体のみ表示、トップに配置） */}
        {!isSelection && (
          <div className="bg-background-secondary rounded-lg p-3 border border-border flex items-center justify-between">
            <div>
              <p className="text-xs text-foreground-tertiary font-medium mb-1 flex items-center">
                <InfoTooltip content="400字詰め原稿用紙に換算した枚数">
                  原稿用紙
                </InfoTooltip>
              </p>
              <p className="text-xs text-foreground-tertiary">400字詰原稿用紙</p>
            </div>
            <span className="text-sm font-bold text-foreground">{manuscriptPages}枚</span>
          </div>
        )}

        {/* 見出し: 分析対象を動的に表示 */}
        <div className="flex items-center justify-between">
          <h3 className="stats-header">
            {isSelection ? '選択範囲の分析' : '全体の統計'}
          </h3>
          {isSelection && (
            <span className="text-xs px-2 py-1 rounded-full bg-accent/20 text-accent font-medium">
              選択中
            </span>
          )}
        </div>

        {/* 1. 可読性分析 (Readability) - Featured Section */}
        {readabilityAnalysis && !isSelection && (
          <div className="bg-background-secondary rounded-lg p-4 border border-border">
            <h4 className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide mb-3">
               読みやすさ
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 min-w-0">
                  <InfoTooltip
                    content="文章の読みやすさを100点満点で評価。文の長さや句読点の配置から算出"
                    className="text-sm text-foreground-secondary whitespace-nowrap"
                  >
                    スコア
                  </InfoTooltip>
                </div>
                <div className="flex items-baseline gap-1 flex-shrink-0">
                  <span className="text-xl font-bold text-foreground">{readabilityAnalysis.score}</span>
                  <span className="text-xs text-foreground-tertiary">/100</span>
                </div>
              </div>
               <div className="w-full h-2 bg-background rounded-full overflow-hidden border border-border-secondary">
                 <div
                   className="h-full transition-all"
                   style={{
                     width: `${readabilityAnalysis.score}%`,
                     backgroundColor: `var(--progress-readability)`,
                   }}
                 />
               </div>
              <div className="flex justify-between items-baseline gap-2">
                <div className="flex items-center gap-1 min-w-0">
                  <InfoTooltip
                    content={`80点以上：やさしい
50-79点：普通
50点未満：難しい`}
                    className="text-sm text-foreground-secondary whitespace-nowrap"
                  >
                    難易度
                  </InfoTooltip>
                </div>
                <span className="text-sm font-semibold text-foreground flex-shrink-0">
                  {getReadabilityLevelLabel(readabilityAnalysis.level)}
                </span>
              </div>
              <div className="pt-1 border-t border-border space-y-1">
                <div className="flex justify-between items-baseline text-xs gap-2">
                  <div className="flex items-center gap-1 min-w-0">
                    <InfoTooltip
                      content="1文あたりの平均文字数。40字以上は長め、20字以下は短めの文章"
                      className="text-foreground-tertiary whitespace-nowrap"
                    >
                      一文平均
                    </InfoTooltip>
                  </div>
                  <span className="text-foreground flex-shrink-0 text-sm">{readabilityAnalysis.avgSentenceLength}字/文</span>
                </div>
                <div className="flex justify-between items-baseline text-xs gap-2">
                  <div className="flex items-center gap-1 min-w-0">
                    <InfoTooltip
                      content="句読点（、。）の間の平均文字数。15字以下が読みやすい"
                      className="text-foreground-tertiary whitespace-nowrap"
                    >
                      句読点間隔
                    </InfoTooltip>
                  </div>
                  <span className="text-foreground flex-shrink-0 text-sm">{readabilityAnalysis.avgPunctuationSpacing}字</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. 文字数内訳 */}
        <div className="bg-background-secondary rounded-lg p-4 border border-border">
          <h4 className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide mb-3">
             文字数
          </h4>
          <div className="space-y-1.5">
            <div className="flex justify-between items-baseline gap-2">
              <div className="flex items-center gap-1 min-w-0">
                <InfoTooltip
                  content="空白・改行を含むすべての文字数（原稿用紙換算の基準）"
                  className="text-sm text-foreground-secondary whitespace-nowrap"
                >
                  総字数
                </InfoTooltip>
              </div>
              <span className="text-base font-semibold text-foreground flex-shrink-0">{activeCharCount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-baseline gap-2">
              <div className="flex items-center gap-1 min-w-0">
                <InfoTooltip
                  content="文末の句点（。）で区切られる文の数"
                  className="text-sm text-foreground-secondary whitespace-nowrap"
                >
                  文章数
                </InfoTooltip>
              </div>
              <span className="text-sm font-medium text-foreground flex-shrink-0">{sentenceCount}文</span>
            </div>
            {sentenceCount > 0 && (
              <div className="flex justify-between items-baseline gap-2">
                <div className="flex items-center gap-1 min-w-0">
                  <InfoTooltip
                    content="1文あたりの平均文字数。短いほど読みやすい"
                    className="text-sm text-foreground-secondary whitespace-nowrap"
                  >
                    一文平均
                  </InfoTooltip>
                </div>
                <span className="text-sm font-medium text-foreground flex-shrink-0">
                  {readabilityAnalysis ? `${readabilityAnalysis.avgSentenceLength}字/文` : '-'}
                </span>
              </div>
            )}
            <div className="flex justify-between items-baseline gap-2">
              <div className="flex items-center gap-1 min-w-0">
                <InfoTooltip
                  content="句読点・記号を除いた本文のみの文字数"
                  className="text-sm text-foreground-secondary whitespace-nowrap"
                >
                  本文字数
                </InfoTooltip>
              </div>
              <span className="text-sm font-medium text-foreground flex-shrink-0">{pureTextCount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-baseline gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <InfoTooltip
                    content="記号・句読点の割合。15%超：会話文中心、8%未満：地の文中心"
                    className="text-sm text-foreground-secondary whitespace-nowrap"
                  >
                    約物比率
                  </InfoTooltip>
                </div>
                <div className="text-xs text-foreground-tertiary">({styleHint})</div>
              </div>
              <span className="text-sm font-medium text-foreground flex-shrink-0">
                {punctuationRatio}%
              </span>
            </div>
          </div>
        </div>

        {/* 3. 文字種内訳 (Character Type Analysis) */}
        {charTypeAnalysis && !isSelection && (
          <div className="bg-background-secondary rounded-lg p-4 border border-border">
            <h4 className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide mb-3">
               文字種別
            </h4>
            <div className="space-y-1.5">
              <div className="flex justify-between items-baseline gap-2">
                <div className="flex items-center gap-1 min-w-0">
                  <InfoTooltip
                    content="漢字の使用数と割合。一般的に20-30%が読みやすい"
                    className="text-sm text-foreground-secondary whitespace-nowrap"
                  >
                    漢字
                  </InfoTooltip>
                </div>
                <span className="text-sm font-medium text-foreground flex-shrink-0">
                  {charTypeAnalysis.kanji} 字 {charUsageRates ? `(${charUsageRates.kanjiRate.toFixed(1)}%)` : ''}
                </span>
              </div>
              <div className="flex justify-between items-baseline gap-2">
                <div className="flex items-center gap-1 min-w-0">
                  <InfoTooltip
                    content="ひらがなの使用数と割合。通常50-70%程度"
                    className="text-sm text-foreground-secondary whitespace-nowrap"
                  >
                    ひらがな
                  </InfoTooltip>
                </div>
                <span className="text-sm font-medium text-foreground flex-shrink-0">
                  {charTypeAnalysis.hiragana} 字 {charUsageRates ? `(${charUsageRates.hiraganaRate.toFixed(1)}%)` : ''}
                </span>
              </div>
              <div className="flex justify-between items-baseline gap-2">
                <div className="flex items-center gap-1 min-w-0">
                  <InfoTooltip
                    content="カタカナの使用数と割合。外来語や擬音語に使用"
                    className="text-sm text-foreground-secondary whitespace-nowrap"
                  >
                    カタカナ
                  </InfoTooltip>
                </div>
                <span className="text-sm font-medium text-foreground flex-shrink-0">
                  {charTypeAnalysis.katakana} 字 {charUsageRates ? `(${charUsageRates.katakanaRate.toFixed(1)}%)` : ''}
                </span>
              </div>
              {charTypeAnalysis.other > 0 && (
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-foreground-secondary">その他</span>
                  <span className="text-sm font-medium text-foreground">{charTypeAnalysis.other}字</span>
                </div>
              )}
               {/* 文字種の分布バー */}
              <div className="pt-1 space-y-1">
                <div className="h-6 flex rounded-md overflow-hidden bg-background border border-border-secondary">
                  {charTypeAnalysis.total > 0 && (
                    <>
                      {charTypeAnalysis.kanji > 0 && (
                        <div 
                          className="flex items-center justify-center text-white text-xs font-semibold"
                          style={{ 
                            width: `${(charTypeAnalysis.kanji / charTypeAnalysis.total) * 100}%`,
                            backgroundColor: `var(--progress-kanji)`
                          }}
                          title={`漢字: ${charTypeAnalysis.kanji}`}
                        />
                      )}
                      {charTypeAnalysis.hiragana > 0 && (
                        <div 
                          className="flex items-center justify-center text-white text-xs font-semibold"
                          style={{ 
                            width: `${(charTypeAnalysis.hiragana / charTypeAnalysis.total) * 100}%`,
                            backgroundColor: `var(--progress-hiragana)`
                          }}
                          title={`ひらがな: ${charTypeAnalysis.hiragana}`}
                        />
                      )}
                      {charTypeAnalysis.katakana > 0 && (
                        <div 
                          className="flex items-center justify-center text-white text-xs font-semibold"
                          style={{ 
                            width: `${(charTypeAnalysis.katakana / charTypeAnalysis.total) * 100}%`,
                            backgroundColor: `var(--progress-katakana)`
                          }}
                          title={`カタカナ: ${charTypeAnalysis.katakana}`}
                        />
                      )}
                      {charTypeAnalysis.other > 0 && (
                        <div 
                          className="flex items-center justify-center text-white text-xs font-semibold"
                          style={{ 
                            width: `${(charTypeAnalysis.other / charTypeAnalysis.total) * 100}%`,
                            backgroundColor: `var(--progress-other)`
                          }}
                          title={`その他: ${charTypeAnalysis.other}`}
                        />
                      )}
                    </>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `var(--progress-kanji)` }} />
                    <span className="text-foreground-tertiary">漢字</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `var(--progress-hiragana)` }} />
                    <span className="text-foreground-tertiary">ひらがな</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `var(--progress-katakana)` }} />
                    <span className="text-foreground-tertiary">カタカナ</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `var(--progress-other)` }} />
                    <span className="text-foreground-tertiary">その他</span>
                  </div>
                </div>
             </div>
           </div>
         </div>
       )}

        {/* 4. 段落構成 */}
        <div className="bg-background-secondary rounded-lg p-4 border border-border">
          <h4 className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide mb-3">
             段落
          </h4>
          <div className="space-y-1.5">
            <div className="flex justify-between items-baseline gap-2">
              <div className="flex items-center gap-1 min-w-0">
                <InfoTooltip
                  content="改行で区切られる段落の総数"
                  className="text-sm text-foreground-secondary whitespace-nowrap"
                >
                  段落数
                </InfoTooltip>
              </div>
              <span className="text-base font-semibold text-foreground flex-shrink-0">{paragraphCount}</span>
            </div>
            <div className="flex justify-between items-baseline gap-2">
              <div className="flex items-center gap-1 min-w-0">
                <InfoTooltip
                  content="段落構成の傾向を見るための指標です。良し悪しを示すものではなく、文章設計を振り返るための参考値です。"
                  className="text-sm text-foreground-secondary whitespace-nowrap"
                >
                  一段落平均
                </InfoTooltip>
              </div>
              <span className="text-sm font-medium text-foreground flex-shrink-0">{avgParagraphLength}字/段</span>
            </div>
           {paragraphWarning && (
             <div className="mt-2">
               <div className="h-px bg-border" />
                <small className="mt-2 block text-[10px] text-foreground/50">
                  補足: {paragraphWarning}
                </small>
             </div>
           )}
         </div>
       </div>

        {/* 5. 読了時間（目安） */}
        <div className="bg-background-secondary rounded-lg p-4 border border-border">
          <h4 className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide mb-3">
             読了時間
          </h4>
          <div className="space-y-1.5">
            <div className="flex justify-between items-baseline gap-2">
              <div className="flex items-center gap-1 min-w-0">
                <InfoTooltip
                  content="分速900字で計算"
                  className="text-sm text-foreground-secondary whitespace-nowrap"
                >
                  速読時
                </InfoTooltip>
              </div>
              <span className="text-sm font-medium text-foreground flex-shrink-0">{fastReadTime}</span>
            </div>
            <div className="flex justify-between items-baseline gap-2">
              <div className="flex items-center gap-1 min-w-0">
                <InfoTooltip
                  content="通常の読書速度（分速500字、日本語の平均的な速度）"
                  className="text-sm text-foreground-secondary whitespace-nowrap"
                >
                  通常時
                </InfoTooltip>
              </div>
              <span className="text-sm font-medium text-foreground flex-shrink-0">{normalReadTime}</span>
            </div>
            <div className="flex justify-between items-baseline gap-2">
              <div className="flex items-center gap-1 min-w-0">
                <InfoTooltip
                  content="じっくり読む速度（分速250字で計算）"
                  className="text-sm text-foreground-secondary whitespace-nowrap"
                >
                  精読時
                </InfoTooltip>
              </div>
              <span className="text-sm font-medium text-foreground flex-shrink-0">{deepReadTime}</span>
            </div>
          </div>
        </div>



     </div>
   );
}


