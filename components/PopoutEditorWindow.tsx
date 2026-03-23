"use client";

/**
 * PopoutEditorWindow — simplified single-editor view for popout windows.
 *
 * Rendered when the page detects ?popout-buffer=<id> in the URL.
 * Shows only the editor (no sidebar, no inspector, no menu bar).
 * Buffer content is synced with the parent window via Electron IPC.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import ErrorBoundary from "@/components/ErrorBoundary";
import NovelEditor from "@/components/Editor";
import { EditorSettingsProvider } from "@/contexts/EditorSettingsContext";
import { useEditorSettings } from "@/lib/editor-page/use-editor-settings";

import type { SupportedFileExtension } from "@/lib/project/project-types";

interface PopoutEditorWindowProps {
  bufferId: string;
  fileName: string;
  fileType: SupportedFileExtension;
}

export default function PopoutEditorWindow({
  bufferId,
  fileName,
  fileType,
}: PopoutEditorWindowProps) {
  const [content, setContent] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const contentRef = useRef("");
  const incrementEditorKey = useCallback(() => setEditorKey((k) => k + 1), []);

  // Editor settings (reuse the same hook for consistent appearance)
  const { settings, handlers: settingsHandlers } = useEditorSettings(incrementEditorKey);

  const mdiExtensionsEnabled = fileType === ".mdi";
  const gfmEnabled = fileType !== ".txt";

  // Set window title
  useEffect(() => {
    document.title = `${fileName} — illusions`;
  }, [fileName]);

  // Listen for buffer sync from parent window (Electron IPC)
  useEffect(() => {
    const electronAPI = window.electronAPI;
    if (!electronAPI?.editor?.onBufferSync) return;

    const unsub = electronAPI.editor.onBufferSync((data) => {
      if (data.bufferId === bufferId && data.content !== contentRef.current) {
        contentRef.current = data.content;
        setContent(data.content);
        setEditorKey((k) => k + 1);
      }
    });

    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [bufferId]);

  // Broadcast content changes back to other windows
  const handleChange = useCallback(
    (newContent: string) => {
      contentRef.current = newContent;
      setContent(newContent);

      const electronAPI = window.electronAPI;
      if (electronAPI?.editor?.sendBufferSync) {
        electronAPI.editor.sendBufferSync(bufferId, newContent);
      }
    },
    [bufferId],
  );

  // Notify parent on close
  useEffect(() => {
    return () => {
      const electronAPI = window.electronAPI;
      if (electronAPI?.editor?.sendBufferClose) {
        electronAPI.editor.sendBufferClose(bufferId);
      }
    };
  }, [bufferId]);

  return (
    <EditorSettingsProvider settings={settings} handlers={settingsHandlers}>
      <div className="h-screen flex flex-col overflow-hidden bg-background">
        {/* Minimal top bar with file name */}
        <div className="flex items-center h-8 px-3 bg-background-elevated border-b border-border text-xs text-foreground-secondary select-none shrink-0">
          <span className="truncate">{fileName}</span>
        </div>

        {/* Editor area */}
        <main className="flex-1 overflow-hidden min-h-0">
          <ErrorBoundary sectionName="エディタ">
            <NovelEditor
              key={`popout-${bufferId}-${editorKey}`}
              initialContent={content}
              onChange={handleChange}
              mdiExtensionsEnabled={mdiExtensionsEnabled}
              gfmEnabled={gfmEnabled}
            />
          </ErrorBoundary>
        </main>
      </div>
    </EditorSettingsProvider>
  );
}
