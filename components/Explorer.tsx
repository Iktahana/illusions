"use client";

import { ReactNode, useMemo, useState, useEffect } from "react";
import { 
  FolderTree, 
  Settings, 
  Palette, 
  ChevronRight,
  FileText,
  Plus,
  X
} from "lucide-react";
import clsx from "clsx";
import { parseMarkdownChapters, type Chapter } from "@/lib/utils";
import { FEATURED_JAPANESE_FONTS, ALL_JAPANESE_FONTS, loadGoogleFont } from "@/lib/fonts";

type Tab = "chapters" | "settings" | "style";

const formattingMarkers = ["**", "__", "~~", "*", "_", "`", "["];

function renderFormattedTitle(title: string): ReactNode {
  let nodeCounter = 0;
  const nextKey = () => `formatted-${nodeCounter++}`;

  const findNextSpecial = (segment: string, start: number) => {
    let next = segment.length;

    formattingMarkers.forEach((marker) => {
      const pos = segment.indexOf(marker, start + 1);
      if (pos !== -1 && pos < next) {
        next = pos;
      }
    });

    return next;
  };

  const parseSegment = (segment: string): ReactNode[] => {
    const nodes: ReactNode[] = [];
    let idx = 0;

    while (idx < segment.length) {
      if (segment.startsWith("**", idx)) {
        const end = segment.indexOf("**", idx + 2);
        if (end > idx + 1) {
          nodes.push(
            <strong key={nextKey()} className="font-semibold text-slate-900">
              {parseSegment(segment.slice(idx + 2, end))}
            </strong>
          );
          idx = end + 2;
          continue;
        }
      }

      if (segment.startsWith("__", idx)) {
        const end = segment.indexOf("__", idx + 2);
        if (end > idx + 1) {
          nodes.push(
            <strong key={nextKey()} className="font-semibold text-slate-900">
              {parseSegment(segment.slice(idx + 2, end))}
            </strong>
          );
          idx = end + 2;
          continue;
        }
      }

      if (segment.startsWith("~~", idx)) {
        const end = segment.indexOf("~~", idx + 2);
        if (end > idx + 1) {
          nodes.push(
            <span key={nextKey()} className="text-slate-500 line-through">
              {parseSegment(segment.slice(idx + 2, end))}
            </span>
          );
          idx = end + 2;
          continue;
        }
      }

      if (segment.startsWith("*", idx) && !segment.startsWith("**", idx)) {
        const end = segment.indexOf("*", idx + 1);
        if (end > idx) {
          nodes.push(
            <em key={nextKey()} className="italic text-slate-700">
              {parseSegment(segment.slice(idx + 1, end))}
            </em>
          );
          idx = end + 1;
          continue;
        }
      }

      if (segment.startsWith("_", idx) && !segment.startsWith("__", idx)) {
        const end = segment.indexOf("_", idx + 1);
        if (end > idx) {
          nodes.push(
            <em key={nextKey()} className="italic text-slate-700">
              {parseSegment(segment.slice(idx + 1, end))}
            </em>
          );
          idx = end + 1;
          continue;
        }
      }

      if (segment.startsWith("`", idx)) {
        const end = segment.indexOf("`", idx + 1);
        if (end > idx) {
          nodes.push(
            <code key={nextKey()} className="font-mono text-xs text-slate-600 bg-slate-100 px-1 rounded-sm">
              {segment.slice(idx + 1, end)}
            </code>
          );
          idx = end + 1;
          continue;
        }
      }

      if (segment[idx] === "[") {
        const closeBracket = segment.indexOf("]", idx + 1);
        const openParen = closeBracket === -1 ? -1 : segment.indexOf("(", closeBracket + 1);
        const closeParen = openParen === -1 ? -1 : segment.indexOf(")", openParen + 1);

        if (closeBracket > idx && openParen === closeBracket + 1 && closeParen > openParen) {
          const label = segment.slice(idx + 1, closeBracket);
          nodes.push(
            <strong key={nextKey()} className="font-semibold text-slate-900">
              {parseSegment(label)}
            </strong>
          );
          idx = closeParen + 1;
          continue;
        }
      }

      const nextSpecial = findNextSpecial(segment, idx);
      const plainText = segment.slice(idx, nextSpecial);
      if (plainText) {
        nodes.push(
          <span key={nextKey()}>{plainText}</span>
        );
      }
      idx = nextSpecial;
    }

    return nodes;
  };

  return <>{parseSegment(title)}</>;
}

