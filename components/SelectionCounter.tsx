"use client";

import { useEffect, useState } from "react";
import { EditorView } from "@milkdown/prose/view";

interface SelectionCounterProps {
  editorView: EditorView;
}

export default function SelectionCounter({ editorView }: SelectionCounterProps) {
  const [selectionCount, setSelectionCount] = useState<number>(0);
  const [isVisible, setIsVisible] = useState<boolean>(false);

  useEffect(() => {
    if (!editorView) return;

    const updateSelectionCount = () => {
      const { state } = editorView;
      const { selection } = state;
      const { from, to } = selection;

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
    
    editorDom.addEventListener("mouseup", updateSelectionCount);
    editorDom.addEventListener("keyup", updateSelectionCount);

    // Initial check
    updateSelectionCount();

    return () => {
      editorDom.removeEventListener("mouseup", updateSelectionCount);
      editorDom.removeEventListener("keyup", updateSelectionCount);
    };
  }, [editorView]);

  // Don't render if no selection
  if (selectionCount === 0 && !isVisible) {
    return null;
  }

  return (
    <div 
      className={`fixed bottom-8 right-8 z-30 px-4 py-2 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg text-sm text-slate-700 pointer-events-none border border-slate-200 transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <span className="font-semibold">{selectionCount}</span>
      <span className="ml-1">字選択中</span>
    </div>
  );
}
