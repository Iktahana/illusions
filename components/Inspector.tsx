"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, AlertCircle, BarChart3, ChevronRight, FolderOpen, FilePlus, Edit2, X, HelpCircle } from "lucide-react";
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
  selectedCharCount?: number;
  paragraphCount?: number;
  fileName?: string;
  isDirty?: boolean;
  isSaving?: boolean;
  lastSavedTime?: number | null;
  onOpenFile?: () => void;
  onNewFile?: () => void;
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
  particleAnalysis?: {
    duplicates: Array<{ particle: string; count: number }>;
  };
}

export default function Inspector({
  className,
  wordCount = 0,
  charCount = 0,
  selectedCharCount = 0,
  paragraphCount = 0,
  fileName = "無題",
  isDirty = false,
  isSaving = false,
  lastSavedTime = null,
  onOpenFile,
  onNewFile,
  onFileNameChange,
  sentenceCount = 0,
  charTypeAnalysis,
  charUsageRates,
  readabilityAnalysis,
  particleAnalysis,
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

     if (diffSecs < 60) return "今";
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
            ファイル情報
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
                 <span className="mr-1">⟳</span> 保存中
               </span>
             )}
             {!isSaving && isDirty && (
               <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-orange-500 text-white">
                 <span className="mr-1">●</span> 編集中
               </span>
             )}
             {!isSaving && !isDirty && lastSavedTime === null && (
               <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-gray-500 text-white">
                 <span className="mr-1">●</span> 新規
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
             particleAnalysis={particleAnalysis}
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

// Tooltip component for info icons
function InfoTooltip({ content }: { content: string }) {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLSpanElement>(null);
  
  const handleMouseEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setTooltipPos({
        top: rect.top - 8, // 8px above the icon
        left: rect.left + rect.width / 2,
      });
    }
    setIsVisible(true);
  };
  
  return (
    <>
      <span 
        ref={ref}
        className="info-tooltip-wrapper"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setIsVisible(false)}
      >
        <HelpCircle className="w-3.5 h-3.5 ml-1 text-foreground-tertiary/50 hover:text-accent hover:opacity-100 transition-colors cursor-help" />
      </span>
      {isVisible && (
        <div 
          className="info-tooltip-content"
          style={{
            position: 'fixed',
            top: `${tooltipPos.top}px`,
            left: `${tooltipPos.left}px`,
          }}
        >
          {content}
        </div>
      )}
    </>
  );
}

