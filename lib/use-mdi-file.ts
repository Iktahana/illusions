"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { openMdiFile, saveMdiFile, type MdiFileDescriptor } from "./mdi-file";
import { isElectronRenderer } from "./runtime-env";
import { getStorageService } from "./storage-service";
import { persistAppState } from "./app-state-manager";

const DEFAULT_CONTENT = "# 錯覚\n\n物語はここから始めます。\n\n";
const AUTO_SAVE_INTERVAL = 2000; // 2 seconds
const DEMO_FILE_NAME = "鏡地獄.mdi";

async function loadDemoContent(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  try {
    const url = new URL("demo/鏡地獄.mdi", window.location.href);
    const response = await fetch(url.toString());
    if (!response.ok) return null;
    return await response.text();
  } catch (error) {
    console.warn("Failed to load demo document:", error);
    return null;
  }
}

export interface UseMdiFileReturn {
  currentFile: MdiFileDescriptor | null;
  content: string;
  setContent: (content: string) => void;
  isDirty: boolean;
  isSaving: boolean;
  lastSavedTime: number | null;
  openFile: () => Promise<void>;
  saveFile: () => Promise<void>;
  newFile: () => void;
  updateFileName: (newName: string) => void;
  wasAutoRecovered?: boolean; // Web only - whether file was auto-recovered
}

