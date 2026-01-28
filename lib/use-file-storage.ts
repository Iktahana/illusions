"use client";

import { useCallback, useState } from "react";

const DEFAULT_CONTENT = "# 新しい物語\n\nここから物語が始まります...";

function hasShowOpenFilePicker(w: Window): w is Window & { showOpenFilePicker: (o?: object) => Promise<FileSystemFileHandle[]> } {
  return "showOpenFilePicker" in w;
}

function hasShowSaveFilePicker(w: Window): w is Window & { showSaveFilePicker: (o?: object) => Promise<FileSystemFileHandle> } {
  return "showSaveFilePicker" in w;
}

export function useFileStorage() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [content, setContent] = useState<string>(DEFAULT_CONTENT);
  const [loadedContent, setLoadedContent] = useState<string>(DEFAULT_CONTENT);
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveSuccessAt, setSaveSuccessAt] = useState<number | null>(null);

  const openFile = useCallback(async () => {
    if (typeof window === "undefined" || !hasShowOpenFilePicker(window)) {
      console.warn("File System Access API is not supported.");
      return;
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: "Markdown", accept: { "text/markdown": [".md"] } }],
        multiple: false,
      });
      const file = await handle.getFile();
      const text = await file.text();
      setFileHandle(handle);
      setFileName(file.name);
      setContent(text);
      setLoadedContent(text);
      setLastSaved(null);
    } catch (err) {
      if ((err as { name?: string }).name !== "AbortError") {
        console.error("Failed to open file:", err);
      }
    }
  }, []);

  const save = useCallback(
    async (getContent: () => string) => {
      if (typeof window === "undefined") return;
      if (!hasShowSaveFilePicker(window) && !fileHandle) {
        console.warn("File System Access API is not supported.");
        return;
      }
      setIsSaving(true);
      try {
        let handle = fileHandle;
        if (!handle && hasShowSaveFilePicker(window)) {
          handle = await window.showSaveFilePicker({
            types: [{ description: "Markdown", accept: { "text/markdown": [".md"] } }],
          });
          setFileHandle(handle);
          setFileName(handle.name);
        }
        if (!handle) {
          setIsSaving(false);
          return;
        }
        const writable = await handle.createWritable();
        await writable.write(getContent());
        await writable.close();
        const now = new Date();
        setLastSaved(now);
        setSaveSuccessAt(now.getTime());
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") {
          console.error("Failed to save file:", err);
        }
      } finally {
        setIsSaving(false);
      }
    },
    [fileHandle]
  );

  const clearSaveSuccess = useCallback(() => {
    setSaveSuccessAt(null);
  }, []);

  return {
    fileName,
    content,
    setContent,
    loadedContent,
    fileHandle,
    openFile,
    save,
    isSaving,
    lastSaved,
    saveSuccessAt,
    clearSaveSuccess,
    defaultContent: DEFAULT_CONTENT,
  };
}
