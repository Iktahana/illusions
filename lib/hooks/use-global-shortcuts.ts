'use client';

import { useEffect } from 'react';

/**
 * Global keyboard shortcuts for Web menu bar
 * Only triggers when focus is outside the editor
 */
export function useGlobalShortcuts(
  onAction: (action: string) => void,
  editorContainerRef?: React.RefObject<HTMLElement>
) {
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

      // Check if focus is inside the editor
      if (editorContainerRef?.current?.contains(document.activeElement)) {
        // Inside editor, don't intercept other shortcuts
        return;
      }

      // Ctrl/Cmd + S: Save
      if (modifier && e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        onAction('save-file');
        return;
      }

      // Ctrl/Cmd + Shift + S: Save As
      if (modifier && e.key === 'S' && e.shiftKey) {
        e.preventDefault();
        onAction('save-as');
        return;
      }

      // Ctrl/Cmd + O: Open
      if (modifier && e.key === 'o') {
        e.preventDefault();
        onAction('open-file');
        return;
      }

      // Ctrl/Cmd + N: New Window
      if (modifier && e.key === 'n') {
        e.preventDefault();
        onAction('new-window');
        return;
      }

      // Ctrl/Cmd + 0: Reset Zoom
      if (modifier && e.key === '0') {
        e.preventDefault();
        onAction('reset-zoom');
        return;
      }

      // Ctrl/Cmd + +: Zoom In
      if (modifier && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        onAction('zoom-in');
        return;
      }

      // Ctrl/Cmd + -: Zoom Out
      if (modifier && e.key === '-') {
        e.preventDefault();
        onAction('zoom-out');
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onAction, editorContainerRef]);
}
