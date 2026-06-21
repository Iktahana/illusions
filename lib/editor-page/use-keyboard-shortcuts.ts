import type { Dispatch, SetStateAction } from "react";
import { useMemo } from "react";

import type { SupportedFileExtension } from "@/lib/project/project-types";
import type { CommandId } from "@/lib/keymap/command-ids";
import { useKeymapListener } from "@/lib/keymap/use-keymap-listener";
import { useKeymap } from "@/contexts/KeymapContext";
import type { TabState } from "@/lib/tab-manager/tab-types";
import { isEditorTab } from "@/lib/tab-manager/tab-types";

interface UseKeyboardShortcutsParams {
  isElectron: boolean;
  saveFile: () => Promise<void>;
  handlePasteAsPlaintext: () => Promise<void>;
  handleToggleCompactMode: () => void;
  handleOpenRubyDialog: () => void;
  handleToggleTcy: () => void;
  setShowSettingsModal: (value: boolean) => void;
  setSearchOpenTrigger: Dispatch<SetStateAction<number>>;
  /**
   * エディタ強制再マウント用キーのインクリメント。
   * NOTE: タブナビゲーションでは呼ばない（#1878: タブ往復で Undo/Redo が消える退行）。
   * 表示設定変更やファイル再読込など、真に再マウントが必要な経路でのみ使う。
   * このフックでは現在消費しないが、呼び出し側の API 互換のため受け取る。
   */
  incrementEditorKey?: () => void;
  // Tab operations
  nextTab: () => void;
  prevTab: () => void;
  newTab: (fileType?: SupportedFileExtension) => void;
  closeTab: (tabId: string) => void;
  switchToIndex: (index: number) => void;
  tabs: TabState[];
  activeTabId: string;
  /** Whether the currently active tab is an editor tab.
   *  Editor-only commands (Ruby, TCY, search, paste-as-plaintext) no-op when false. */
  isEditorTabActive: boolean;
  // Split editor operations
  splitEditorRight?: () => void;
  splitEditorDown?: () => void;
  // Panel toggle operations
  toggleExplorer?: () => void;
  toggleSearch?: () => void;
  toggleOutline?: () => void;
  /** Web-only: dispatches menu actions for commands not handled by Electron IPC.
   *  Required when isElectron is false so that file.open, file.saveAs,
   *  file.newWindow, and zoom commands work even when the editor has focus. */
  handleMenuAction?: (action: string) => void;
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
  nextTab,
  prevTab,
  newTab,
  closeTab,
  switchToIndex,
  tabs,
  activeTabId,
  isEditorTabActive,
  splitEditorRight,
  splitEditorDown,
  toggleExplorer,
  toggleSearch,
  toggleOutline,
  handleMenuAction,
}: UseKeyboardShortcutsParams): void {
  const { effectiveBindings } = useKeymap();

  const handlers = useMemo<Partial<Record<CommandId, () => void>>>(() => {
    // タブナビゲーション（⌘1..9 / 次・前タブ）は activeTabId を変えるだけで、
    // エディタを再マウントしてはならない。incrementEditorKey() を呼ぶと
    // 各タブの Milkdown/ProseMirror history が破棄され、タブ往復後に
    // Undo/Redo できなくなる退行が起きる (#1878)。
    const tabHandlers: Partial<Record<CommandId, () => void>> = {
      "nav.tab1": () => switchToIndex(0),
      "nav.tab2": () => switchToIndex(1),
      "nav.tab3": () => switchToIndex(2),
      "nav.tab4": () => switchToIndex(3),
      "nav.tab5": () => switchToIndex(4),
      "nav.tab6": () => switchToIndex(5),
      "nav.tab7": () => switchToIndex(6),
      "nav.tab8": () => switchToIndex(7),
      "nav.tab9": () => switchToIndex(8),
    };

    const closeTabHandler = isElectron
      ? undefined
      : () => {
          if (tabs.length === 0) return;
          const firstTab = tabs[0];
          if (
            tabs.length === 1 &&
            firstTab &&
            isEditorTab(firstTab) &&
            !firstTab.file &&
            !firstTab.isDirty
          ) {
            window.close();
            return;
          }
          closeTab(activeTabId);
        };

    // Web-exclusive commands: these are not handled by Electron IPC, so they
    // must be registered here (which fires unconditionally) rather than in
    // useGlobalShortcuts (which skips when the editor is focused).
    const webOnlyHandlers: Partial<Record<CommandId, () => void>> =
      !isElectron && handleMenuAction
        ? {
            "file.open": () => handleMenuAction("open-file"),
            "file.saveAs": () => handleMenuAction("save-as"),
            "file.newWindow": () => handleMenuAction("new-window"),
            "view.zoomIn": () => handleMenuAction("zoom-in"),
            "view.zoomOut": () => handleMenuAction("zoom-out"),
            "view.resetZoom": () => handleMenuAction("reset-zoom"),
          }
        : {};

    return {
      "file.save": () => void saveFile(),
      // Editor-only commands: no-op when a terminal or diff tab is active
      "edit.pasteAsPlaintext": isEditorTabActive ? () => void handlePasteAsPlaintext() : undefined,
      "view.compactMode": handleToggleCompactMode,
      "format.ruby": isEditorTabActive ? handleOpenRubyDialog : undefined,
      "format.tcy": isEditorTabActive ? handleToggleTcy : undefined,
      "nav.settings": () => setShowSettingsModal(true),
      "nav.search": isEditorTabActive ? () => setSearchOpenTrigger((prev) => prev + 1) : undefined,
      // タブ往復で history を保つため remount しない (#1878)。
      "nav.nextTab": () => nextTab(),
      "nav.prevTab": () => prevTab(),
      // 新規タブは固有の bufferId を持つため key は自動的に変わる。
      // ここで incrementEditorKey() を呼ぶと既存タブの history まで破棄される (#1878)。
      "file.newTab": isElectron ? undefined : () => newTab(),
      "file.closeTab": closeTabHandler,
      "view.splitRight": splitEditorRight,
      "view.splitDown": splitEditorDown,
      "panel.explorer": toggleExplorer,
      "panel.search": toggleSearch,
      // TODO: Outline feature — planned for v1.3.0
      // "panel.outline": toggleOutline,
      ...tabHandlers,
      ...webOnlyHandlers,
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
    nextTab,
    prevTab,
    newTab,
    closeTab,
    switchToIndex,
    tabs,
    activeTabId,
    isEditorTabActive,
    splitEditorRight,
    splitEditorDown,
    toggleExplorer,
    toggleSearch,
    toggleOutline,
    handleMenuAction,
  ]);

  useKeymapListener(handlers, effectiveBindings);
}
