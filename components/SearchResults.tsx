"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { Search, X, Replace, ReplaceAll, ChevronRight, ChevronDown } from "lucide-react";
import { EditorView, Decoration } from "@milkdown/prose/view";
import { TextSelection } from "@milkdown/prose/state";
import clsx from "clsx";
import { centerEditorPosition } from "@/lib/editor-page/center-editor-position";
import { findSearchMatches, type SearchMatch } from "@/lib/editor-page/find-search-matches";

// #1507: After tab switch, the parent's editorViewInstance may still
// reference a destroyed EditorView for a short window before the new
// editor's view is ready. ProseMirror sets `docView` to null on destroy.
// Dispatching on a destroyed view routes through Milkdown plugins whose
// context has been torn down, throwing "Context editorState not found".
function isEditorViewAlive(view: EditorView | null): view is EditorView {
  return view !== null && (view as unknown as { docView: unknown }).docView !== null;
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
  onClose,
}: SearchResultsProps) {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm || "");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>(initialMatches || []);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showReplace, setShowReplace] = useState(true);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // #1502: Sync incoming props → state during render (React-recommended
  // "derived state" pattern). useState only reads the initializer on mount,
  // so without this an already-mounted SearchResults silently ignores props
  // pushed by SearchDialog's "すべての検索結果を表示" button. Using render-time
  // detection (vs useEffect) avoids the extra-render flush delay that breaks
  // jsdom tests and trips React 18+ act() expectations.
  const [lastInitialSearchTerm, setLastInitialSearchTerm] = useState(initialSearchTerm);
  if (initialSearchTerm !== lastInitialSearchTerm) {
    setLastInitialSearchTerm(initialSearchTerm);
    if (initialSearchTerm !== undefined) {
      setSearchTerm(initialSearchTerm);
    }
  }

  const [lastInitialMatches, setLastInitialMatches] = useState(initialMatches);
  if (initialMatches !== lastInitialMatches) {
    setLastInitialMatches(initialMatches);
    if (initialMatches !== undefined) {
      setMatches(initialMatches);
    }
  }

  // 文書内の一致箇所を検索する
  useEffect(() => {
    // #1502: when there's no editor, leave matches as-is so prop-sourced
    // initialMatches survive. Local recompute only runs against a real editor.
    // #1507: also guard against destroyed views during tab switch.
    if (!isEditorViewAlive(editorView)) {
      return;
    }
    if (!searchTerm) {
      setMatches([]);
      try {
        const { state, dispatch } = editorView;
        const tr = state.tr.setMeta("searchDecorations", []);
        dispatch(tr);
      } catch {
        // Best-effort cleanup — view may have been destroyed mid-dispatch.
      }
      return;
    }

    const { state, dispatch } = editorView;
    const { doc } = state;

    // Use the shared ProseMirror-position-aware matcher. A previous
    // textContent-based implementation drifted past hardbreaks (leafText "\n")
    // and ruby atoms, highlighting the wrong characters.
    const foundMatches = findSearchMatches(doc, searchTerm, caseSensitive);

    setMatches(foundMatches);

    // Apply highlight decorations
    const decorations: Decoration[] = foundMatches.map((m) =>
      Decoration.inline(m.from, m.to, {
        class: "search-result",
      }),
    );
    try {
      const tr = state.tr.setMeta("searchDecorations", decorations);
      dispatch(tr);
    } catch {
      // #1507: view torn down mid-search — decorations go with it.
    }
  }, [searchTerm, caseSensitive, editorView]);
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

  // Jump to specified match and highlight
  const goToMatch = useCallback(
    (match: SearchMatch, index: number) => {
      if (!isEditorViewAlive(editorView)) return;

      const { state, dispatch } = editorView;

      // Create decoration to mark this match as current
      const decorations: Decoration[] = [];
      matches.forEach((m, i) => {
        const isCurrentMatch = i === index;
        decorations.push(
          Decoration.inline(m.from, m.to, {
            class: isCurrentMatch ? "search-result-current" : "search-result",
          }),
        );
      });

      // Pass decoration info via meta
      const tr = state.tr.setMeta("searchDecorations", decorations);

      const selectTr = tr.setSelection(TextSelection.create(tr.doc, match.from, match.from));
      dispatch(selectTr);
      centerEditorPosition(editorView, match.from);

      editorView.focus();
    },
    [editorView, matches],
  );

  // Replace single match
  const replaceMatch = useCallback(
    (match: SearchMatch) => {
      if (!isEditorViewAlive(editorView)) return;

      const { state, dispatch } = editorView;
      const tr = state.tr.replaceWith(match.from, match.to, state.schema.text(replaceTerm));
      dispatch(tr);

      // Re-search
      setTimeout(() => {
        setSearchTerm(searchTerm + " ");
        setTimeout(() => setSearchTerm(searchTerm.trim()), 0);
      }, 100);
    },
    [editorView, replaceTerm, searchTerm],
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

    // Clear search
    setMatches([]);
    setSearchTerm("");
    setReplaceTerm("");
  }, [editorView, matches, replaceTerm]);

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
            onChange={(e) => setSearchTerm(e.target.value)}
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
