"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, AlertCircle, BarChart3, Edit2, X, History } from "lucide-react";
import clsx from "clsx";

import { useEditorMode } from "@/contexts/EditorModeContext";
import { localPreferences } from "@/lib/local-preferences";
import HistoryPanel from "./HistoryPanel";
import AIPanel from "./inspector/AIPanel";
import CorrectionsPanel from "./inspector/CorrectionsPanel";
import StatsPanel from "./inspector/StatsPanel";

import type { ProjectMode } from "@/lib/project-types";
import type { InspectorProps } from "./inspector/types";
import type { Tab } from "./inspector/types";
import { isValidTab, getMdiExtension, getBaseName } from "./inspector/types";

export default function Inspector({
  className,
  compactMode = false,
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
  onOpenPosHighlightSettings,
  onHistoryRestore,
  activeFileName,
  currentContent = "",
  onCompareInEditor,
  lintIssues,
  onNavigateToIssue,
  onApplyFix,
  onIgnoreCorrection,
  onRefreshLinting,
  isLinting = false,
  activeLintIssueIndex,
  onOpenLintingSettings,
  onApplyLintPreset,
  activeLintPresetId,
  switchToCorrectionsTrigger = 0,
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
    const raw = localPreferences.getRightTab();
    const storedTab = isValidTab(raw) ? raw : null;
    if (storedTab) {
      setActiveTab(storedTab);
    }
    hasLoadedRef.current = true;
    setIsTabReady(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current) return;
    localPreferences.setRightTab(activeTab);
  }, [activeTab]);

  // Switch to corrections tab when triggered externally (e.g. context menu "校正提示を表示")
  useEffect(() => {
    if (switchToCorrectionsTrigger > 0) {
      setActiveTab("corrections");
    }
  }, [switchToCorrectionsTrigger]);

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

   const formatTime = (timestamp: number | null): string => {
     if (!timestamp || timestamp <= 0) return "未保存";
     const date = new Date(timestamp);
     if (isNaN(date.getTime())) return "未保存";
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
             onOpenPosHighlightSettings={onOpenPosHighlightSettings}
             lintIssues={lintIssues ?? []}
             onNavigateToIssue={onNavigateToIssue}
             onApplyFix={onApplyFix}
             onIgnoreCorrection={onIgnoreCorrection}
             onRefreshLinting={onRefreshLinting}
             isLinting={isLinting}
             activeLintIssueIndex={activeLintIssueIndex}
             onOpenLintingSettings={onOpenLintingSettings}
             onApplyLintPreset={onApplyLintPreset}
             activeLintPresetId={activeLintPresetId}
           />
         )}
         {activeTab === "stats" && (
           <StatsPanel
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

      {/* Privacy notice */}
      <section aria-label="プライバシーに関するお知らせ" className={clsx("border-t border-border text-center text-[10px] text-foreground-tertiary leading-tight", compactMode ? "px-3 py-1.5" : "px-4 py-2")}>
        <p className="mb-1">illusionsはあなたの作品の無断保存およびAI学習への利用は行いません</p>
        <a href="https://github.com/Iktahana/illusions/issues/new" target="_blank" rel="noopener noreferrer" className="hover:text-foreground-secondary transition-colors" aria-label="AIに関する不適切な提案をGitHubで報告する">AIに関する不適切な提案を報告</a>
      </section>
    </aside>
  );
}
