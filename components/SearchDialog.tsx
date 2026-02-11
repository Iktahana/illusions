"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Search, X, ChevronUp, ChevronDown, List } from "lucide-react";
import { EditorView, Decoration } from "@milkdown/prose/view";
import { TextSelection } from "@milkdown/prose/state";

interface SearchDialogProps {
  editorView: EditorView | null;
  isOpen: boolean;
  onClose: () => void;
  onShowAllResults?: (matches: SearchMatch[], searchTerm: string) => void;
  initialSearchTerm?: string;
}

interface SearchMatch {
  from: number;
  to: number;
}

export default function SearchDialog({ editorView, isOpen, onClose, onShowAllResults, initialSearchTerm }: SearchDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Drag state (session-only, resets on refresh)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const dragStart = useRef<{ mouseX: number; mouseY: number; elX: number; elY: number }>({ mouseX: 0, mouseY: 0, elX: 0, elY: 0 });

  const handleDragMouseDown = useCallback((e: React.MouseEvent) => {
    // Don't initiate drag from interactive elements
    if ((e.target as HTMLElement).closest("button, input, label, a")) return;
    e.preventDefault();
    isDragging.current = true;
    const el = dialogRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, elX: rect.left, elY: rect.top };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = ev.clientX - dragStart.current.mouseX;
      const dy = ev.clientY - dragStart.current.mouseY;
      setDragOffset({ x: dragStart.current.elX + dx, y: dragStart.current.elY + dy });
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  // initialSearchTerm が変わったら検索語を上書き
  useEffect(() => {
    if (initialSearchTerm) {
      setSearchTerm(initialSearchTerm);
    }
  }, [initialSearchTerm]);

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

     // ドキュメント全文検索
     const fullText = doc.textContent;
    const searchText = caseSensitive ? fullText : fullText.toLowerCase();
    
    let searchIndex = 0;
    while (searchIndex < searchText.length) {
      const matchIndex = searchText.indexOf(searchStr, searchIndex);
      if (matchIndex === -1) break;

       // テキスト位置をドキュメント位置に変換
       let pos = 0;
      let textOffset = 0;
      
      doc.descendants((node, nodePos) => {
         if (pos !== 0) return false; // 見つかった、走査を停止
        
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
    setCurrentMatchIndex(foundMatches.length > 0 ? 0 : -1);
  }, [searchTerm, caseSensitive, editorView]);

     // 検索ハイライト装飾
     useEffect(() => {
    if (!editorView) return;

    const { state, dispatch } = editorView;
    const decorations: Decoration[] = [];

     // すべてのマッチ項目に背景ハイライトを追加
     matches.forEach((match, index) => {
      const isCurrentMatch = index === currentMatchIndex;
      decorations.push(
        Decoration.inline(match.from, match.to, {
          class: isCurrentMatch ? "search-result-current" : "search-result",
        })
      );
    });

     // meta を使用して装飾情報を渡す
     const tr = state.tr.setMeta("searchDecorations", decorations);
    dispatch(tr);

     // 現在のマッチ項目までスクロール
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
      ref={dialogRef}
      className="fixed z-50 bg-background-elevated/80 backdrop-blur-xl rounded-lg shadow-lg border border-border/50 p-4 w-80 cursor-grab active:cursor-grabbing"
      style={
        dragOffset
          ? { left: dragOffset.x, top: dragOffset.y, right: "auto" }
          : { top: 64, right: 16 }
      }
      onKeyDown={handleKeyDown}
      onMouseDown={handleDragMouseDown}
    >
      <div
        className="flex items-center justify-between mb-3 select-none"
      >
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
          className="w-full mb-3 flex items-center justify-center gap-2 px-3 py-2 rounded text-sm font-medium bg-accent text-accent-foreground hover:bg-accent-hover transition-colors"
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
