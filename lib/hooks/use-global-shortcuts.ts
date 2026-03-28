'use client';

import { useEffect } from 'react';

import type { KeyBinding } from '@/lib/keymap/keymap-types';
import { matchesEvent } from '@/lib/keymap/keymap-utils';

/**
 * Binding used to block browser reload.
 * Defined here as a constant so it participates in the keymap utilities
 * rather than being a raw key/modifier check.
 */
const BLOCK_RELOAD_BINDING: KeyBinding = { modifiers: ["CmdOrCtrl"], key: "r" };

/**
 * Global keyboard shortcuts that must fire regardless of focus.
 * Currently only blocks the browser's default Ctrl/Cmd+R reload behavior.
 *
 * Note: File and zoom shortcuts (file.open, file.saveAs, file.newWindow,
 * view.zoomIn/Out/Reset) were moved to useKeyboardShortcuts so they work
 * even when the editor is focused.
 */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Block browser reload (always, regardless of focus)
      if (matchesEvent(BLOCK_RELOAD_BINDING, e)) {
        e.preventDefault();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
