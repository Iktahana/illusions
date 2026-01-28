"use client";

import { useEffect, useRef } from "react";
import Explorer from "@/components/Explorer";
import Inspector from "@/components/Inspector";
import NovelEditor from "@/components/Editor";
import AiStatusIndicator from "@/components/AiStatusIndicator";
import { useMdiFile } from "@/lib/use-mdi-file";

function chars(s: string) {
  return s.replace(/\s/g, "").length;
}

function words(s: string) {
  return s.split(/\s+/).filter(Boolean).length;
}

export default function EditorPage() {
  const mdiFile = useMdiFile();
  const { content, setContent, currentFile, isDirty, isSaving, lastSavedTime, openFile, saveFile } =
    mdiFile;

  const contentRef = useRef<string>(content);
  const editorDomRef = useRef<HTMLDivElement>(null);

  contentRef.current = content;

  const handleChange = (markdown: string) => {
    contentRef.current = markdown;
    setContent(markdown);
  };

  const handleChapterClick = (lineNumber: number) => {
    // Find the editor's ProseMirror container
    const editor = editorDomRef.current?.querySelector('.milkdown .ProseMirror') as HTMLElement;
    if (!editor) return;

    // Get all lines in the editor
    const lines = editor.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
    if (lineNumber < lines.length) {
      const targetLine = lines[lineNumber] as HTMLElement;
      
      // Scroll the target line into view
      targetLine.scrollIntoView({ behavior: 'smooth', block: 'start' });
      
      // Optional: highlight or focus the element
      targetLine.focus();
    }
  };

  const wordCount = words(content);
  const charCount = chars(content);

  const fileName = currentFile?.name ?? (isDirty ? "Untitled (unsaved)" : "Untitled");

  // Handle Cmd+S / Ctrl+S keyboard shortcut to save file
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Cmd+S (macOS) or Ctrl+S (Windows/Linux)
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const isSaveShortcut = isMac
        ? event.metaKey && event.key === "s"
        : event.ctrlKey && event.key === "s";

      if (isSaveShortcut) {
        event.preventDefault(); // Prevent browser's default save dialog
        void saveFile();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [saveFile]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="flex-1 flex overflow-hidden">
        <Explorer content={content} onChapterClick={handleChapterClick} />
        <main className="flex-1 flex flex-col overflow-hidden">
          <div ref={editorDomRef} className="flex-1">
            <NovelEditor
              key={currentFile?.name ?? "new"}
              initialContent={content}
              onChange={handleChange}
            />
          </div>
        </main>
        <Inspector 
          wordCount={wordCount} 
          charCount={charCount}
          fileName={fileName}
          isDirty={isDirty}
          isSaving={isSaving}
          lastSavedTime={lastSavedTime}
          onOpenFile={openFile}
        />
      </div>

      <AiStatusIndicator />
    </div>
  );
}
