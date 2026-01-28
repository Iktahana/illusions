"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CACHE_ID_UNSAVED,
  deleteStash,
  getStash,
  upsertStash,
} from "./db";

const DEFAULT_CONTENT = "# 新しい物語\n\nここから物語が始まります...";
const DEBOUNCE_MS = 1000;

function basename(p: string): string {
  const normalized = p.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || p;
}

function hasShowOpenFilePicker(
  w: Window
): w is Window & {
  showOpenFilePicker: (o?: object) => Promise<FileSystemFileHandle[]>;
} {
  return "showOpenFilePicker" in w;
}

function hasShowSaveFilePicker(
  w: Window
): w is Window & {
  showSaveFilePicker: (o?: object) => Promise<FileSystemFileHandle>;
} {
  return "showSaveFilePicker" in w;
}

export interface PendingRecovery {
  id: string;
  content: string;
  last_updated: number;
}

export function useFileStorage() {
  const isElectron =
    typeof window !== "undefined" && Boolean(window.electronAPI?.isElectron);

  const [fileName, setFileName] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [content, setContent] = useState<string>(DEFAULT_CONTENT);
  const [loadedContent, setLoadedContent] = useState<string>(DEFAULT_CONTENT);
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [fileLastModified, setFileLastModified] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveSuccessAt, setSaveSuccessAt] = useState<number | null>(null);
  const [pendingRecovery, setPendingRecovery] = useState<PendingRecovery | null>(null);
  const [restoreRevision, setRestoreRevision] = useState(0);
  const [recoveryCheckDone, setRecoveryCheckDone] = useState(false);

  const contentRef = useRef<string>(content);
  const stashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  contentRef.current = content;

  const cacheId = fileName ?? CACHE_ID_UNSAVED;

  const runRecoveryCheck = useCallback(
    async (id: string, localModified: number | null) => {
      const stash = await getStash(id);
      if (!stash) {
        setRecoveryCheckDone(true);
        return;
      }
      const stashNewer =
        localModified == null || stash.last_updated > localModified;
      if (!stashNewer) {
        setRecoveryCheckDone(true);
        return;
      }
      setPendingRecovery({
        id: stash.id,
        content: stash.content,
        last_updated: stash.last_updated,
      });
      setRecoveryCheckDone(true);
    },
    []
  );

  useEffect(() => {
    runRecoveryCheck(CACHE_ID_UNSAVED, null);
  }, [runRecoveryCheck]);

  const openFile = useCallback(async () => {
    if (isElectron && window.electronAPI) {
      try {
        const result = await window.electronAPI.openFile();
        if (!result) return;
        setFilePath(result.path);
        setFileName(basename(result.path));
        setContent(result.content);
        setLoadedContent(result.content);
        setFileLastModified(Date.now());
        setLastSaved(null);
        setPendingRecovery(null);
        runRecoveryCheck(result.path, Date.now());
      } catch (err) {
        console.error("Failed to open file (Electron):", err);
      }
      return;
    }
    if (typeof window === "undefined" || !hasShowOpenFilePicker(window)) {
      console.warn("File System Access API is not supported.");
      return;
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: "Markdown",
            accept: { "text/markdown": [".md"] },
          },
        ],
        multiple: false,
      });
      const file = await handle.getFile();
      const text = await file.text();
      const modified = file.lastModified;
      setFileHandle(handle);
      setFileName(file.name);
      setFilePath(null);
      setContent(text);
      setLoadedContent(text);
      setFileLastModified(modified);
      setLastSaved(null);
      setPendingRecovery(null);
      runRecoveryCheck(file.name, modified);
    } catch (err) {
      if ((err as { name?: string }).name !== "AbortError") {
        console.error("Failed to open file:", err);
      }
    }
  }, [isElectron, runRecoveryCheck]);

  const save = useCallback(
    async (getContent: () => string) => {
      if (typeof window === "undefined") return;
      const raw = getContent();

      if (isElectron && window.electronAPI) {
        const idToClear = filePath ?? CACHE_ID_UNSAVED;
        setIsSaving(true);
        try {
          const savedPath = await window.electronAPI.saveFile(filePath, raw);
          if (!savedPath) return;
          setFilePath(savedPath);
          setFileName(basename(savedPath));
          setFileLastModified(Date.now());
          const now = new Date();
          setLastSaved(now);
          setSaveSuccessAt(now.getTime());
          await deleteStash(idToClear);
        } catch (err) {
          console.error("Failed to save file (Electron):", err);
        } finally {
          setIsSaving(false);
        }
        return;
      }
      if (!hasShowSaveFilePicker(window) && !fileHandle) {
        console.warn("File System Access API is not supported.");
        return;
      }
      const idToClear = fileName ?? CACHE_ID_UNSAVED;
      setIsSaving(true);
      try {
        let handle = fileHandle;
        if (!handle && hasShowSaveFilePicker(window)) {
          handle = await window.showSaveFilePicker({
            types: [
              {
                description: "Markdown",
                accept: { "text/markdown": [".md"] },
              },
            ],
          });
          setFileHandle(handle);
          setFileName(handle.name);
          setFileLastModified(null);
        }
        if (!handle) {
          setIsSaving(false);
          return;
        }
        const writable = await handle.createWritable();
        await writable.write(raw);
        await writable.close();
        const now = new Date();
        setLastSaved(now);
        setSaveSuccessAt(now.getTime());
        await deleteStash(idToClear);
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") {
          console.error("Failed to save file:", err);
        }
      } finally {
        setIsSaving(false);
      }
    },
    [fileHandle, fileName, filePath, isElectron]
  );

  const clearSaveSuccess = useCallback(() => {
    setSaveSuccessAt(null);
  }, []);

  const restoreStash = useCallback(() => {
    if (!pendingRecovery) return;
    const { content: stashContent } = pendingRecovery;
    setContent(stashContent);
    setLoadedContent(stashContent);
    setPendingRecovery(null);
    setRestoreRevision((r) => r + 1);
  }, [pendingRecovery]);

  const discardStash = useCallback(async () => {
    if (!pendingRecovery) return;
    await deleteStash(pendingRecovery.id);
    setPendingRecovery(null);
  }, [pendingRecovery]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !recoveryCheckDone ||
      pendingRecovery
    )
      return;
    const schedule = () => {
      if (stashTimerRef.current) clearTimeout(stashTimerRef.current);
      stashTimerRef.current = setTimeout(() => {
        stashTimerRef.current = null;
        upsertStash(cacheId, contentRef.current).catch((e) =>
          console.error("Auto-save stash failed:", e)
        );
      }, DEBOUNCE_MS);
    };
    schedule();
    return () => {
      if (stashTimerRef.current) {
        clearTimeout(stashTimerRef.current);
        stashTimerRef.current = null;
      }
    };
  }, [content, cacheId, pendingRecovery, recoveryCheckDone]);

  return {
    fileName,
    filePath,
    content,
    setContent,
    loadedContent,
    fileHandle,
    fileLastModified,
    openFile,
    save,
    isSaving,
    lastSaved,
    saveSuccessAt,
    clearSaveSuccess,
    defaultContent: DEFAULT_CONTENT,
    pendingRecovery,
    restoreStash,
    discardStash,
    restoreRevision,
  };
}
