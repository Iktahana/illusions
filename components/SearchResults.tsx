"use client";

import { useEffect, useState, useRef } from "react";
import { Search, X, Replace, ReplaceAll, ChevronRight, ChevronDown } from "lucide-react";
import { EditorView, Decoration } from "@milkdown/prose/view";
import { TextSelection } from "@milkdown/prose/state";
import clsx from "clsx";

interface SearchMatch {
  from: number;
  to: number;
}

interface SearchResultsProps {
  editorView: EditorView | null;
  matches?: SearchMatch[];
  searchTerm?: string;
  onClose: () => void;
}

export default function SearchResults({ 
  editorView, 
  matches: initialMatches, 
  searchTerm: initialSearchTerm, 
  onClose 
}: SearchResultsProps) {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm || "");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>(initialMatches || []);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showReplace, setShowReplace] = useState(true);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 文書内の一致箇所を検索する
  useEffect(() => {
    if (!editorView || !searchTerm) {
      setMatches([]);
      // 清除高亮
      if (editorView) {
        const { state, dispatch } = editorView;
        const tr = state.tr.setMeta("searchDecorations", []);
        dispatch(tr);
      }
      return;
    }

    const { state, dispatch } = editorView;
    const { doc } = state;
    const foundMatches: SearchMatch[] = [];
    const searchStr = caseSensitive ? searchTerm : searchTerm.toLowerCase();

    // 文檔全文搜索
    const fullText = doc.textContent;
    const searchText = caseSensitive ? fullText : fullText.toLowerCase();
    
    let searchIndex = 0;
    while (searchIndex < searchText.length) {
      const matchIndex = searchText.indexOf(searchStr, searchIndex);
      if (matchIndex === -1) break;

      // 將文本位置轉換為文檔位置
      let pos = 0;
      let textOffset = 0;
      
      doc.descendants((node, nodePos) => {
        if (pos !== 0) return false; // 已找到，停止遍歷
        
        if (node.isText && node.text) {
          const nodeEnd = textOffset + node.text.length;
          if (matchIndex >= textOffset && matchIndex < nodeEnd) {
            pos = nodePos + (matchIndex - textOffset);
            return false;
          }
          textOffset = nodeEnd;
        }
        return true;
      });

      if (pos > 0) {
        foundMatches.push({ from: pos, to: pos + searchTerm.length });
      }
      searchIndex = matchIndex + 1;
    }

    setMatches(foundMatches);

    // 應用高亮裝飾
    const decorations: Decoration[] = foundMatches.map((m) =>
      Decoration.inline(m.from, m.to, {
        class: "search-result",
      })
    );
    const tr = state.tr.setMeta("searchDecorations", decorations);
    dispatch(tr);
  }, [searchTerm, caseSensitive, editorView]);
  // 获取匹配项的上下文文本
  const getMatchContext = (match: SearchMatch): { before: string; text: string; after: string } => {
    if (!editorView) {
      return { before: "", text: "", after: "" };
    }

    const { state } = editorView;
    const { doc } = state;
    
    // 获取匹配文本
    const matchText = doc.textBetween(match.from, match.to);
    
    // 获取前后文本（各30个字符）
    const contextLength = 30;
    const beforeStart = Math.max(0, match.from - contextLength);
    const afterEnd = Math.min(doc.content.size, match.to + contextLength);
    
    const beforeText = doc.textBetween(beforeStart, match.from);
    const afterText = doc.textBetween(match.to, afterEnd);
    
    return {
      before: beforeText.length > contextLength ? "..." + beforeText.slice(-contextLength) : beforeText,
      text: matchText,
      after: afterText.length > contextLength ? afterText.slice(0, contextLength) + "..." : afterText,
    };
  };

  // 跳轉到指定匹配項並高亮
  const goToMatch = (match: SearchMatch, index: number) => {
    if (!editorView) return;

    const { state, dispatch } = editorView;
    
    // 創建裝飾，將這個匹配項標記為當前項
    const decorations: Decoration[] = [];
    matches.forEach((m, i) => {
      const isCurrentMatch = i === index;
      decorations.push(
        Decoration.inline(m.from, m.to, {
          class: isCurrentMatch ? "search-result-current" : "search-result",
        })
      );
    });

    // 使用 meta 傳遞裝飾信息
    const tr = state.tr.setMeta("searchDecorations", decorations);
    
    // 滾動到匹配項（不選中文字，只移動光標）
    const scrollTr = tr.setSelection(TextSelection.create(tr.doc, match.from, match.from))
      .scrollIntoView();
    
    dispatch(scrollTr);
    editorView.focus();
  };

  // 替換單個匹配項
  const replaceMatch = (match: SearchMatch) => {
    if (!editorView) return;

    const { state, dispatch } = editorView;
    const tr = state.tr.replaceWith(
      match.from,
      match.to,
      state.schema.text(replaceTerm)
    );
    dispatch(tr);

    // 重新搜索
    setTimeout(() => {
      setSearchTerm(searchTerm + " ");
      setTimeout(() => setSearchTerm(searchTerm.trim()), 0);
    }, 100);
  };

  // 替換所有匹配項
  const replaceAllMatches = () => {
    if (!editorView || matches.length === 0) return;

    const { state, dispatch } = editorView;
    let tr = state.tr;

    // 從後往前替換，避免位置偏移
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      tr = tr.replaceWith(
        match.from,
        match.to,
        state.schema.text(replaceTerm)
      );
    }

    dispatch(tr);

    // 清空搜索
    setMatches([]);
    setSearchTerm("");
    setReplaceTerm("");
  };

  return (
    <div className="h-full bg-background-secondary border-r border-border flex flex-col">
      {/* 标题栏 */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Search className="w-5 h-5 text-foreground-secondary" />
          <h2 className="text-lg font-semibold text-foreground">検索</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-hover transition-colors"
          title="検索を閉じる"
        >
          <X className="w-4 h-4 text-foreground-secondary" />
        </button>
      </div>

      {/* 搜索輸入區域 */}
      <div className="p-4 border-b border-border space-y-3">
        {/* 搜索框 */}
        <div>
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="検索..."
            className="w-full px-3 py-2 border border-border-secondary bg-background text-foreground rounded focus:outline-none focus:ring-2 focus:ring-accent text-sm"
          />
        </div>

        {/* 選項 */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-foreground-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
              className="rounded"
            />
            大文字小文字を区別
          </label>
          {matches.length > 0 && (
            <span className="text-xs text-foreground-secondary">
              {matches.length}件見つかりました
            </span>
          )}
        </div>

        {/* 替換開關 */}
        <button
          onClick={() => setShowReplace(!showReplace)}
          className="w-full flex items-center justify-between px-3 py-2 text-sm text-foreground-secondary hover:bg-hover rounded transition-colors"
        >
          <div className="flex items-center gap-2">
            {showReplace ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <span>置換</span>
          </div>
        </button>

        {/* 替換區域 */}
        {showReplace && (
          <div className="space-y-2 pl-6">
            <input
              type="text"
              value={replaceTerm}
              onChange={(e) => setReplaceTerm(e.target.value)}
              placeholder="置換後..."
              className="w-full px-3 py-2 border border-border-secondary bg-background text-foreground rounded focus:outline-none focus:ring-2 focus:ring-accent text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={replaceAllMatches}
                disabled={matches.length === 0 || !replaceTerm}
                className={clsx(
                  "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors",
                  matches.length === 0 || !replaceTerm
                    ? "bg-background-tertiary text-foreground-muted cursor-not-allowed"
                    : "bg-accent text-accent-foreground hover:bg-accent-hover"
                )}
              >
                <ReplaceAll className="w-4 h-4" />
                すべて置換
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 结果列表 */}
      <div className="flex-1 overflow-y-auto">
        {searchTerm && matches.length === 0 ? (
          <div className="p-4 text-center text-foreground-secondary">
            検索結果がありません
          </div>
        ) : !searchTerm ? (
          <div className="p-4 text-center text-foreground-secondary">
            検索語を入力してください
          </div>
        ) : (
          <div className="divide-y divide-border">
            {matches.map((match, index) => {
              const context = getMatchContext(match);
              return (
                <div
                  key={`${match.from}-${match.to}-${index}`}
                  className="p-4 hover:bg-hover transition-colors group"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-mono text-foreground-tertiary mt-1 flex-shrink-0">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => goToMatch(match, index)}
                        className="w-full text-left"
                      >
                        <p className="text-sm text-foreground break-words">
                          <span className="text-foreground-secondary">{context.before}</span>
                          <span className="bg-accent-light text-accent font-semibold px-1 rounded">
                            {context.text}
                          </span>
                          <span className="text-foreground-secondary">{context.after}</span>
                        </p>
                        <p className="text-xs text-foreground-tertiary mt-1">
                          位置: {match.from} - {match.to}
                        </p>
                      </button>
                      {showReplace && replaceTerm && (
                        <button
                          onClick={() => replaceMatch(match)}
                          className="mt-2 flex items-center gap-1 px-2 py-1 text-xs bg-accent-light text-accent hover:bg-active rounded transition-colors"
                        >
                          <Replace className="w-3 h-3" />
                          置換
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