interface ExplorerProps {
  className?: string;
  content?: string;
  onChapterClick?: (lineNumber: number) => void;
  onInsertText?: (text: string) => void;
  // Style settings
  fontScale?: number;
  onFontScaleChange?: (scale: number) => void;
  lineHeight?: number;
  onLineHeightChange?: (height: number) => void;
  textIndent?: number;
  onTextIndentChange?: (indent: number) => void;
  fontFamily?: string;
  onFontFamilyChange?: (family: string) => void;
}

export default function Explorer({ 
  className, 
  content = "", 
  onChapterClick, 
  onInsertText,
  fontScale = 100,
  onFontScaleChange,
  lineHeight = 1.8,
  onLineHeightChange,
  textIndent = 1,
  onTextIndentChange,
  fontFamily = 'Noto Serif JP',
  onFontFamilyChange,
}: ExplorerProps) {
  const [activeTab, setActiveTab] = useState<Tab>("chapters");

  return (
    <aside className={clsx("h-full bg-white border-r border-slate-200 flex flex-col", className)}>
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
          段落
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "chapters" && <ChaptersPanel content={content} onChapterClick={onChapterClick} onInsertText={onInsertText} />}
        {activeTab === "settings" && <SettingsPanel />}
        {activeTab === "style" && (
          <StylePanel 
            fontScale={fontScale}
            onFontScaleChange={onFontScaleChange}
            lineHeight={lineHeight}
            onLineHeightChange={onLineHeightChange}
            textIndent={textIndent}
            onTextIndentChange={onTextIndentChange}
            fontFamily={fontFamily}
            onFontFamilyChange={onFontFamilyChange}
          />
        )}
      </div>
    </aside>
  );
}

function ChaptersPanel({ content, onChapterClick, onInsertText }: { content: string; onChapterClick?: (lineNumber: number) => void; onInsertText?: (text: string) => void }) {
  const chapters = useMemo(() => parseMarkdownChapters(content), [content]);
  const [showSyntaxHelp, setShowSyntaxHelp] = useState(false);

  return (
    <div className="space-y-2 relative">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-700">目次</h3>
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
      
      <button 
        onClick={() => setShowSyntaxHelp(true)}
        className="w-full mt-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-50 rounded border border-dashed border-slate-300"
      >
        + 新しい章を追加
      </button>

      {/* Markdown Syntax Help Panel */}
      {showSyntaxHelp && (
        <MarkdownSyntaxPanel 
          onClose={() => setShowSyntaxHelp(false)}
          onInsertText={(text) => {
            onInsertText?.(text);
            setShowSyntaxHelp(false);
          }}
        />
      )}
    </div>
  );
}

