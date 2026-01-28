"use client";

import { useEffect, useRef } from "react";
import Navbar from "@/components/Navbar";
import Explorer from "@/components/Explorer";
import Inspector from "@/components/Inspector";
import NovelEditor from "@/components/Editor";
import { useFileStorage } from "@/lib/use-file-storage";

function chars(s: string) {
  return s.replace(/\s/g, "").length;
}

function words(s: string) {
  return s.split(/\s+/).filter(Boolean).length;
}

export default function EditorPage() {
  const storage = useFileStorage();
  const {
    fileName,
    content,
    setContent,
    loadedContent,
    openFile,
    save,
    isSaving,
    lastSaved,
    saveSuccessAt,
    clearSaveSuccess,
  } = storage;
  const contentRef = useRef<string>(content);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        save(() => contentRef.current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save]);

  const handleChange = (markdown: string) => {
    contentRef.current = markdown;
    setContent(markdown);
  };

  const wordCount = words(content);
  const charCount = chars(content);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Navbar
        fileName={fileName}
        isSaving={isSaving}
        lastSaved={lastSaved}
        saveSuccessAt={saveSuccessAt}
        onClearSaveSuccess={clearSaveSuccess}
        onOpenFile={openFile}
      />

      <div className="flex-1 flex overflow-hidden">
        <Explorer />
        <main className="flex-1 flex flex-col overflow-hidden">
          <NovelEditor
            key={fileName ?? "new"}
            initialContent={loadedContent}
            onChange={handleChange}
          />
        </main>
        <Inspector wordCount={wordCount} charCount={charCount} />
      </div>
    </div>
  );
}
