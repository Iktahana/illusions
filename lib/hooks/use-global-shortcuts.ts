'use client';

import type { RefObject } from "react";
import { useEffect } from 'react';

import { useKeymap } from '@/contexts/KeymapContext';
import { matchesEvent } from '@/lib/keymap/keymap-utils';

/**
 * Global keyboard shortcuts for the Web menu bar.
 * Only triggers when focus is outside the editor.
 * Uses the centralized keymap registry for binding lookups.
 */
export function useGlobalShortcuts(
  onAction: (action: string) => void,
  editorContainerRef?: RefObject<HTMLElement>
): void {
  const { effectiveBindings } = useKeymap();

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
        return;
      }

      if (matchesEvent(effectiveBindings['file.save'], e)) {
        e.preventDefault();
        onAction('save-file');
        return;
      }

      if (matchesEvent(effectiveBindings['file.saveAs'], e)) {
        e.preventDefault();
        onAction('save-as');
        return;
      }

      if (matchesEvent(effectiveBindings['file.open'], e)) {
        e.preventDefault();
        onAction('open-file');
        return;
      }

      if (matchesEvent(effectiveBindings['file.newWindow'], e)) {
        e.preventDefault();
        onAction('new-window');
        return;
      }

      if (matchesEvent(effectiveBindings['view.resetZoom'], e)) {
        e.preventDefault();
        onAction('reset-zoom');
        return;
      }

      if (matchesEvent(effectiveBindings['view.zoomIn'], e)) {
        e.preventDefault();
        onAction('zoom-in');
        return;
      }

      // Also match Ctrl/Cmd + = as zoom-in (common alternative)
      if (modifier && e.key === '=') {
        e.preventDefault();
        onAction('zoom-in');
        return;
      }

      if (matchesEvent(effectiveBindings['view.zoomOut'], e)) {
        e.preventDefault();
        onAction('zoom-out');
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onAction, editorContainerRef, effectiveBindings]);
}
