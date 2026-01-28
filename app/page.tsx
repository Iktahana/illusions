"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Explorer from "@/components/Explorer";
import Inspector from "@/components/Inspector";
import NovelEditor from "@/components/Editor";
import { StorageProvider, useStorage } from "@/lib/storage-context";

function EditorPage() {
  const { currentDocument, saveDocument, isLoading } = useStorage();
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date>();
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  // Auto-save functionality
  const handleContentChange = async (content: string) => {
    if (!currentDocument) return;

    // Update statistics
    const chars = content.replace(/\s/g, "").length;
    const words = content.split(/\s+/).filter(Boolean).length;
    setCharCount(chars);
    setWordCount(words);

    // Save with debounce (in real implementation)
    setIsSaving(true);
    try {
      await saveDocument({
        ...currentDocument,
        content,
        metadata: {
          ...currentDocument.metadata,
          wordCount: words,
          characterCount: chars,
        },
      });
      setLastSaved(new Date());
    } catch (error) {
      console.error("Failed to save:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Initialize statistics
  useEffect(() => {
    if (currentDocument?.content) {
      const content = currentDocument.content;
      const chars = content.replace(/\s/g, "").length;
      const words = content.split(/\s+/).filter(Boolean).length;
      setCharCount(chars);
      setWordCount(words);
    }
  }, [currentDocument]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-slate-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top Navigation Bar */}
      <Navbar isSaving={isSaving} lastSaved={lastSaved} />

      {/* Main Content: Three Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Explorer */}
        <Explorer />

        {/* Center: Editor */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <NovelEditor
            initialContent={currentDocument?.content || "# 新しい物語\n\nここから物語が始まります..."}
            onChange={handleContentChange}
          />
        </main>

        {/* Right Sidebar: Inspector */}
        <Inspector wordCount={wordCount} charCount={charCount} />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <StorageProvider>
      <EditorPage />
    </StorageProvider>
  );
}
