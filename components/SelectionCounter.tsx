"use client";

import { useEffect, useState } from "react";
import { EditorView } from "@milkdown/prose/view";

interface SelectionCounterProps {
  editorView: EditorView;
}

export default function SelectionCounter({ editorView }: SelectionCounterProps) {
  const [selectionCount, setSelectionCount] = useState<number>(0);
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [position, setPosition] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  useEffect(() => {
    if (!editorView) return;

    const updateSelectionCount = (event?: MouseEvent | Event) => {
      const { state } = editorView;
      const { selection } = state;
      const { from, to } = selection;

      // Update position if mouse event is provided
      if (event && event instanceof MouseEvent) {
        // Get the editor container's bounding rect
        const editorContainer = editorView.dom.closest('.flex-1.bg-slate-50') as HTMLElement;
        if (editorContainer) {
          const rect = editorContainer.getBoundingClientRect();
          // Position relative to viewport, but calculate based on editor container
          const topPosition = event.clientY;
          const rightPosition = window.innerWidth - rect.right + 16; // 16px from editor's right edge
          
          setPosition({
            top: topPosition,
            right: rightPosition
          });
        }
      }

      // Only show count when there's a selection
      if (from === to) {
        setIsVisible(false);
        // Delay clearing the count to allow fade out animation
        setTimeout(() => setSelectionCount(0), 300);
        return;
      }

      // Get selected text
      const selectedText = state.doc.textBetween(from, to);
      
      // Count characters (excluding whitespace, matching the app's char counting logic)
      const count = selectedText.replace(/\s/g, "").length;
      setSelectionCount(count);
      setIsVisible(true);
    };

    // Listen to selection changes
    const editorDom = editorView.dom;
    
    const handleMouseUp = (e: MouseEvent) => {
      // Use setTimeout to ensure selection is finalized
      setTimeout(() => updateSelectionCount(e), 10);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // For keyboard selections, use the last known position
      setTimeout(() => updateSelectionCount(), 10);
    };

    const handleSelectionChange = () => {
      // Handle native selection change events (for click-drag, triple-click, etc.)
      setTimeout(() => updateSelectionCount(), 10);
    };
    
    editorDom.addEventListener("mouseup", handleMouseUp as any);
    editorDom.addEventListener("keyup", handleKeyUp as any);
    document.addEventListener("selectionchange", handleSelectionChange);

    // Initial check
    updateSelectionCount();

    return () => {
      editorDom.removeEventListener("mouseup", handleMouseUp as any);
      editorDom.removeEventListener("keyup", handleKeyUp as any);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [editorView]);

  // Don't render if no selection
  if (selectionCount === 0 && !isVisible) {
    return null;
  }

  return (
    <div 
      className={`fixed z-30 px-2 py-1 text-sm text-slate-600 pointer-events-none transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ 
        top: `${position.top}px`,
        right: `${position.right}px`
      }}
    >
      <span className="font-semibold">{selectionCount}</span>
      <span className="ml-1">文字</span>
    </div>
  );
}
