'use client';

import { useCallback } from 'react';
import type { EditorView } from '@milkdown/prose/view';

interface UseWebMenuHandlersProps {
  onNew: () => void;
  onOpen: () => Promise<void>;
  onSave: () => void;
  onSaveAs: () => void;
  onOpenProject?: () => void;
  onOpenRecentProject?: (projectId: string) => void;
  onCloseWindow?: () => void;
  onToggleCompactMode?: () => void;
  onExport?: (format: 'pdf' | 'epub' | 'docx' | 'txt' | 'txt-ruby') => void;
  editorView?: EditorView | null;
  fontScale?: number;
  onFontScaleChange?: (scale: number) => void;
  /** Whether the currently active tab is an editor tab.
   *  Edit-menu operations (undo/redo/cut/copy/paste) and export are no-ops when false. */
  isEditorTabActive?: boolean;
}

export function useWebMenuHandlers({
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onOpenProject,
  onOpenRecentProject,
  onCloseWindow,
  onToggleCompactMode,
  onExport,
  editorView,
  fontScale = 100,
  onFontScaleChange,
  isEditorTabActive = true,
}: UseWebMenuHandlersProps) {

  const handleMenuAction = useCallback((action: string) => {

    switch (action) {
      // File menu
      case 'new-window':
        // Open a new browser tab with the welcome page
        window.open(`${window.location.origin}?welcome`, '_blank');
        break;
      case 'open-file':
        onOpen();
        break;
      case 'save-file':
        onSave();
        break;
      case 'save-as':
        onSaveAs();
        break;
      case 'open-project':
        onOpenProject?.();
        break;
      case 'open-recent-project':
        // No-op: the parent item itself is not clickable; submenu items handle it
        break;
      case 'close-window':
        onCloseWindow?.();
        break;

      // Export — disabled when non-editor tab is active
      case 'export-txt':
        if (isEditorTabActive) onExport?.('txt');
        break;
      case 'export-txt-ruby':
        if (isEditorTabActive) onExport?.('txt-ruby');
        break;
      case 'export-pdf':
        if (isEditorTabActive) onExport?.('pdf');
        break;
      case 'export-epub':
        if (isEditorTabActive) onExport?.('epub');
        break;
      case 'export-docx':
        if (isEditorTabActive) onExport?.('docx');
        break;

      // Edit menu — guard with both editorView and isEditorTabActive
      case 'undo':
        if (editorView && isEditorTabActive) {
          const { state } = editorView;
          if (state.doc) {
            // Execute undo via history plugin
            editorView.focus();
            document.execCommand('undo');
          }
        }
        break;
      case 'redo':
        if (editorView && isEditorTabActive) {
          editorView.focus();
          document.execCommand('redo');
        }
        break;
      case 'cut':
        if (editorView && isEditorTabActive) {
          editorView.focus();
          document.execCommand('cut');
        }
        break;
      case 'copy':
        if (editorView && isEditorTabActive) {
          editorView.focus();
          document.execCommand('copy');
        }
        break;
      case 'paste':
        if (editorView && isEditorTabActive) {
          editorView.focus();
          document.execCommand('paste');
        }
        break;
      case 'paste-plaintext':
        // TODO: Implement paste as plaintext
        if (editorView && isEditorTabActive) {
          editorView.focus();
          // This will be implemented later with proper Milkdown integration
          console.warn('[Web Menu] Paste as plaintext not yet implemented');
        }
        break;
      case 'select-all':
        if (editorView && isEditorTabActive) {
          editorView.focus();
          document.execCommand('selectAll');
        }
        break;
      
      // View menu
      case 'zoom-in': {
        const newScale = Math.min(fontScale + 10, 200);
        onFontScaleChange?.(newScale);
        break;
      }
      case 'zoom-out': {
        const newScale = Math.max(fontScale - 10, 50);
        onFontScaleChange?.(newScale);
        break;
      }
      case 'reset-zoom': {
        onFontScaleChange?.(100);
        break;
      }
      
      case 'toggle-compact-mode':
        onToggleCompactMode?.();
        break;

      case 'show-in-file-manager':
        // No-op in web
        break;

      default:
        if (action.startsWith('open-recent-project:')) {
          const projectId = action.slice('open-recent-project:'.length);
          onOpenRecentProject?.(projectId);
          break;
        }
        console.warn('[Web Menu] Unknown action:', action);
    }
  }, [onNew, onOpen, onSave, onSaveAs, onOpenProject, onOpenRecentProject, onCloseWindow, onToggleCompactMode, onExport, editorView, fontScale, onFontScaleChange, isEditorTabActive]);
  
  return { handleMenuAction };
}
