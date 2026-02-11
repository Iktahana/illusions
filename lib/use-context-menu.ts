"use client";

import { useState, useEffect, useCallback } from "react";

export interface ContextMenuItem {
  label: string;
  action: string;
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

interface UseContextMenuResult {
  /** Current menu state (null when closed). Only set in Web mode. */
  menu: ContextMenuState | null;
  /** Show context menu. In Electron uses native menu; in Web shows HTML overlay. */
  show: (e: React.MouseEvent, items: ContextMenuItem[]) => Promise<string | null>;
  /** Close the Web HTML menu */
  close: () => void;
}

/**
 * Reusable context menu hook with Electron/Web hybrid support.
 *
 * - Electron: delegates to native `Menu.popup()` via IPC, returns selected action
 * - Web: opens an HTML overlay menu, action is delivered via `onAction` callback
 */
export function useContextMenu(): UseContextMenuResult {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  // Close on outside click or scroll (Web only)
  useEffect(() => {
    if (!menu) return;
    const handleClose = () => setMenu(null);
    document.addEventListener("click", handleClose);
    document.addEventListener("scroll", handleClose, true);
    return () => {
      document.removeEventListener("click", handleClose);
      document.removeEventListener("scroll", handleClose, true);
    };
  }, [menu]);

  const close = useCallback(() => setMenu(null), []);

  const show = useCallback(
    async (e: React.MouseEvent, items: ContextMenuItem[]): Promise<string | null> => {
      e.preventDefault();

      // Electron: use native OS context menu
      if (window.electronAPI?.showContextMenu) {
        return window.electronAPI.showContextMenu(items);
      }

      // Web: show HTML overlay
      setMenu({ x: e.clientX, y: e.clientY, items });
      return null;
    },
    []
  );

  return { menu, show, close };
}
