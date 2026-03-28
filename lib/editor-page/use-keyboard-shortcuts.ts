import type { Dispatch, RefObject, SetStateAction } from "react";
import { useEffect } from "react";

import type { MdiFileDescriptor } from "@/lib/project/mdi-file";
import type { SupportedFileExtension } from "@/lib/project/project-types";

interface TabInfo {
  id: string;
  file: MdiFileDescriptor | null;
  isDirty: boolean;
}

interface UseKeyboardShortcutsParams {
  isElectron: boolean;
  saveFile: () => Promise<void>;
  handlePasteAsPlaintext: () => Promise<void>;
  handleToggleCompactMode: () => void;
  handleOpenRubyDialog: () => void;
  handleToggleTcy: () => void;
  setShowSettingsModal: (value: boolean) => void;
  setSearchOpenTrigger: Dispatch<SetStateAction<number>>;
  incrementEditorKey: () => void;
  // Tab operations
  nextTab: () => void;
  prevTab: () => void;
  newTab: (fileType?: SupportedFileExtension) => void;
  closeTab: (tabId: string) => void;
  switchToIndex: (index: number) => void;
  tabs: TabInfo[];
  activeTabId: string;
  // Split editor operations
  splitEditorRight?: () => void;
  splitEditorDown?: () => void;
  // Global / menu-level actions (formerly in useGlobalShortcuts)
  onMenuAction?: (action: string) => void;
  editorContainerRef?: RefObject<HTMLElement>;
}

/**
 * Returns true when the currently focused element is a non-editor text input
 * (e.g. settings dialog input, search box, textarea) where app-level
 * shortcuts should be suppressed to avoid misfires.
 */
function isFocusInNonEditorInput(
  editorContainerRef?: RefObject<HTMLElement>,
): boolean {
  const el = document.activeElement;
  if (!el) return false;

  // Focus inside the editor is fine — editor handles its own key bindings
  if (editorContainerRef?.current?.contains(el)) return false;

  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if ((el as HTMLElement).isContentEditable) return true;

  return false;
}

/**
 * Unified keyboard shortcut handler for the editor page.
 *
 * Merges the former useGlobalShortcuts (browser-reload block, zoom, new-window,
 * open, save-as) with editor-page shortcuts (save, search, settings, paste-as-
 * plaintext, compact mode, ruby, tcy, tabs, split editor) into a single
 * dispatch point with explicit focus-scope management.
 *
 * Scope rules:
 *  • "always"  — fires regardless of focus (browser-reload block, zoom,
 *                new-window, save, save-as, open, settings)
 *  • "context" — suppressed when a non-editor input/textarea is focused
 *                (search, paste-plaintext, compact-mode, ruby, tcy, tabs,
 *                 split-editor)
 */
