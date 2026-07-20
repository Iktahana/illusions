"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Search, X, ChevronUp, ChevronDown, List } from "lucide-react";
import { computeAnchorPos, clampDragPos } from "@/lib/search-dialog/compute-anchor-pos";
import type { SearchMatch } from "@/lib/editor-page/find-search-matches";

const DIALOG_WIDTH = 320; // w-80 と一致させる
const DIALOG_PADDING = 16; // 8px top offset / 16px right offset の元値と整合

interface SearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** サイドバー検索パネルを開く（共有 state を表示）。 */
  onShowAllResults?: () => void;
  /** 共有検索 state（単一 source of truth）。SearchResults と同期する。 */
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  caseSensitive: boolean;
  onCaseSensitiveChange: (value: boolean) => void;
  matches: SearchMatch[];
  currentMatchIndex: number;
  onCurrentMatchIndexChange: (index: number) => void;
  /** エディタ領域の ref。ダイアログ初期位置計算に使用する。
   *  dockview の CSS transform が position:fixed の containing block を破壊するため、
   *  portal + getBoundingClientRect() でエディタ基準の座標を求める。 */
  anchorRef?: React.RefObject<HTMLElement | null>;
}

export type { SearchMatch };

export default function SearchDialog({
  isOpen,
  onClose,
  onShowAllResults,
  searchTerm,
  onSearchTermChange,
  caseSensitive,
  onCaseSensitiveChange,
  matches,
  currentMatchIndex,
  onCurrentMatchIndexChange,
  anchorRef,
}: SearchDialogProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Drag state (session-only, resets on close)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const dragStart = useRef<{ mouseX: number; mouseY: number; elX: number; elY: number }>({
    mouseX: 0,
    mouseY: 0,
    elX: 0,
    elY: 0,
  });

  // アンカー基準の初期位置（エディタ領域の右上）
  const [anchorPos, setAnchorPos] = useState<{ top: number; right: number } | null>(null);

  // アンカー要素の getBoundingClientRect() からダイアログ初期位置を計算する。
  // portal により document.body 直下に render されるため座標は viewport 基準になる。
  // close 時は dragOffset と anchorPos をリセットし、次回 open で再計算する。
  // anchorRef は安定 ref オブジェクトで、依存配列に置いても .current 変更では再実行されない。
  // 主トリガーは isOpen → true 遷移。exhaustive-deps lint を満たすため明示列挙する。
  // 冪等: anchorRef.current が同じなら同一値を setAnchorPos するため React 19 Strict Mode の
  // double-invoke でも問題なし。
  useEffect(() => {
    if (isOpen && anchorRef?.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setAnchorPos(
        computeAnchorPos(
          { top: rect.top, right: rect.right },
          window.innerWidth,
          DIALOG_WIDTH,
          DIALOG_PADDING,
        ),
      );
    }
    if (!isOpen) {
      setAnchorPos(null);
      setDragOffset(null);
    }
  }, [isOpen, anchorRef]);

  // close 時にドラッグ中フラグを落とす。
  // isDragging.current = false により mousemove ハンドラが early-return し
  // stale なポインタイベントが position 更新を起こさなくなる。
  useEffect(() => {
    if (!isOpen) {
      isDragging.current = false;
    }
  }, [isOpen]);

  // ウィンドウリサイズ時にドラッグ位置を再クランプし、ダイアログが
  // 操作不能な位置に取り残されないようにする。
  useEffect(() => {
    if (!isOpen) return;
    const handleResize = () => {
      setDragOffset((prev) => {
        if (prev === null) return prev;
        const dialogEl = dialogRef.current;
        const dialogSize = dialogEl
          ? { width: dialogEl.offsetWidth, height: dialogEl.offsetHeight }
          : { width: DIALOG_WIDTH, height: 0 };
        return clampDragPos(prev, dialogSize, window.innerWidth, window.innerHeight);
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isOpen]);

  // ダイアログが開いている間はグローバル keydown で Escape を捕捉する。
  // dialog の onKeyDown だけだとフォーカスがエディタ側に移った後に Escape が
  // 効かなくなるため、document レベルで補完する。
  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isOpen, onClose]);

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
      // close で isDragging が落とされた場合は listener も即時撤去する。
      // これにより portal unmount 後にも listener が残るリークを防ぐ。
      // removeEventListener は idempotent な DOM API なので handleMouseUp が後で
      // 同じ listener を再度 remove しても no-op で安全。
      if (!isDragging.current) {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        return;
      }
      const dx = ev.clientX - dragStart.current.mouseX;
      const dy = ev.clientY - dragStart.current.mouseY;
      const rawPos = { x: dragStart.current.elX + dx, y: dragStart.current.elY + dy };
      const dialogEl = dialogRef.current;
      const dialogSize = dialogEl
        ? { width: dialogEl.offsetWidth, height: dialogEl.offsetHeight }
        : { width: DIALOG_WIDTH, height: 0 };
      setDragOffset(clampDragPos(rawPos, dialogSize, window.innerWidth, window.innerHeight));
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  // ダイアログ表示時に検索入力へフォーカスする
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
      searchInputRef.current.select();
    }
  }, [isOpen]);

  // マッチ検出とハイライト適用は app/page.tsx の useSearchHighlight に集約済み。
  // ここは共有 state を表示し、入力・ナビを上流へ転送するだけの controlled UI。

  const goToNextMatch = () => {
    if (matches.length === 0) return;
    onCurrentMatchIndexChange((currentMatchIndex + 1) % matches.length);
  };

  const goToPreviousMatch = () => {
    if (matches.length === 0) return;
    onCurrentMatchIndexChange((currentMatchIndex - 1 + matches.length) % matches.length);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Enter") {
      // Ignore IME composition confirmation — only handle real Enter
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      if (e.shiftKey) {
        goToPreviousMatch();
      } else {
        goToNextMatch();
      }
    }
  };

  const handleShowAllResults = () => {
    if (matches.length > 0 && searchTerm && onShowAllResults) {
      onShowAllResults();
    }
  };

  if (!isOpen) return null;

  const posStyle = dragOffset
    ? { left: dragOffset.x, top: dragOffset.y, right: "auto" }
    : anchorPos
      ? { top: anchorPos.top, right: anchorPos.right }
      : { top: 64, right: 16 }; // anchorRef なし時のフォールバック (web で使用)

  return createPortal(
    <div
      ref={dialogRef}
      className="fixed z-[9999] bg-background-elevated/80 backdrop-blur-xl rounded-lg shadow-lg border border-border/50 p-4 w-80 cursor-grab active:cursor-grabbing"
      style={posStyle}
      onKeyDown={handleKeyDown}
      onMouseDown={handleDragMouseDown}
    >
      <div className="flex items-center justify-between mb-3 select-none">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-foreground-secondary" />
          <h3 className="text-sm font-medium text-foreground">検索</h3>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-hover transition-colors">
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
            onChange={(e) => onSearchTermChange(e.target.value)}
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
            onChange={(e) => onCaseSensitiveChange(e.target.checked)}
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
    </div>,
    document.body,
  );
}
