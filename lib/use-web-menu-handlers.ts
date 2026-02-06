'use client';

import { useCallback } from 'react';
import type { EditorView } from '@milkdown/prose/view';

interface UseWebMenuHandlersProps {
  onNew: () => void;
  onOpen: () => Promise<void>;
  onSave: () => void;
  onSaveAs: () => void;
  editorView?: EditorView | null;
}

export function useWebMenuHandlers({
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  editorView,
}: UseWebMenuHandlersProps) {
  
  const handleMenuAction = useCallback((action: string) => {
    console.log('[Web Menu] Action:', action);
    
    switch (action) {
      // File menu
      case 'new-window':
        onNew();
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
      
      // Edit menu - Using ProseMirror commands
      case 'undo':
        if (editorView) {
          const { state, dispatch } = editorView;
          // Use ProseMirror undo command
          const undoCommand = state.tr;
          if (state.doc) {
            // Try to execute undo via history plugin
            editorView.focus();
            document.execCommand('undo');
          }
        }
        break;
      case 'redo':
        if (editorView) {
          editorView.focus();
          document.execCommand('redo');
        }
        break;
      case 'cut':
        if (editorView) {
          editorView.focus();
          document.execCommand('cut');
        }
        break;
      case 'copy':
        if (editorView) {
          editorView.focus();
          document.execCommand('copy');
        }
        break;
      case 'paste':
        if (editorView) {
          editorView.focus();
          document.execCommand('paste');
        }
        break;
      case 'paste-plaintext':
        // TODO: Implement paste as plaintext
        if (editorView) {
          editorView.focus();
          // This will be implemented later with proper Milkdown integration
          console.warn('[Web Menu] Paste as plaintext not yet implemented');
        }
        break;
      case 'select-all':
        if (editorView) {
          editorView.focus();
          document.execCommand('selectAll');
        }
        break;
      
      // View menu
      case 'reload':
        window.location.reload();
        break;
      case 'reset-zoom':
      case 'zoom-in':
      case 'zoom-out':
        // TODO: Implement zoom functionality
        console.warn('[Web Menu] Zoom functionality not yet implemented');
        break;
      
      default:
        console.warn('[Web Menu] Unknown action:', action);
    }
  }, [onNew, onOpen, onSave, onSaveAs, editorView]);
  
  return { handleMenuAction };
}
