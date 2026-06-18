"use client";

import React, { useState, useRef, useCallback } from "react";
import { Search, X, Replace, ReplaceAll, ChevronRight, ChevronDown } from "lucide-react";
import type { EditorView } from "@milkdown/prose/view";
import clsx from "clsx";
import { isEditorViewAlive } from "@/lib/editor-page/use-search-highlight";
import { type SearchMatch } from "@/lib/editor-page/find-search-matches";

interface SearchResultsProps {
  editorView: EditorView | null;
  /** 共有検索 state（単一 source of truth）。SearchDialog と同期する。
   *  マッチ検出・ハイライト適用は app/page.tsx の useSearchHighlight に集約済み。 */
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  caseSensitive: boolean;
  onCaseSensitiveChange: (value: boolean) => void;
  matches: SearchMatch[];
  currentMatchIndex: number;
  onCurrentMatchIndexChange: (index: number) => void;
  onClose: () => void;
}

export default function SearchResults({
  editorView,
  searchTerm,
  onSearchTermChange,
  caseSensitive,
  onCaseSensitiveChange,
  matches,
  onCurrentMatchIndexChange,
  onClose,
}: SearchResultsProps) {
  // 置換は SearchResults 固有のローカル UI 状態。
  const [replaceTerm, setReplaceTerm] = useState("");
  const [showReplace, setShowReplace] = useState(true);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Get context text for match
  const getMatchContext = useCallback(
    (match: SearchMatch): { before: string; text: string; after: string } => {
      if (!editorView) {
        return { before: "", text: "", after: "" };
      }

      const { state } = editorView;
      const { doc } = state;

      // Get match text
      const matchText = doc.textBetween(match.from, match.to);

      // Get surrounding text (30 characters before and after)
      const contextLength = 30;
      const beforeStart = Math.max(0, match.from - contextLength);
      const afterEnd = Math.min(doc.content.size, match.to + contextLength);

      const beforeText = doc.textBetween(beforeStart, match.from);
      const afterText = doc.textBetween(match.to, afterEnd);

      return {
        before:
          beforeText.length > contextLength ? "..." + beforeText.slice(-contextLength) : beforeText,
        text: matchText,
        after:
          afterText.length > contextLength ? afterText.slice(0, contextLength) + "..." : afterText,
      };
    },
    [editorView],
  );

  // Jump to specified match. 現在マッチ index を共有 state へ反映すると
  // useSearchHighlight が強調・スクロールを担当する。
  const goToMatch = useCallback(
    (_match: SearchMatch, index: number) => {
      if (!isEditorViewAlive(editorView)) return;
      onCurrentMatchIndexChange(index);
      editorView.focus();
    },
    [editorView, onCurrentMatchIndexChange],
  );

  // Replace single match. 置換後の再マッチは page 側 useMemo（content 依存）が
  // 自動で行うため、旧来の setTimeout 再検索ハックは不要。
  const replaceMatch = useCallback(
    (match: SearchMatch) => {
      if (!isEditorViewAlive(editorView)) return;

      const { state, dispatch } = editorView;
      const tr = state.tr.replaceWith(match.from, match.to, state.schema.text(replaceTerm));
      dispatch(tr);
    },
    [editorView, replaceTerm],
  );

  // Replace all matches
  const replaceAllMatches = useCallback(() => {
    if (!isEditorViewAlive(editorView) || matches.length === 0) return;

    const { state, dispatch } = editorView;
    let tr = state.tr;

    // Replace from end to start to avoid position shift
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      tr = tr.replaceWith(match.from, match.to, state.schema.text(replaceTerm));
    }

    dispatch(tr);

    // 検索語をクリア → matches が空になり、useSearchHighlight がハイライトを消す。
    onSearchTermChange("");
    setReplaceTerm("");
  }, [editorView, matches, replaceTerm, onSearchTermChange]);

  return (
    <div className="h-full bg-background-secondary border-r border-border flex flex-col">
      {/* Title bar */}
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

      {/* Search input area */}
      <div className="p-4 border-b border-border space-y-3">
        {/* Search box */}
        <div>
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            placeholder="検索..."
            className="w-full px-3 py-2 border border-border-secondary bg-background text-foreground rounded focus:outline-none focus:ring-2 focus:ring-accent text-sm"
          />
        </div>

        {/* Options */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-foreground-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => onCaseSensitiveChange(e.target.checked)}
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

        {/* Replace toggle */}
        <button
          onClick={() => setShowReplace(!showReplace)}
          className="w-full flex items-center justify-between px-3 py-2 text-sm text-foreground-secondary hover:bg-hover rounded transition-colors"
        >
          <div className="flex items-center gap-2">
            {showReplace ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            <span>置換</span>
          </div>
        </button>

        {/* Replace area */}
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
                    : "bg-accent text-accent-foreground hover:bg-accent-hover",
                )}
              >
                <ReplaceAll className="w-4 h-4" />
                すべて置換
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Results list */}
      <div className="flex-1 overflow-y-auto">
        {searchTerm && matches.length === 0 ? (
          <div className="p-4 text-center text-foreground-secondary">検索結果がありません</div>
        ) : !searchTerm ? (
          <div className="p-4 text-center text-foreground-secondary">検索語を入力してください</div>
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
                      <button onClick={() => goToMatch(match, index)} className="w-full text-left">
                        <p className="text-sm text-foreground break-words">
                          <span className="text-foreground-secondary">{context.before}</span>
                          {showReplace && replaceTerm ? (
                            // #1502: VSCode-style replace preview (strikethrough + red old,
                            // green new). Only when replaceTerm is non-empty; preserves the
                            // plain highlight rendering otherwise.
                            <>
                              <span
                                className="line-through bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-1 rounded"
                                data-testid="replace-preview-old"
                              >
                                {context.text}
                              </span>
                              <span
                                className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 font-semibold px-1 rounded ml-0.5"
                                data-testid="replace-preview-new"
                              >
                                {replaceTerm}
                              </span>
                            </>
                          ) : (
                            <span className="bg-accent-light text-accent font-semibold px-1 rounded">
                              {context.text}
                            </span>
                          )}
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
