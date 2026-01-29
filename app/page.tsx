"use client";

import { useEffect, useRef, useState } from "react";
import Explorer from "@/components/Explorer";
import Inspector from "@/components/Inspector";
import NovelEditor from "@/components/Editor";
import AiStatusIndicator from "@/components/AiStatusIndicator";
import ResizablePanel from "@/components/ResizablePanel";
import { useMdiFile } from "@/lib/use-mdi-file";
import { isElectronRenderer } from "@/lib/runtime-env";

function chars(s: string) {
  return s.replace(/\s/g, "").length;
}

function words(s: string) {
  return s.split(/\s+/).filter(Boolean).length;
}

export default function EditorPage() {
  const mdiFile = useMdiFile();
  const { content, setContent, currentFile, isDirty, isSaving, lastSavedTime, openFile, saveFile, newFile, updateFileName, wasAutoRecovered } =
    mdiFile;

  const contentRef = useRef<string>(content);
  const editorDomRef = useRef<HTMLDivElement>(null);
  const [dismissedRecovery, setDismissedRecovery] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [searchOpenTrigger, setSearchOpenTrigger] = useState(0);
  
  // Editor style settings
  const [fontScale, setFontScale] = useState(100); // 100% = default size
  const [lineHeight, setLineHeight] = useState(1.8);
  const [textIndent, setTextIndent] = useState(1);
  const [fontFamily, setFontFamily] = useState('Noto Serif JP');
  const [charsPerLine, setCharsPerLine] = useState(40); // 0 = no limit, default 40
  
  const isElectron = typeof window !== "undefined" && isElectronRenderer();

  // Auto-dismiss recovery notification after 5 seconds
  useEffect(() => {
    if (wasAutoRecovered && !dismissedRecovery) {
      const timer = setTimeout(() => {
        setDismissedRecovery(true);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [wasAutoRecovered, dismissedRecovery]);


  contentRef.current = content;

  const handleChange = (markdown: string) => {
    contentRef.current = markdown;
    setContent(markdown);
  };

  const handleInsertText = (text: string) => {
    const currentContent = contentRef.current;
    const newContent = currentContent ? `${currentContent}\n\n${text}` : text;
    setContent(newContent);
    // Force editor to remount with new content
    setEditorKey(prev => prev + 1);
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

  // Handle keyboard shortcuts: Cmd+S / Ctrl+S to save, Cmd+F / Ctrl+F to search
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      
      // Check for Cmd+S (macOS) or Ctrl+S (Windows/Linux) - Save file
      const isSaveShortcut = isMac
        ? event.metaKey && event.key === "s"
        : event.ctrlKey && event.key === "s";

      // Check for Cmd+F (macOS) or Ctrl+F (Windows/Linux) - Search
      const isSearchShortcut = isMac
        ? event.metaKey && event.key === "f"
        : event.ctrlKey && event.key === "f";

      if (isSaveShortcut) {
        event.preventDefault(); // Prevent browser's default save dialog
        void saveFile();
      } else if (isSearchShortcut) {
        event.preventDefault(); // Prevent browser's default find dialog
        setSearchOpenTrigger(prev => prev + 1); // Trigger search dialog
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [saveFile]);

  return (
    <div className="h-screen flex flex-col overflow-hidden relative">
      {/* Auto-recovery notification (Web only) - fixed position */}
      {!isElectron && wasAutoRecovered && !dismissedRecovery && (
        <div className="fixed left-0 top-0 right-0 z-50 bg-gradient-to-r from-emerald-50 to-teal-50 border-b-2 border-emerald-300 px-4 py-3 flex items-center justify-between animate-slide-in-down shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-emerald-500 rounded-full flex-shrink-0 animate-pulse-glow"></div>
            <p className="text-sm text-emerald-900">
              <span className="font-semibold">✓ Previously edited file recovered:</span> <span className="font-mono text-emerald-700">{currentFile?.name}</span>
            </p>
          </div>
          <button
            onClick={() => setDismissedRecovery(true)}
            className="text-emerald-500 hover:text-emerald-700 hover:bg-emerald-100 text-lg font-medium flex-shrink-0 ml-4 w-8 h-8 rounded flex items-center justify-center transition-all duration-200 hover:scale-110"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <ResizablePanel side="left" defaultWidth={256} minWidth={200} maxWidth={400}>
          <Explorer 
            content={content} 
            onChapterClick={handleChapterClick} 
            onInsertText={handleInsertText}
            fontScale={fontScale}
            onFontScaleChange={setFontScale}
            lineHeight={lineHeight}
            onLineHeightChange={setLineHeight}
            textIndent={textIndent}
            onTextIndentChange={setTextIndent}
            fontFamily={fontFamily}
            onFontFamilyChange={setFontFamily}
            charsPerLine={charsPerLine}
            onCharsPerLineChange={setCharsPerLine}
          />
        </ResizablePanel>
        
        <main className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div ref={editorDomRef} className="flex-1 min-h-0">
            <NovelEditor
              key={`${currentFile?.name ?? "new"}-${editorKey}`}
              initialContent={content}
              onChange={handleChange}
              onInsertText={handleInsertText}
              fontScale={fontScale}
              lineHeight={lineHeight}
              textIndent={textIndent}
              fontFamily={fontFamily}
              charsPerLine={charsPerLine}
              searchOpenTrigger={searchOpenTrigger}
            />
          </div>
        </main>
        
        <ResizablePanel side="right" defaultWidth={256} minWidth={200} maxWidth={400}>
          <Inspector 
            wordCount={wordCount} 
            charCount={charCount}
            fileName={fileName}
            isDirty={isDirty}
            isSaving={isSaving}
            lastSavedTime={lastSavedTime}
            onOpenFile={openFile}
            onNewFile={newFile}
            onFileNameChange={updateFileName}
          />
        </ResizablePanel>
      </div>

      <AiStatusIndicator />
    </div>
  );
}
