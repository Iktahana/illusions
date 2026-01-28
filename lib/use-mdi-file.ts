"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { openMdiFile, saveMdiFile, type MdiFileDescriptor } from "./mdi-file";
import { isElectronRenderer } from "./runtime-env";
import { getStorageService } from "./storage-service";

const DEFAULT_CONTENT = "";
const AUTO_SAVE_INTERVAL = 5000; // 5 seconds

export interface UseMdiFileReturn {
  currentFile: MdiFileDescriptor | null;
  content: string;
  setContent: (content: string) => void;
  isDirty: boolean;
  isSaving: boolean;
  lastSavedTime: number | null;
  openFile: () => Promise<void>;
  saveFile: () => Promise<void>;
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
            } catch (error) {
              console.warn("Could not restore previous file (permission may have been revoked):", error);
              // Clear the stale handle
              await storage.clearEditorBuffer();
            }
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
      const storage = getStorageService();
      await storage.initialize();
      
      if (isElectron && descriptor.path) {
        // Electron: save path
        await storage.saveAppState({ lastOpenedMdiPath: descriptor.path });
      } else if (!isElectron && descriptor.handle) {
        // Web: save file handle in editor buffer for later recovery
        await storage.saveEditorBuffer({
          content: fileContent,
          timestamp: Date.now(),
          fileHandle: descriptor.handle,
        });
      }
    } catch (error) {
      console.error("Failed to save file reference:", error);
    }
  }, [isElectron]);

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
          const storage = getStorageService();
          await storage.initialize();
          
          if (isElectron && descriptor.path) {
            // Electron: save path
            await storage.saveAppState({ lastOpenedMdiPath: descriptor.path });
          } else if (!isElectron && descriptor.handle) {
            // Web: save file handle in editor buffer for later recovery
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

    window.electronAPI.onSaveBeforeClose(async () => {
      if (isDirty) {
        await saveFile();
      }
      await window.electronAPI?.saveDoneAndClose?.();
    });
  }, [isDirty, saveFile, isElectron]);

  // Handle files opened from system (double-click .mdi file).
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onOpenFileFromSystem) return;

    window.electronAPI.onOpenFileFromSystem(({ path, content: fileContent }) => {
      const now = Date.now();
      setCurrentFile({
        path,
        handle: null,
        name: path.split("/").pop() || "Untitled",
      });
      setContentState(fileContent);
      setLastSavedContent(fileContent);
      setLastSavedTime(now);
    });
  }, [isElectron]);

  // Handle menu save command.
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onMenuSave) return;

    window.electronAPI.onMenuSave(async () => {
      await saveFile();
    });
  }, [saveFile, isElectron]);

  // Handle menu save-as command.
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onMenuSaveAs) return;

    window.electronAPI.onMenuSaveAs(async () => {
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
              // Electron: save path
              await storage.saveAppState({ lastOpenedMdiPath: descriptor.path });
            } else if (descriptor.handle) {
              // Web: save file handle in editor buffer for later recovery
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
  }, [saveFile, isElectron, currentFile]);

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
    wasAutoRecovered,
  };
}
