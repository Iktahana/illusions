"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X, ChevronUp, ChevronDown, List } from "lucide-react";
import clsx from "clsx";
import { EditorView, Decoration, DecorationSet } from "@milkdown/prose/view";
import { TextSelection } from "@milkdown/prose/state";
import { Plugin, PluginKey } from "@milkdown/prose/state";

interface SearchDialogProps {
  editorView: EditorView | null;
  isOpen: boolean;
  onClose: () => void;
  onShowAllResults?: (matches: SearchMatch[], searchTerm: string) => void;
}

interface SearchMatch {
  from: number;
  to: number;
}

export default function SearchDialog({ editorView, isOpen, onClose, onShowAllResults }: SearchDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ダイアログ表示時に検索入力へフォーカスする
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
      searchInputRef.current.select();
    }
  }, [isOpen]);

  // 文書内の一致箇所を検索する
  useEffect(() => {
    if (!editorView || !searchTerm) {
      setMatches([]);
      setCurrentMatchIndex(-1);
      return;
    }

    const { state } = editorView;
    const { doc } = state;
    const foundMatches: SearchMatch[] = [];
    const searchStr = caseSensitive ? searchTerm : searchTerm.toLowerCase();

    doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return;

      const text = caseSensitive ? node.text : node.text.toLowerCase();
      let searchIndex = 0;

      while (searchIndex < text.length) {
        const matchIndex = text.indexOf(searchStr, searchIndex);
        if (matchIndex === -1) break;

        const from = pos + matchIndex;
        const to = from + searchTerm.length;

        foundMatches.push({ from, to });
        searchIndex = matchIndex + 1;
      }
    });

    setMatches(foundMatches);
    setCurrentMatchIndex(foundMatches.length > 0 ? 0 : -1);
  }, [searchTerm, caseSensitive, editorView]);

  // 搜索高亮裝飾
  useEffect(() => {
    if (!editorView) return;

    const { state, dispatch } = editorView;
    const decorations: Decoration[] = [];

    // 為所有匹配項添加背景高亮
    matches.forEach((match, index) => {
      const isCurrentMatch = index === currentMatchIndex;
      decorations.push(
        Decoration.inline(match.from, match.to, {
          class: isCurrentMatch ? "search-result-current" : "search-result",
        })
      );
    });

    // 使用 meta 傳遞裝飾信息
    const tr = state.tr.setMeta("searchDecorations", decorations);
    dispatch(tr);

    // 滾動到當前匹配項
    if (currentMatchIndex !== -1 && matches[currentMatchIndex]) {
      const match = matches[currentMatchIndex];
      const tr2 = state.tr
        .setSelection(TextSelection.create(state.doc, match.from, match.from))
        .scrollIntoView();
      dispatch(tr2);
    }
  }, [currentMatchIndex, matches, editorView]);

  const goToNextMatch = () => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % matches.length);
  };

  const goToPreviousMatch = () => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + matches.length) % matches.length);
  };



  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Enter") {
      if (e.shiftKey) {
        goToPreviousMatch();
      } else {
        goToNextMatch();
      }
    }
  };

  const handleShowAllResults = () => {
    if (matches.length > 0 && searchTerm && onShowAllResults) {
      onShowAllResults(matches, searchTerm);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed top-16 right-4 z-50 bg-background-elevated rounded-lg shadow-lg border border-border p-4 w-80"
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-foreground-secondary" />
          <h3 className="text-sm font-medium text-foreground">検索</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-hover transition-colors"
        >
          <X className="w-4 h-4 text-foreground-secondary" />
        </button>
      </div>

      {/* 検索入力 */}
      <div className="mb-2">
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="検索..."
            className="w-full px-3 py-2 pr-20 border border-border-secondary bg-background text-foreground rounded focus:outline-none focus:ring-2 focus:ring-accent text-sm"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {matches.length > 0 && (
              <span className="text-xs text-foreground-tertiary mr-1">
                {currentMatchIndex + 1}/{matches.length}
              </span>
            )}
            <button
              onClick={goToPreviousMatch}
              disabled={matches.length === 0}
              className="p-1 rounded hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
              title="前へ (Shift+Enter)"
            >
              <ChevronUp className="w-4 h-4 text-foreground-secondary" />
            </button>
            <button
              onClick={goToNextMatch}
              disabled={matches.length === 0}
              className="p-1 rounded hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
              title="次へ (Enter)"
            >
              <ChevronDown className="w-4 h-4 text-foreground-secondary" />
            </button>
          </div>
        </div>
      </div>

      {/* オプション */}
      <div className="mb-3 flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-foreground-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
            className="rounded"
          />
          大文字小文字を区別
        </label>
      </div>

      {/* 全文検索ボタン */}
      {matches.length > 0 && (
        <button
          onClick={handleShowAllResults}
          className="w-full mb-3 flex items-center justify-center gap-2 px-3 py-2 rounded text-sm font-medium bg-accent-light text-accent hover:bg-active transition-colors"
        >
          <List className="w-4 h-4" />
          すべての検索結果を表示 ({matches.length}件)
        </button>
      )}

      {/* ショートカット */}
      <div className="mt-3 pt-2 border-t border-border text-xs text-foreground-tertiary">
        <div>Enter: 次へ / Shift+Enter: 前へ / Esc: 閉じる</div>
      </div>
    </div>
  );
}
