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

  contentRef.current = content;

  const handleChange = (markdown: string) => {
    contentRef.current = markdown;
    setContent(markdown);
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
        <Explorer />
        <main className="flex-1 flex flex-col overflow-hidden">
          <NovelEditor
            key={currentFile?.name ?? "new"}
            initialContent={content}
            onChange={handleChange}
          />
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
