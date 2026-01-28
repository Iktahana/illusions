"use client";

import { useRef } from "react";
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
  const { content, setContent, currentFile, isDirty, isSaving, lastSavedTime } =
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
        />
      </div>

      <AiStatusIndicator />
    </div>
  );
}
