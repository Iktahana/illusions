"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X, ChevronUp, ChevronDown, Replace, ReplaceAll } from "lucide-react";
import clsx from "clsx";
import { EditorView } from "@milkdown/prose/view";
import { TextSelection } from "@milkdown/prose/state";

interface SearchDialogProps {
  editorView: EditorView | null;
  isOpen: boolean;
  onClose: () => void;
}

interface SearchMatch {
  from: number;
  to: number;
}

export default function SearchDialog({ editorView, isOpen, onClose }: SearchDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
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

  // 現在の一致箇所へ移動し、選択表示する
  useEffect(() => {
    if (!editorView || currentMatchIndex === -1 || matches.length === 0) {
      return;
    }

    const match = matches[currentMatchIndex];
    if (!match) return;

    // 一致箇所を選択
    const { state, dispatch } = editorView;
    const tr = state.tr
      .setSelection(TextSelection.create(state.doc, match.from, match.to))
      .scrollIntoView();
    dispatch(tr);

    // 表示位置へスクロール
    editorView.focus();
  }, [currentMatchIndex, matches, editorView]);

  const goToNextMatch = () => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % matches.length);
  };

  const goToPreviousMatch = () => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + matches.length) % matches.length);
  };

  const replaceCurrentMatch = () => {
    if (!editorView || currentMatchIndex === -1 || matches.length === 0) return;

    const match = matches[currentMatchIndex];
    const { state, dispatch } = editorView;
    
    // 現在の一致箇所を置換
    const tr = state.tr.replaceWith(
      match.from,
      match.to,
      state.schema.text(replaceTerm)
    );
    dispatch(tr);

    // 再検索して一致箇所を更新
    setSearchTerm(searchTerm + " "); // Trigger re-search
    setTimeout(() => setSearchTerm(searchTerm.trim()), 0);
  };

  const replaceAllMatches = () => {
    if (!editorView || matches.length === 0) return;

    const { state, dispatch } = editorView;
    let tr = state.tr;

    // 位置ずれを避けるため、後ろから順に置換する
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      tr = tr.replaceWith(
        match.from,
        match.to,
        state.schema.text(replaceTerm)
      );
    }

    dispatch(tr);

    // 検索状態をクリア
    setSearchTerm("");
    setReplaceTerm("");
    setMatches([]);
    setCurrentMatchIndex(-1);
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
        <button
          onClick={() => setShowReplace(!showReplace)}
          className="text-xs text-accent hover:text-accent-hover"
        >
          {showReplace ? "置換を非表示" : "置換"}
        </button>
      </div>

      {/* 置換 */}
      {showReplace && (
        <div className="space-y-2 pt-2 border-t border-border">
          <input
            type="text"
            value={replaceTerm}
            onChange={(e) => setReplaceTerm(e.target.value)}
            placeholder="置換後..."
            className="w-full px-3 py-2 border border-border-secondary bg-background text-foreground rounded focus:outline-none focus:ring-2 focus:ring-accent text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={replaceCurrentMatch}
              disabled={currentMatchIndex === -1}
              className={clsx(
                "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors",
                currentMatchIndex === -1
                  ? "bg-background-secondary text-foreground-muted cursor-not-allowed"
                  : "bg-accent-light text-accent hover:bg-active"
              )}
            >
              <Replace className="w-4 h-4" />
              置換
            </button>
            <button
              onClick={replaceAllMatches}
              disabled={matches.length === 0}
              className={clsx(
                "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors",
                matches.length === 0
                  ? "bg-background-secondary text-foreground-muted cursor-not-allowed"
                  : "bg-accent text-accent-foreground hover:bg-accent-hover"
              )}
            >
              <ReplaceAll className="w-4 h-4" />
              すべて置換
            </button>
          </div>
        </div>
      )}

      {/* ショートカット */}
      <div className="mt-3 pt-2 border-t border-border text-xs text-foreground-tertiary">
        <div>Enter: 次へ / Shift+Enter: 前へ / Esc: 閉じる</div>
      </div>
    </div>
  );
}
