"use client";

import { useEffect, useState } from "react";
import { EditorView } from "@milkdown/prose/view";

interface SelectionCounterProps {
  editorView: EditorView;
  isVertical?: boolean;
}

export default function SelectionCounter({ editorView, isVertical = false }: SelectionCounterProps) {
  const [selectionCount, setSelectionCount] = useState<number>(0);
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [position, setPosition] = useState<{ top?: number; right?: number; bottom?: number; left?: number }>({ top: 0, right: 0 });

  useEffect(() => {
    if (!editorView) return;

    const updateSelectionCount = (event?: MouseEvent | Event) => {
      const { state } = editorView;
      const { selection } = state;
      const { from, to } = selection;

      // マウスイベントがある場合は表示位置も更新する
      if (event && event instanceof MouseEvent) {
        // エディタ領域の位置を取得
        const editorContainer = editorView.dom.closest('.flex-1') as HTMLElement;
        if (editorContainer) {
          const rect = editorContainer.getBoundingClientRect();
          
          if (isVertical) {
            // 縦書き: X軸（横方向）基準で位置を決める
            // 画面下部に固定し、マウスのX位置に合わせる
            setPosition({
              bottom: 16, // ビューポート下端から 16px
              left: event.clientX, // マウスの横位置に追従
            });
          } else {
            // 横書き: 従来通りX/Y基準
            const topPosition = event.clientY;
            const rightPosition = window.innerWidth - rect.right + 16; // エディタ右端から 16px
            
            setPosition({
              top: topPosition,
              right: rightPosition
            });
          }
        }
      }

      // 選択がない場合は非表示
      if (from === to) {
        setIsVisible(false);
        // フェードアウトのため、少し遅らせてカウントを消す
        setTimeout(() => setSelectionCount(0), 300);
        return;
      }

      // 選択文字列を取得
      const selectedText = state.doc.textBetween(from, to);
      
      // 文字数を数える（空白除外。アプリのカウント方法に合わせる）
      const count = selectedText.replace(/\s/g, "").length;
      setSelectionCount(count);
      setIsVisible(true);
    };

    // 選択変更を購読
    const editorDom = editorView.dom;
    
    const handleMouseUp = (e: MouseEvent) => {
      // 選択確定を待つ
      setTimeout(() => updateSelectionCount(e), 10);
    };

    const handleKeyUp = () => {
      // キーボード選択は直近の位置を使う
      setTimeout(() => updateSelectionCount(), 10);
    };

    const handleSelectionChange = () => {
      // ネイティブの selectionchange（ドラッグ/三連クリック等）を扱う
      setTimeout(() => updateSelectionCount(), 10);
    };
    
    editorDom.addEventListener("mouseup", handleMouseUp);
    editorDom.addEventListener("keyup", handleKeyUp);
    document.addEventListener("selectionchange", handleSelectionChange);

    // 初期値
    updateSelectionCount();

    return () => {
      editorDom.removeEventListener("mouseup", handleMouseUp);
      editorDom.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [editorView]);

  // 選択がない場合は描画しない
  if (selectionCount === 0 && !isVisible) {
    return null;
  }

  return (
    <div 
      className={`fixed z-30 px-2 py-1 text-sm text-foreground-tertiary pointer-events-none transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ 
        top: position.top !== undefined ? `${position.top}px` : undefined,
        right: position.right !== undefined ? `${position.right}px` : undefined,
        bottom: position.bottom !== undefined ? `${position.bottom}px` : undefined,
        left: position.left !== undefined ? `${position.left}px` : undefined,
      }}
    >
      <span className="font-semibold">{selectionCount}</span>
      <span className="ml-1">文字</span>
    </div>
  );
}