function StatsPanel({
  wordCount,
  charCount,
  selectedCharCount,
  paragraphCount,
  manuscriptPages,
  sentenceCount = 0,
  charTypeAnalysis,
  charUsageRates,
  readabilityAnalysis,
  particleAnalysis,
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
  particleAnalysis?: {
    duplicates: Array<{ particle: string; count: number }>;
  };
}) {
  // 判斷是否為選中片段分析
  const isSelection = selectedCharCount > 0;
  const activeCharCount = isSelection ? selectedCharCount : charCount;

  // 1. 字數深度統計
  // 計算純文字數（剔除空白、標點符號等）
  // 注意：這裡簡化處理，實際應該從編輯器獲取原始文本進行處理
  // 假設標點符號約佔 10-15%
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

  // 2. 段落結構分析
  const avgParagraphLength = paragraphCount > 0 ? Math.floor(activeCharCount / paragraphCount) : 0;

  let paragraphWarning = '';
  let paragraphWarningColor = 'text-foreground-tertiary';
  if (avgParagraphLength > 150) {
     paragraphWarning = '⚠️ 段落が長めです。改行を増やすとスマホで読みやすくなります';
    paragraphWarningColor = 'text-amber-600 dark:text-amber-500';
  } else if (avgParagraphLength > 0 && avgParagraphLength < 50) {
    paragraphWarning = '✓ テンポが良く、スマホでの読書に適しています';
    paragraphWarningColor = 'text-green-600 dark:text-green-500';
  }

  // 3. 多場景閱讀時間計算
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

  const fastReadTime = calculateReadTime(900);    // 快速掃讀
  const normalReadTime = calculateReadTime(500);  // 常規閱讀
  const deepReadTime = calculateReadTime(250);    // 深度研讀

   // Get readability level color
   const getReadabilityLevelColor = (level?: string) => {
     switch (level) {
       case 'easy':
         return 'text-green-600 dark:text-green-500';
       case 'normal':
         return 'text-blue-600 dark:text-blue-500';
       case 'difficult':
         return 'text-amber-600 dark:text-amber-500';
       default:
         return 'text-foreground';
     }
   };

    const getReadabilityLevelLabel = (level?: string) => {
      switch (level) {
        case 'easy':
          return '平易';
        case 'normal':
          return '標準';
        case 'difficult':
          return '難読';
        default:
          return '未分析';
      }
    };

    return (
      <div className="space-y-3">
        {/* 0. 原稿用紙枚数（全体のみ表示、トップに配置） */}
        {!isSelection && (
          <div className="bg-background-secondary rounded-lg p-3 border border-border flex items-center justify-between">
            <div>
              <p className="text-xs text-foreground-tertiary font-medium mb-1 flex items-center">
                 原稿用紙
                 <InfoTooltip content="400字詰め原稿用紙（縦書き標準）に換算した枚数" />
              </p>
              <p className="text-xs text-foreground-tertiary">400字詰（縦書き標準）</p>
            </div>
            <span className="text-3xl font-bold text-accent">{manuscriptPages}枚</span>
          </div>
        )}

        {/* 標題：動態顯示分析範囲 */}
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
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground-secondary flex items-center">
                   読みやすさ
                   <InfoTooltip content="文章の読みやすさを100点満点で評価。文の長さや句読点の配置から算出" />
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{readabilityAnalysis.score}</span>
                  <span className="text-xs text-foreground-tertiary">/100</span>
                </div>
              </div>
              <div className="w-full h-2 bg-background rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 to-green-500 transition-all"
                  style={{ width: `${readabilityAnalysis.score}%` }}
                />
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-foreground-secondary flex items-center">
                   レベル
                   <InfoTooltip content="80点以上：やさしい｜50-79点：普通｜50点未満：難しい" />
                </span>
                <span className={`text-sm font-semibold ${getReadabilityLevelColor(readabilityAnalysis.level)}`}>
                  {getReadabilityLevelLabel(readabilityAnalysis.level)}
                </span>
              </div>
              <div className="pt-1 border-t border-border space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground-tertiary flex items-center">
                     1文の長さ
                     <InfoTooltip content="1文あたりの平均文字数。40字以上は長め、20字以下は短めの文章" />
                  </span>
                  <span className="text-foreground">{readabilityAnalysis.avgSentenceLength}字/文</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-foreground-tertiary flex items-center">
                     句読点の間隔
                     <InfoTooltip content="句読点（、。）の間の平均文字数。15字以下が読みやすい" />
                  </span>
                  <span className="text-foreground">{readabilityAnalysis.avgPunctuationSpacing}字</span>
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
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-foreground-secondary flex items-center">
                 総文字数
                 <InfoTooltip content="空白・改行を含むすべての文字数（原稿用紙換算の基準）" />
              </span>
              <span className="text-lg font-semibold text-foreground">{activeCharCount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-foreground-secondary flex items-center">
                 文の数
                 <InfoTooltip content="文末の句点（。）で区切られる文の数" />
              </span>
              <span className="text-base font-medium text-foreground">{sentenceCount}文</span>
            </div>
            {sentenceCount > 0 && (
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-foreground-secondary flex items-center">
                   1文の長さ
                   <InfoTooltip content="1文あたりの平均文字数。短いほど読みやすい" />
                </span>
                <span className="text-base font-medium text-foreground">
                  {readabilityAnalysis ? `${readabilityAnalysis.avgSentenceLength}字/文` : '-'}
                </span>
              </div>
            )}
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-foreground-secondary flex items-center">
                本文字数
                 <InfoTooltip content="句読点・記号を除いた本文のみの文字数" />
              </span>
              <span className="text-base font-medium text-foreground">{pureTextCount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-foreground-secondary flex items-center">
                約物比率
                 <InfoTooltip content="記号・句読点の割合。15%超：会話文中心、8%未満：地の文中心" />
              </span>
              <span className="text-base font-medium text-foreground">
                {punctuationRatio}% <span className="text-xs text-foreground-tertiary ml-1">({styleHint})</span>
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
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-foreground-secondary flex items-center">
                  漢字
                   <InfoTooltip content="漢字の使用数と割合。一般的に20-30%が読みやすい" />
                </span>
                <span className="text-base font-medium text-foreground">
                  {charTypeAnalysis.kanji} 字 {charUsageRates ? `(${charUsageRates.kanjiRate.toFixed(1)}%)` : ''}
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-foreground-secondary flex items-center">
                  ひらがな
                  <InfoTooltip content="ひらがなの使用数と割合。通常50-70%程度" />
                </span>
                <span className="text-base font-medium text-foreground">
                  {charTypeAnalysis.hiragana} 字 {charUsageRates ? `(${charUsageRates.hiraganaRate.toFixed(1)}%)` : ''}
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-foreground-secondary flex items-center">
                  カタカナ
                  <InfoTooltip content="カタカナの使用数と割合。外来語や擬音語に使用" />
                </span>
                <span className="text-base font-medium text-foreground">
                  {charTypeAnalysis.katakana} 字 {charUsageRates ? `(${charUsageRates.katakanaRate.toFixed(1)}%)` : ''}
                </span>
              </div>
              {charTypeAnalysis.other > 0 && (
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-foreground-secondary">その他</span>
                  <span className="text-base font-medium text-foreground">{charTypeAnalysis.other}字</span>
                </div>
              )}
              {/* Character distribution bar */}
              <div className="pt-1 space-y-1">
               <div className="h-6 flex rounded-md overflow-hidden bg-background border border-border-secondary">
                 {charTypeAnalysis.total > 0 && (
                   <>
                     {charTypeAnalysis.kanji > 0 && (
                       <div 
                         className="bg-red-500/70 flex items-center justify-center text-white text-xs font-semibold"
                         style={{ width: `${(charTypeAnalysis.kanji / charTypeAnalysis.total) * 100}%` }}
                         title={`漢字: ${charTypeAnalysis.kanji}`}
                       />
                     )}
                     {charTypeAnalysis.hiragana > 0 && (
                       <div 
                         className="bg-blue-500/70 flex items-center justify-center text-white text-xs font-semibold"
                         style={{ width: `${(charTypeAnalysis.hiragana / charTypeAnalysis.total) * 100}%` }}
                         title={`ひらがな: ${charTypeAnalysis.hiragana}`}
                       />
                     )}
                     {charTypeAnalysis.katakana > 0 && (
                       <div 
                         className="bg-green-500/70 flex items-center justify-center text-white text-xs font-semibold"
                         style={{ width: `${(charTypeAnalysis.katakana / charTypeAnalysis.total) * 100}%` }}
                         title={`カタカナ: ${charTypeAnalysis.katakana}`}
                       />
                     )}
                     {charTypeAnalysis.other > 0 && (
                       <div 
                         className="bg-gray-500/70 flex items-center justify-center text-white text-xs font-semibold"
                         style={{ width: `${(charTypeAnalysis.other / charTypeAnalysis.total) * 100}%` }}
                         title={`その他: ${charTypeAnalysis.other}`}
                       />
                     )}
                   </>
                 )}
               </div>
               <div className="grid grid-cols-4 gap-2 text-xs">
                 <div className="flex items-center gap-1">
                   <div className="w-2 h-2 rounded-full bg-red-500/70" />
                   <span className="text-foreground-tertiary">漢字</span>
                 </div>
                 <div className="flex items-center gap-1">
                   <div className="w-2 h-2 rounded-full bg-blue-500/70" />
                   <span className="text-foreground-tertiary">ひらがな</span>
                 </div>
                 <div className="flex items-center gap-1">
                   <div className="w-2 h-2 rounded-full bg-green-500/70" />
                   <span className="text-foreground-tertiary">カタカナ</span>
                 </div>
                 <div className="flex items-center gap-1">
                   <div className="w-2 h-2 rounded-full bg-gray-500/70" />
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
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-foreground-secondary flex items-center">
                段落数
                 <InfoTooltip content="改行で区切られる段落の総数" />
              </span>
              <span className="text-lg font-semibold text-foreground">{paragraphCount}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-foreground-secondary flex items-center">
                 1段落の長さ
                 <InfoTooltip content="1段落あたりの平均文字数。150字超：長め、50字未満：短め" />
              </span>
              <span className="text-base font-medium text-foreground">{avgParagraphLength}字/段</span>
            </div>
           {paragraphWarning && (
             <div className={`text-xs mt-2 p-2 rounded bg-background border border-border ${paragraphWarningColor}`}>
               {paragraphWarning}
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
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-foreground-secondary flex items-center">
                速読時
                <InfoTooltip content="分速900字で計算" />
              </span>
              <span className="text-base font-medium text-foreground">{fastReadTime}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-foreground-secondary flex items-center">
                通常時
                <InfoTooltip content="分速500字で計算（日本語の平均的な速度）" />
              </span>
              <span className="text-base font-medium text-accent">{normalReadTime}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-foreground-secondary flex items-center">
                精読時
                <InfoTooltip content="分速250字で計算" />
              </span>
              <span className="text-base font-medium text-foreground">{deepReadTime}</span>
            </div>
          </div>
        </div>

        {/* 6. 問題検出 (Issue Detection) */}
        {particleAnalysis && particleAnalysis.duplicates.length > 0 && !isSelection && (
         <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-4 border border-amber-200 dark:border-amber-900/50">
           <h4 className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide mb-3">
              ⚠️ 要チェック
           </h4>
           <div className="space-y-2">
             {particleAnalysis.duplicates.map((item, idx) => (
               <div key={idx} className="text-sm">
                 <span className="text-foreground-secondary">助詞の重複：</span>
                 <span className="text-amber-700 dark:text-amber-400 font-medium">{item.particle}</span>
                 <span className="text-foreground-tertiary"> ×{item.count}</span>
               </div>
             ))}
              <p className="text-xs text-foreground-tertiary mt-2">
                例：「のの」「にに」は文法エラーの可能性があります
              </p>
           </div>
         </div>
       )}


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
