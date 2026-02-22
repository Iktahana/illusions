import type { Dispatch, SetStateAction } from "react";
import { useEffect } from "react";

import type { MdiFileDescriptor } from "@/lib/mdi-file";
import type { SupportedFileExtension } from "@/lib/project-types";

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
}

/**
 * Keyboard shortcut handler for the editor page.
 *
 * Handles: save, search, settings, paste-as-plaintext, compact mode,
 * ruby dialog, tcy toggle, and tab navigation.
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
}: UseKeyboardShortcutsParams): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
      const isMac = nav.userAgentData
        ? nav.userAgentData.platform === "macOS"
        : /mac/i.test(navigator.userAgent);

      // Cmd+, (macOS) / Ctrl+, (Windows/Linux): Settings
      const isSettingsShortcut = isMac
        ? event.metaKey && event.key === ","
        : event.ctrlKey && event.key === ",";

      // Cmd+S (macOS) / Ctrl+S (Windows/Linux): Save
      const isSaveShortcut = isMac
        ? event.metaKey && event.key === "s"
        : event.ctrlKey && event.key === "s";

      // Cmd+F (macOS) / Ctrl+F (Windows/Linux): Search
      const isSearchShortcut = isMac
        ? event.metaKey && event.key === "f"
        : event.ctrlKey && event.key === "f";

      // Shift+Cmd+V (macOS) / Shift+Ctrl+V (Windows/Linux): Paste as plaintext
      const isPasteAsPlaintextShortcut = isMac
        ? event.shiftKey && event.metaKey && event.key === "v"
        : event.shiftKey && event.ctrlKey && event.key === "v";

      // Shift+Cmd+M (macOS) / Shift+Ctrl+M (Windows/Linux): Compact mode toggle
      const isCompactModeShortcut = isMac
        ? event.shiftKey && event.metaKey && event.key === "m"
        : event.shiftKey && event.ctrlKey && event.key === "m";

      // Shift+Cmd+R (macOS) / Shift+Ctrl+R (Windows/Linux): Ruby dialog
      const isRubyShortcut = isMac
        ? event.shiftKey && event.metaKey && event.key === "r"
        : event.shiftKey && event.ctrlKey && event.key === "r";

      // Shift+Cmd+T (macOS) / Shift+Ctrl+T (Windows/Linux): Tcy
      const isTcyShortcut = isMac
        ? event.shiftKey && event.metaKey && event.key === "t"
        : event.shiftKey && event.ctrlKey && event.key === "t";

      // Tab shortcuts (Web only; Electron handles Cmd+W/T via menu)
      const isNextTab = event.ctrlKey && !event.shiftKey && event.key === "Tab";
      const isPrevTab = event.ctrlKey && event.shiftKey && event.key === "Tab";
      const isNewTabShortcut = !isElectron && (isMac
        ? event.metaKey && !event.shiftKey && event.key === "t"
        : event.ctrlKey && !event.shiftKey && event.key === "t");
      const isCloseTabShortcut = !isElectron && (isMac
        ? event.metaKey && event.key === "w"
        : event.ctrlKey && event.key === "w");
      const isTabJump = (isMac ? event.metaKey : event.ctrlKey) &&
        !event.shiftKey && event.key >= "1" && event.key <= "9";

      if (isTcyShortcut) {
        event.preventDefault();
        handleToggleTcy();
      } else if (isRubyShortcut) {
        event.preventDefault();
        handleOpenRubyDialog();
      } else if (isCompactModeShortcut) {
        event.preventDefault();
        handleToggleCompactMode();
      } else if (isSettingsShortcut) {
        event.preventDefault();
        setShowSettingsModal(true);
      } else if (isSaveShortcut) {
        event.preventDefault();
        void saveFile();
      } else if (isSearchShortcut) {
        event.preventDefault();
        setSearchOpenTrigger(prev => prev + 1);
      } else if (isPasteAsPlaintextShortcut) {
        event.preventDefault();
        void handlePasteAsPlaintext();
      } else if (isNextTab) {
        event.preventDefault();
        nextTab();
        incrementEditorKey();
      } else if (isPrevTab) {
        event.preventDefault();
        prevTab();
        incrementEditorKey();
      } else if (isNewTabShortcut) {
        event.preventDefault();
        newTab();
        incrementEditorKey();
      } else if (isCloseTabShortcut) {
        event.preventDefault();
        if (tabs.length === 1 && !tabs[0].file && !tabs[0].isDirty) {
          window.close();
          return;
        }
        closeTab(activeTabId);
      } else if (isTabJump) {
        event.preventDefault();
        const idx = parseInt(event.key, 10) - 1;
        switchToIndex(idx);
        incrementEditorKey();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [saveFile, handlePasteAsPlaintext, handleToggleCompactMode, handleOpenRubyDialog, handleToggleTcy, isElectron, nextTab, prevTab, newTab, closeTab, tabs, activeTabId, switchToIndex, setShowSettingsModal, incrementEditorKey, setSearchOpenTrigger]);
}