export function useMdiFile(): UseMdiFileReturn {
  const isElectron =
    typeof window !== "undefined" && isElectronRenderer();

  const [currentFile, setCurrentFile] = useState<MdiFileDescriptor | null>(null);
  const [content, setContentState] = useState<string>(DEFAULT_CONTENT);
  const [lastSavedContent, setLastSavedContent] = useState<string>(DEFAULT_CONTENT);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<number | null>(null);
  const [wasAutoRecovered, setWasAutoRecovered] = useState(false);

  const contentRef = useRef<string>(content);
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  contentRef.current = content;

  const isDirty = content !== lastSavedContent;

  const persistLastOpenedPath = useCallback(async (path: string) => {
    try {
      await persistAppState({ lastOpenedMdiPath: path });
    } catch (error) {
      console.error("Failed to persist last opened path:", error);
    }
  }, []);

  // Notify Electron about dirty state.
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.setDirty) return;
    window.electronAPI.setDirty(isDirty);
  }, [isDirty, isElectron]);

  // Initialize storage and try to restore previous file handle (Web only)
  useEffect(() => {
    const initializeStorage = async () => {
      try {
        const storage = getStorageService();
        await storage.initialize();
        const session = await storage.loadSession();
        const appState = await storage.loadAppState();
        const hasSeenDemo = appState?.hasSeenDemo ?? false;
        const hasSessionData = Boolean(
          session &&
          (Object.keys(session.appState || {}).length > 0 ||
            session.recentFiles.length > 0 ||
            session.editorBuffer)
        );

        // Web environment: try to restore file handle from editor buffer
        if (!isElectron) {
          const buffer = await storage.loadEditorBuffer();
          if (buffer?.fileHandle) {
            try {
              // Try to access the file directly to verify we still have permission
              const file = await buffer.fileHandle.getFile();
              const content = await file.text();

              setCurrentFile({
                path: null,
                handle: buffer.fileHandle,
                name: file.name,
              });
              setContentState(content);
              setLastSavedContent(content);
              setLastSavedTime(Date.now());
              setWasAutoRecovered(true);
              if (!hasSeenDemo) {
                await persistAppState({ hasSeenDemo: true });
              }
              return;
            } catch (error) {
              console.warn("Could not restore previous file (permission may have been revoked):", error);
              // Clear the stale handle
              await storage.clearEditorBuffer();
            }
          }
        }

        if (!hasSeenDemo && !hasSessionData) {
          const demoContent = await loadDemoContent();
          if (demoContent) {
            setCurrentFile({
              path: null,
              handle: null,
              name: DEMO_FILE_NAME,
            });
            setContentState(demoContent);
            setLastSavedContent(demoContent);
            setLastSavedTime(null);
            setWasAutoRecovered(false);
            await persistAppState({ hasSeenDemo: true });
          }
        }
      } catch (error) {
        console.error("Failed to initialize storage:", error);
      }
    };

    void initializeStorage();
  }, [isElectron]);

  const setContent = useCallback((newContent: string) => {
    setContentState(newContent);
  }, []);

  const newFile = useCallback(() => {
    setCurrentFile(null);
    setContentState(DEFAULT_CONTENT);
    setLastSavedContent(DEFAULT_CONTENT);
    setLastSavedTime(null);
    setWasAutoRecovered(false);
  }, []);

  const updateFileName = useCallback((newName: string) => {
    if (!currentFile) {
      // If no file is open, create a new file descriptor with the new name
      setCurrentFile({
        path: null,
        handle: null,
        name: newName,
      });
    } else {
      // Update the existing file descriptor with the new name
      setCurrentFile({
        ...currentFile,
        name: newName,
      });
    }
  }, [currentFile]);

  const openFile = useCallback(async () => {
    const result = await openMdiFile();
    if (!result) {
      // User canceled or error - keep current state
      return;
    }
    const { descriptor, content: fileContent } = result;
    setCurrentFile(descriptor);
    setContentState(fileContent);
    setLastSavedContent(fileContent);
    setLastSavedTime(Date.now());
    
      // Save the last opened file path or handle to storage
      try {
        if (isElectron && descriptor.path) {
          await persistLastOpenedPath(descriptor.path);
        } else if (!isElectron && descriptor.handle) {
          const storage = getStorageService();
          await storage.initialize();
          await storage.saveEditorBuffer({
            content: fileContent,
            timestamp: Date.now(),
            fileHandle: descriptor.handle,
          });
        }
      } catch (error) {
        console.error("Failed to save file reference:", error);
      }

  }, [isElectron, persistLastOpenedPath]);

  const saveFile = useCallback(async () => {
    if (isSaving) return;

    setIsSaving(true);
    try {
      const result = await saveMdiFile({
        descriptor: currentFile,
        content: contentRef.current,
      });

      if (result) {
        const { descriptor } = result;
        setCurrentFile(descriptor);
        setLastSavedContent(contentRef.current);
        setLastSavedTime(Date.now());
        
        // Save the last opened file path or handle to storage
        try {
          if (isElectron && descriptor.path) {
            await persistLastOpenedPath(descriptor.path);
          } else if (!isElectron && descriptor.handle) {
            const storage = getStorageService();
            await storage.initialize();
            await storage.saveEditorBuffer({
              content: contentRef.current,
              timestamp: Date.now(),
              fileHandle: descriptor.handle,
            });
          }
        } catch (error) {
          console.error("Failed to save file reference:", error);
        }
      }
    } catch (error) {
      console.error("Failed to save file:", error);
    } finally {
      setIsSaving(false);
    }
  }, [currentFile, isElectron, isSaving]);

  // Auto-save every 5 seconds if dirty and file is open.
  useEffect(() => {
    const autoSave = async () => {
      if (isDirty && currentFile) {
        await saveFile();
      }
    };

    autoSaveTimerRef.current = setInterval(() => {
      void autoSave();
    }, AUTO_SAVE_INTERVAL);

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
    };
  }, [isDirty, currentFile, saveFile]);

  // Handle Electron save-before-close request.
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onSaveBeforeClose) return;

    const cleanup = window.electronAPI.onSaveBeforeClose(async () => {
      if (isDirty) {
        await saveFile();
      }
      await window.electronAPI?.saveDoneAndClose?.();
    });

    return cleanup;
  }, [isDirty, saveFile, isElectron]);

  // Handle files opened from system (double-click .mdi file).
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onOpenFileFromSystem) return;

    const cleanup = window.electronAPI.onOpenFileFromSystem(({ path, content: fileContent }) => {
      const now = Date.now();
      setCurrentFile({
        path,
        handle: null,
        name: path.split("/").pop() || "無題",
      });
      setContentState(fileContent);
      setLastSavedContent(fileContent);
      setLastSavedTime(now);
    });

    return cleanup;
  }, [isElectron]);

  // Handle menu save command.
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onMenuSave) return;

    const cleanup = window.electronAPI.onMenuSave(async () => {
      await saveFile();
    });

    return cleanup;
  }, [saveFile, isElectron]);

  // Handle menu save-as command.
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onMenuSaveAs) return;

    const cleanup = window.electronAPI.onMenuSaveAs(async () => {
      const raw = contentRef.current;
      setIsSaving(true);
      try {
        const descriptor: MdiFileDescriptor | null = currentFile
          ? {
              path: null,
              handle: null,
              name: currentFile.name,
            }
          : null;

        const result = await saveMdiFile({
          descriptor,
          content: raw,
        });

        if (result) {
          const { descriptor } = result;
          setCurrentFile(descriptor);
          setLastSavedContent(raw);
          setLastSavedTime(Date.now());
          
          // Save the last opened file path or handle to storage
          try {
            const storage = getStorageService();
            await storage.initialize();
            
            if (descriptor.path) {
              await persistLastOpenedPath(descriptor.path);
            } else if (descriptor.handle) {
              await storage.saveEditorBuffer({
                content: raw,
                timestamp: Date.now(),
                fileHandle: descriptor.handle,
              });
            }
          } catch (error) {
            console.error("Failed to save file reference:", error);
          }
        }
      } catch (error) {
        console.error("Failed to save file as:", error);
      } finally {
        setIsSaving(false);
      }
    });

    return cleanup;
  }, [saveFile, isElectron, currentFile, persistLastOpenedPath]);

  // Handle menu new command.
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onMenuNew) return;

    const cleanup = window.electronAPI.onMenuNew(() => {
      newFile();
    });

    return cleanup;
  }, [newFile, isElectron]);

  // Handle menu open command.
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onMenuOpen) return;

    const cleanup = window.electronAPI.onMenuOpen(async () => {
      await openFile();
    });

    return cleanup;
  }, [openFile, isElectron]);

  // Handle Web beforeunload.
  useEffect(() => {
    if (isElectron) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, isElectron]);

  return {
    currentFile,
    content,
    setContent,
    isDirty,
    isSaving,
    lastSavedTime,
    openFile,
    saveFile,
    newFile,
    updateFileName,
    wasAutoRecovered,
  };
}
