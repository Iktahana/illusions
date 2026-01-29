"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Explorer from "@/components/Explorer";
import Inspector from "@/components/Inspector";
import NovelEditor from "@/components/Editor";
import ResizablePanel from "@/components/ResizablePanel";
import { useMdiFile } from "@/lib/use-mdi-file";
import { isElectronRenderer } from "@/lib/runtime-env";
import { fetchAppState, persistAppState } from "@/lib/app-state-manager";

function chars(s: string) {
  return s.replace(/\s/g, "").length;
}

function words(s: string) {
  return s.split(/\s+/).filter(Boolean).length;
}

export default function EditorPage() {
  const mdiFile = useMdiFile();
  const { content, setContent, currentFile, isDirty, isSaving, lastSavedTime, openFile: originalOpenFile, saveFile, newFile: originalNewFile, updateFileName, wasAutoRecovered } =
    mdiFile;

  const contentRef = useRef<string>(content);
  const editorDomRef = useRef<HTMLDivElement>(null);
  const [dismissedRecovery, setDismissedRecovery] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [searchOpenTrigger, setSearchOpenTrigger] = useState(0);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [saveToastExiting, setSaveToastExiting] = useState(false);
  // Stable file session ID - only changes when opening/creating a new file
  const fileSessionRef = useRef(0);
  const prevLastSavedTimeRef = useRef<number | null>(null);
  const hasAutoRecoveredRef = useRef(false);

  // Remount editor when file is auto-recovered (page refresh)
  useEffect(() => {
    if (wasAutoRecovered && !hasAutoRecoveredRef.current) {
      hasAutoRecoveredRef.current = true;
      fileSessionRef.current += 1;
      setEditorKey(prev => prev + 1);
    }
  }, [wasAutoRecovered]);

  // Wrap openFile and newFile to increment session ID
  const openFile = useCallback(async () => {
    await originalOpenFile();
    
    fileSessionRef.current += 1;
    setEditorKey(prev => prev + 1);
  }, [originalOpenFile]);

  const newFile = useCallback(() => {
    originalNewFile();
    fileSessionRef.current += 1;
    setEditorKey(prev => prev + 1);
  }, [originalNewFile]);
  
  // Editor style settings
  const [fontScale, setFontScale] = useState(100); // 100% = default size
  const [lineHeight, setLineHeight] = useState(1.8);
  const [paragraphSpacing, setParagraphSpacing] = useState(0); // 0em = no spacing
  const [textIndent, setTextIndent] = useState(1);
  const [fontFamily, setFontFamily] = useState('Noto Serif JP');
  const [charsPerLine, setCharsPerLine] = useState(40); // 0 = no limit, default 40
  const [showParagraphNumbers, setShowParagraphNumbers] = useState(false);
  
  const isElectron = typeof window !== "undefined" && isElectronRenderer();

  // Show save toast when lastSavedTime changes (file saved)
  useEffect(() => {
    if (lastSavedTime && prevLastSavedTimeRef.current !== lastSavedTime) {
      // Only show if this is not the first load
      if (prevLastSavedTimeRef.current !== null) {
        setShowSaveToast(true);
        setSaveToastExiting(false);
        
        const hideTimer = setTimeout(() => {
          setSaveToastExiting(true);
          setTimeout(() => {
            setShowSaveToast(false);
            setSaveToastExiting(false);
          }, 150); // Match animation duration
        }, 1200);

        prevLastSavedTimeRef.current = lastSavedTime;
        return () => clearTimeout(hideTimer);
      }
      prevLastSavedTimeRef.current = lastSavedTime;
    }
  }, [lastSavedTime]);

  useEffect(() => {
    let mounted = true;

    const loadSettings = async () => {
      try {
        const appState = await fetchAppState();
        if (!mounted || !appState) return;
        if (typeof appState.paragraphSpacing === "number") {
          setParagraphSpacing(appState.paragraphSpacing);
        }
        if (typeof appState.showParagraphNumbers === "boolean") {
          setShowParagraphNumbers(appState.showParagraphNumbers);
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      }
    };

    void loadSettings();

    return () => {
      mounted = false;
    };
  }, []);

  const handleParagraphSpacingChange = useCallback((value: number) => {
    setParagraphSpacing(value);
    void persistAppState({ paragraphSpacing: value }).catch((error) => {
      console.error("Failed to persist paragraph spacing:", error);
    });
  }, []);

  const handleShowParagraphNumbersChange = useCallback((value: boolean) => {
    setShowParagraphNumbers(value);
    void persistAppState({ showParagraphNumbers: value }).catch((error) => {
      console.error("Failed to persist paragraph numbers setting:", error);
    });
  }, []);

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
    // Note: Heading anchors are now managed by the markdown editor itself
    // No need for additional processing here
    setContent(newContent);
    // Force editor to remount with new content
    setEditorKey(prev => prev + 1);
  };

  const handleChapterClick = (anchorId: string) => {
    if (!anchorId) return;

    const target = document.getElementById(anchorId) as HTMLElement | null;
    if (!target) return;

    // Scroll the target line into view
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    // Optional: highlight or focus the element
    target.focus();
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
        <div className="fixed left-0 top-0 right-0 z-50 bg-background-elevated border-b border-border px-4 py-3 flex items-center justify-between animate-slide-in-down shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-success rounded-full flex-shrink-0 animate-pulse-glow"></div>
            <p className="text-sm text-foreground">
              <span className="font-semibold text-foreground">✓ Previously edited file recovered:</span> <span className="font-mono text-success">{currentFile?.name}</span>
            </p>
          </div>
          <button
            onClick={() => setDismissedRecovery(true)}
            className="text-foreground-secondary hover:text-foreground hover:bg-hover text-lg font-medium flex-shrink-0 ml-4 w-8 h-8 rounded flex items-center justify-center transition-all duration-200 hover:scale-110"
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
            paragraphSpacing={paragraphSpacing}
            onParagraphSpacingChange={handleParagraphSpacingChange}
            textIndent={textIndent}
            onTextIndentChange={setTextIndent}
            fontFamily={fontFamily}
            onFontFamilyChange={setFontFamily}
            charsPerLine={charsPerLine}
            onCharsPerLineChange={setCharsPerLine}
            showParagraphNumbers={showParagraphNumbers}
            onShowParagraphNumbersChange={handleShowParagraphNumbersChange}
          />
        </ResizablePanel>
        
        <main className="flex-1 flex flex-col overflow-hidden min-h-0 relative">
          <div ref={editorDomRef} className="flex-1 min-h-0">
            <NovelEditor
              key={`file-${fileSessionRef.current}-${editorKey}`}
              initialContent={content}
              onChange={handleChange}
              onInsertText={handleInsertText}
              fontScale={fontScale}
              lineHeight={lineHeight}
              paragraphSpacing={paragraphSpacing}
              textIndent={textIndent}
              fontFamily={fontFamily}
              charsPerLine={charsPerLine}
              searchOpenTrigger={searchOpenTrigger}
              showParagraphNumbers={showParagraphNumbers}
            />
          </div>
          
          {/* Save success toast */}
          {showSaveToast && (
            <div 
              className={`fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-background-elevated border border-border rounded-lg shadow-lg flex items-center gap-2 z-50 ${
                saveToastExiting ? 'animate-save-toast-out' : 'animate-save-toast-in'
              }`}
            >
              <span className="text-success text-sm font-medium">✓</span>
              <span className="text-foreground-secondary text-sm">保存しました</span>
            </div>
          )}
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
    </div>
  );
}