function MarkdownSyntaxPanel({ onClose, onInsertText }: { onClose: () => void; onInsertText: (text: string) => void }) {
  const syntaxExamples = [
    { syntax: "# 見出し", description: "レベル1の見出し", example: "# 第一章" },
    { syntax: "## 見出し", description: "レベル2の見出し", example: "## 第一節" },
    { syntax: "### 見出し", description: "レベル3の見出し", example: "### シーン1" },
    { syntax: "**太字**", description: "太字テキスト", example: "**重要な内容**" },
    { syntax: "*斜体*", description: "斜体テキスト", example: "*強調テキスト*" },
    { syntax: "~~取り消し線~~", description: "取り消し線", example: "~~削除済み~~" },
    { syntax: "> 引用", description: "引用テキスト", example: "> これは引用です" },
    { syntax: "- 項目", description: "箇条書きリスト", example: "- 項目1\n- 項目2" },
    { syntax: "1. 項目", description: "番号付きリスト", example: "1. 項目1\n2. 項目2" },
    { syntax: "---", description: "区切り線", example: "---" },
    { syntax: "`コード`", description: "インラインコード", example: "`console.log()`" },
    { syntax: "[リンク](URL)", description: "ハイパーリンク", example: "[Google](https://google.com)" },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center" onClick={onClose}>
      <div 
        className="bg-white rounded-lg shadow-2xl border border-slate-200 w-[500px] max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-800">
            Markdown構文ガイド
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {syntaxExamples.map((item, index) => (
              <button
                key={index}
                onClick={() => onInsertText(item.example)}
                className="w-full p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 transition-colors text-left"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <code className="text-sm font-mono text-indigo-600 bg-white px-2 py-0.5 rounded">
                    {item.syntax}
                  </code>
                  <span className="text-xs text-slate-500">{item.description}</span>
                </div>
                <div className="text-xs text-slate-600 mt-2 pl-2 border-l-2 border-slate-300">
                  {item.example.split('\n').map((line, i) => (
                    <div key={i} className="font-mono">{line}</div>
                  ))}
                </div>
              </button>
            ))}
          </div>

          {/* Additional Tips */}
          <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="text-xs font-semibold text-blue-800 mb-2">💡 ヒント</h4>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>• 見出しの後には空行が必要です</li>
              <li>• リスト項目間に空行は不要です</li>
              <li>• 複数の書式を組み合わせることができます</li>
              <li>• ルビ（振り仮名）構文もサポートしています</li>
            </ul>
          </div>
        </div>
      </div>
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
      <span className="text-sm flex-1 truncate">{renderFormattedTitle(chapter.title)}</span>
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

function StylePanel({
  fontScale = 100,
  onFontScaleChange,
  lineHeight = 1.8,
  onLineHeightChange,
  textIndent = 1,
  onTextIndentChange,
  fontFamily = 'Noto Serif JP',
  onFontFamilyChange,
}: {
  fontScale?: number;
  onFontScaleChange?: (scale: number) => void;
  lineHeight?: number;
  onLineHeightChange?: (height: number) => void;
  textIndent?: number;
  onTextIndentChange?: (indent: number) => void;
  fontFamily?: string;
  onFontFamilyChange?: (family: string) => void;
}) {
  // Preload featured fonts on mount
  useEffect(() => {
    FEATURED_JAPANESE_FONTS.forEach(font => {
      loadGoogleFont(font.family);
    });
  }, []);

  const handleFontChange = (newFont: string) => {
    onFontFamilyChange?.(newFont);
    loadGoogleFont(newFont);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          フォント
        </label>
        <select 
          value={fontFamily}
          onChange={(e) => handleFontChange(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 font-preview-select"
          style={{ fontFamily: `"${fontFamily}", serif` }}
        >
          <optgroup label="おすすめ">
            {FEATURED_JAPANESE_FONTS.map(font => (
              <option 
                key={font.family} 
                value={font.family}
                style={{ fontFamily: `"${font.family}", serif` }}
              >
                {font.family}
              </option>
            ))}
          </optgroup>
          <optgroup label="すべてのフォント">
            {ALL_JAPANESE_FONTS
              .filter(font => !FEATURED_JAPANESE_FONTS.find(f => f.family === font.family))
              .map(font => (
                <option 
                  key={font.family} 
                  value={font.family}
                  style={{ fontFamily: `"${font.family}", serif` }}
                >
                  {font.family}
                </option>
              ))}
          </optgroup>
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          文字サイズ
        </label>
        <input
          type="range"
          min="50"
          max="200"
          step="5"
          value={fontScale}
          onChange={(e) => onFontScaleChange?.(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>50%</span>
          <span>{fontScale}%</span>
          <span>200%</span>
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
          value={lineHeight}
          onChange={(e) => onLineHeightChange?.(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>狭い</span>
          <span>{lineHeight.toFixed(1)}</span>
          <span>広い</span>
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          字下げ
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="0.5"
            value={textIndent}
            onChange={(e) => onTextIndentChange?.(Number(e.target.value))}
            className="w-20 px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-sm text-slate-600">字</span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          段落の先頭にインデントを適用します
        </p>
      </div>
    </div>
  );
}