export function useKeyboardShortcuts({
  isElectron,
  saveFile,
  handlePasteAsPlaintext,
  handleToggleCompactMode,
  handleOpenRubyDialog,
  handleToggleTcy,
  setShowSettingsModal,
  setSearchOpenTrigger,
  incrementEditorKey,
  nextTab,
  prevTab,
  newTab,
  closeTab,
  switchToIndex,
  tabs,
  activeTabId,
  splitEditorRight,
  splitEditorDown,
  onMenuAction,
  editorContainerRef,
}: UseKeyboardShortcutsParams): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
      const isMac = nav.userAgentData
        ? nav.userAgentData.platform === "macOS"
        : /mac/i.test(navigator.userAgent);
      const modifier = isMac ? event.metaKey : event.ctrlKey;

      // ── Always-active shortcuts (fire regardless of focus) ────────

      // Ctrl/Cmd + R: Block browser reload
      if (modifier && !event.shiftKey && event.key === "r") {
        event.preventDefault();
        return;
      }

      // Ctrl/Cmd + S: Save
      if (modifier && event.key === "s" && !event.shiftKey) {
        event.preventDefault();
        void saveFile();
        return;
      }

      // Ctrl/Cmd + Shift + S: Save As (Web only)
      if (!isElectron && modifier && event.shiftKey && (event.key === "S" || event.key === "s")) {
        event.preventDefault();
        onMenuAction?.("save-as");
        return;
      }

      // Ctrl/Cmd + O: Open (Web only)
      if (!isElectron && modifier && event.key === "o") {
        event.preventDefault();
        onMenuAction?.("open-file");
        return;
      }

      // Ctrl/Cmd + N: New Window (Web only)
      if (!isElectron && modifier && event.key === "n") {
        event.preventDefault();
        onMenuAction?.("new-window");
        return;
      }

      // Ctrl/Cmd + 0: Reset Zoom (Web only)
      if (!isElectron && modifier && event.key === "0") {
        event.preventDefault();
        onMenuAction?.("reset-zoom");
        return;
      }

      // Ctrl/Cmd + = / +: Zoom In (Web only)
      if (!isElectron && modifier && (event.key === "+" || event.key === "=")) {
        event.preventDefault();
        onMenuAction?.("zoom-in");
        return;
      }

      // Ctrl/Cmd + -: Zoom Out (Web only)
      if (!isElectron && modifier && event.key === "-") {
        event.preventDefault();
        onMenuAction?.("zoom-out");
        return;
      }

      // Ctrl/Cmd + ,: Settings
      if (modifier && event.key === ",") {
        event.preventDefault();
        setShowSettingsModal(true);
        return;
      }

      // ── Context-dependent shortcuts (suppressed in non-editor inputs) ─

      if (isFocusInNonEditorInput(editorContainerRef)) return;

      // Cmd+F / Ctrl+F: Search
      if (modifier && event.key === "f") {
        event.preventDefault();
        setSearchOpenTrigger(prev => prev + 1);
        return;
      }

      // Shift+Cmd+V / Shift+Ctrl+V: Paste as plaintext
      if (event.shiftKey && modifier && event.key === "v") {
        event.preventDefault();
        void handlePasteAsPlaintext();
        return;
      }

      // Shift+Cmd+M / Shift+Ctrl+M: Compact mode toggle
      if (event.shiftKey && modifier && event.key === "m") {
        event.preventDefault();
        handleToggleCompactMode();
        return;
      }

      // Shift+Cmd+R / Shift+Ctrl+R: Ruby dialog
      if (event.shiftKey && modifier && event.key === "r") {
        event.preventDefault();
        handleOpenRubyDialog();
        return;
      }

      // Shift+Cmd+T / Shift+Ctrl+T: Tcy toggle
      if (event.shiftKey && modifier && event.key === "t") {
        event.preventDefault();
        handleToggleTcy();
        return;
      }

      // Tab shortcuts (Web only; Electron handles Cmd+W/T via menu)
      if (event.ctrlKey && !event.shiftKey && event.key === "Tab") {
        event.preventDefault();
        nextTab();
        incrementEditorKey();
        return;
      }
      if (event.ctrlKey && event.shiftKey && event.key === "Tab") {
        event.preventDefault();
        prevTab();
        incrementEditorKey();
        return;
      }
      if (!isElectron && modifier && !event.shiftKey && event.key === "t") {
        event.preventDefault();
        newTab();
        incrementEditorKey();
        return;
      }
      if (!isElectron && modifier && event.key === "w") {
        event.preventDefault();
        if (tabs.length === 1 && !tabs[0].file && !tabs[0].isDirty) {
          window.close();
          return;
        }
        closeTab(activeTabId);
        return;
      }
      if (modifier && !event.shiftKey && event.key >= "1" && event.key <= "9") {
        event.preventDefault();
        const idx = parseInt(event.key, 10) - 1;
        switchToIndex(idx);
        incrementEditorKey();
        return;
      }

      // Cmd+\ / Ctrl+\: Split editor right
      if (modifier && !event.shiftKey && event.key === "\\" && splitEditorRight) {
        event.preventDefault();
        splitEditorRight();
        return;
      }

      // Shift+Cmd+\ / Shift+Ctrl+\: Split editor down
      if (event.shiftKey && modifier && event.key === "\\" && splitEditorDown) {
        event.preventDefault();
        splitEditorDown();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [saveFile, handlePasteAsPlaintext, handleToggleCompactMode, handleOpenRubyDialog, handleToggleTcy, isElectron, nextTab, prevTab, newTab, closeTab, tabs, activeTabId, switchToIndex, setShowSettingsModal, incrementEditorKey, setSearchOpenTrigger, splitEditorRight, splitEditorDown, onMenuAction, editorContainerRef]);
}
