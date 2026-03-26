'use client';

import { useEffect } from 'react';

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
      const isMac = typeof navigator !== 'undefined' &&
                    navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      // Ctrl/Cmd + R: Block browser reload (always, regardless of focus)
      if (modifier && e.key === 'r') {
        e.preventDefault();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
