import type { Dispatch, SetStateAction } from "react";
import { useEffect } from "react";

import { persistAppState } from "@/lib/app-state-manager";
import { getVFS } from "@/lib/vfs";

interface UseElectronEventsParams {
  isElectron: boolean;

  // Paste as plaintext
  handlePasteAsPlaintext: () => Promise<void>;

  // Compact mode toggle
  handleToggleCompactMode: () => void;

  // Format change: direct setters for IPC-driven adjustments
  setLineHeight: Dispatch<SetStateAction<number>>;
  setParagraphSpacing: Dispatch<SetStateAction<number>>;
  setTextIndent: Dispatch<SetStateAction<number>>;
  setCharsPerLine: Dispatch<SetStateAction<number>>;
  setShowParagraphNumbers: Dispatch<SetStateAction<boolean>>;
  handleAutoCharsPerLineChange: (value?: boolean) => void;
  incrementEditorKey: () => void;

  // Theme change
  setThemeMode: (mode: "auto" | "light" | "dark") => void;

  // Menu state sync
  compactMode: boolean;
  showParagraphNumbers: boolean;
  themeMode: string;
  autoCharsPerLine: boolean;

  // Open project from menu
  handleOpenProject: () => Promise<void>;

  // Open recent project from menu
  handleOpenRecentProject: (projectId: string) => Promise<void>;

  // Open as project (double-clicked .mdi in project dir)
  handleOpenAsProject: (projectPath: string, initialFile: string) => Promise<void>;
  confirmBeforeAction: (action: () => void | Promise<void>) => void;
}

/**
 * Registers all Electron IPC event listeners for the editor page.
 * Each listener is set up in its own useEffect to ensure proper cleanup.
 */
export function useElectronEvents(params: UseElectronEventsParams): void {
  const {
    isElectron,
    handlePasteAsPlaintext,
    handleToggleCompactMode,
    setLineHeight,
    setParagraphSpacing,
    setTextIndent,
    setCharsPerLine,
    setShowParagraphNumbers,
    handleAutoCharsPerLineChange,
    incrementEditorKey,
    setThemeMode,
    compactMode,
    showParagraphNumbers,
    themeMode,
    autoCharsPerLine,
    handleOpenProject,
    handleOpenRecentProject,
    handleOpenAsProject,
    confirmBeforeAction,
  } = params;

  // Paste as plaintext IPC listener
  useEffect(() => {
    if (!isElectron || typeof window === "undefined") return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unsubscribe = (window as any).electronAPI?.onPasteAsPlaintext?.(() => {
      void handlePasteAsPlaintext();
    });

    return () => {
      unsubscribe?.();
    };
  }, [isElectron, handlePasteAsPlaintext]);

  // Compact mode toggle IPC listener
  useEffect(() => {
    if (!isElectron || typeof window === "undefined") return;
    const cleanup = window.electronAPI?.onToggleCompactMode?.(() => {
      handleToggleCompactMode();
    });
    return () => { cleanup?.(); };
  }, [isElectron, handleToggleCompactMode]);

  // Format change IPC listener (line height, paragraph spacing, text indent, chars per line, paragraph numbers)
  useEffect(() => {
    if (!isElectron || typeof window === "undefined") return;
    const cleanup = window.electronAPI?.onFormatChange?.((setting: string, action: string) => {
      switch (setting) {
        case "lineHeight": {
          setLineHeight(prev => {
            const next = action === "increase"
              ? Math.min(3.0, +(prev + 0.1).toFixed(1))
              : Math.max(1.0, +(prev - 0.1).toFixed(1));
            incrementEditorKey();
            void persistAppState({ lineHeight: next });
            return next;
          });
          break;
        }
        case "paragraphSpacing": {
          setParagraphSpacing(prev => {
            const next = action === "increase"
              ? Math.min(3.0, +(prev + 0.1).toFixed(1))
              : Math.max(0, +(prev - 0.1).toFixed(1));
            incrementEditorKey();
            void persistAppState({ paragraphSpacing: next });
            return next;
          });
          break;
        }
        case "textIndent": {
          setTextIndent(prev => {
            const next = action === "none" ? 0
              : action === "increase" ? Math.min(5, prev + 1)
              : Math.max(0, prev - 1);
            incrementEditorKey();
            void persistAppState({ textIndent: next });
            return next;
          });
          break;
        }
        case "charsPerLine": {
          if (action === "auto") {
            handleAutoCharsPerLineChange();
            break;
          }
          // Manual adjustments only when auto is off
          setCharsPerLine(prev => {
            const next = action === "increase" ? prev + 5
              : Math.max(1, prev - 5);
            incrementEditorKey();
            void persistAppState({ charsPerLine: next });
            return next;
          });
          break;
        }
        case "paragraphNumbers": {
          setShowParagraphNumbers(prev => {
            const next = !prev;
            void persistAppState({ showParagraphNumbers: next });
            return next;
          });
          break;
        }
      }
    });
    return () => { cleanup?.(); };
  }, [isElectron, setLineHeight, setParagraphSpacing, setTextIndent, setCharsPerLine, setShowParagraphNumbers, handleAutoCharsPerLineChange, incrementEditorKey]);

  // Theme change IPC listener
  useEffect(() => {
    if (!isElectron || typeof window === "undefined") return;
    const cleanup = window.electronAPI?.onThemeChange?.((mode) => {
      setThemeMode(mode);
    });
    return () => { cleanup?.(); };
  }, [isElectron, setThemeMode]);

  // Sync menu checked state to Electron main process
  useEffect(() => {
    if (!isElectron || typeof window === "undefined") return;
    void window.electronAPI?.syncMenuUiState?.({
      compactMode,
      showParagraphNumbers,
      themeMode,
      autoCharsPerLine,
    });
  }, [isElectron, compactMode, showParagraphNumbers, themeMode, autoCharsPerLine]);

  // Show project folder in file manager IPC listener
  useEffect(() => {
    if (!isElectron || typeof window === "undefined") return;

    const cleanup = window.electronAPI?.onMenuShowInFileManager?.(() => {
      const vfs = getVFS();
      const rootPath = vfs.getRootPath?.();
      if (rootPath) {
        void window.electronAPI?.showInFileManager?.(rootPath);
      }
    });

    return () => {
      cleanup?.();
    };
  }, [isElectron]);

  // Open project from menu IPC listener
  useEffect(() => {
    if (!isElectron || typeof window === "undefined") return;
    const cleanup = window.electronAPI?.onMenuOpenProject?.(() => {
      void handleOpenProject();
    });
    return () => { cleanup?.(); };
  }, [isElectron, handleOpenProject]);

  // Open recent project from menu IPC listener
  useEffect(() => {
    if (!isElectron || typeof window === "undefined") return;
    const cleanup = window.electronAPI?.onMenuOpenRecentProject?.((projectId: string) => {
      void handleOpenRecentProject(projectId);
    });
    return () => { cleanup?.(); };
  }, [isElectron, handleOpenRecentProject]);

  // Open as project (system-triggered, e.g., double-clicked .mdi in project dir)
  useEffect(() => {
    if (!isElectron || typeof window === "undefined") return;
    const cleanup = window.electronAPI?.onOpenAsProject?.(({ projectPath, initialFile }) => {
      void confirmBeforeAction(() => handleOpenAsProject(projectPath, initialFile));
    });
    return () => { cleanup?.(); };
  }, [isElectron, confirmBeforeAction, handleOpenAsProject]);
}
