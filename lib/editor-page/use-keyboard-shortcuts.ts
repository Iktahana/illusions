import type { Dispatch, SetStateAction } from "react";
import { useMemo } from "react";

import type { MdiFileDescriptor } from "@/lib/project/mdi-file";
import type { SupportedFileExtension } from "@/lib/project/project-types";
import type { CommandId } from "@/lib/keymap/command-ids";
import { useKeymapListener } from "@/lib/keymap/use-keymap-listener";
import { useKeymap } from "@/contexts/KeymapContext";

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
}

/**
 * Keyboard shortcut handler for the editor page.
 * Delegates to useKeymapListener using the centralized keymap registry.
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
}: UseKeyboardShortcutsParams): void {
  const { effectiveBindings } = useKeymap();

  const handlers = useMemo<Partial<Record<CommandId, () => void>>>(() => {
    const tabHandlers: Partial<Record<CommandId, () => void>> = {
      "nav.tab1": () => { switchToIndex(0); incrementEditorKey(); },
      "nav.tab2": () => { switchToIndex(1); incrementEditorKey(); },
      "nav.tab3": () => { switchToIndex(2); incrementEditorKey(); },
      "nav.tab4": () => { switchToIndex(3); incrementEditorKey(); },
      "nav.tab5": () => { switchToIndex(4); incrementEditorKey(); },
      "nav.tab6": () => { switchToIndex(5); incrementEditorKey(); },
      "nav.tab7": () => { switchToIndex(6); incrementEditorKey(); },
      "nav.tab8": () => { switchToIndex(7); incrementEditorKey(); },
      "nav.tab9": () => { switchToIndex(8); incrementEditorKey(); },
    };

    const closeTabHandler = isElectron
      ? undefined
      : () => {
          if (tabs.length === 1 && !tabs[0]?.file && !tabs[0]?.isDirty) {
            window.close();
            return;
          }
          closeTab(activeTabId);
        };

    return {
      "file.save": () => void saveFile(),
      "edit.pasteAsPlaintext": () => void handlePasteAsPlaintext(),
      "view.compactMode": handleToggleCompactMode,
      "format.ruby": handleOpenRubyDialog,
      "format.tcy": handleToggleTcy,
      "nav.settings": () => setShowSettingsModal(true),
      "nav.search": () => setSearchOpenTrigger(prev => prev + 1),
      "nav.nextTab": () => { nextTab(); incrementEditorKey(); },
      "nav.prevTab": () => { prevTab(); incrementEditorKey(); },
      "file.newTab": isElectron ? undefined : () => { newTab(); incrementEditorKey(); },
      "file.closeTab": closeTabHandler,
      "view.splitRight": splitEditorRight,
      "view.splitDown": splitEditorDown,
      ...tabHandlers,
    };
  }, [
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
  ]);

  useKeymapListener(handlers, effectiveBindings);
}
