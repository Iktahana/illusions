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
  /** Handler for Format menu actions (setting name, action type) */
  onFormatChange?: (setting: string, action: string) => void;
  /** Handler for theme mode changes */
  onThemeChange?: (mode: string) => void;
  /** Handler for creating a new tab */
  onNewTab?: () => void;
  /** Handler for closing the active tab */
  onCloseTab?: () => void;
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
  onFormatChange,
  onThemeChange,
  onNewTab,
  onCloseTab,
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
      case 'new-tab':
        onNewTab?.();
        break;
      case 'close-tab':
        onCloseTab?.();
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
        if (editorView && isEditorTabActive) {
          // Read plain text from clipboard and insert it, stripping any rich-text formatting
          void navigator.clipboard.readText().then((text) => {
            if (!text) return;
            const { state, dispatch } = editorView;
            const tr = state.tr.insertText(text, state.selection.from, state.selection.to);
            dispatch(tr);
            editorView.focus();
          }).catch((err: unknown) => {
            console.warn('[Web Menu] クリップボードの読み取りに失敗しました:', err);
          });
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

      // Theme menu
      case 'theme-auto':
        onThemeChange?.('auto');
        break;
      case 'theme-light':
        onThemeChange?.('light');
        break;
      case 'theme-dark':
        onThemeChange?.('dark');
        break;

      // Format menu
      case 'format-line-height-increase':
        onFormatChange?.('lineHeight', 'increase');
        break;
      case 'format-line-height-decrease':
        onFormatChange?.('lineHeight', 'decrease');
        break;
      case 'format-paragraph-spacing-increase':
        onFormatChange?.('paragraphSpacing', 'increase');
        break;
      case 'format-paragraph-spacing-decrease':
        onFormatChange?.('paragraphSpacing', 'decrease');
        break;
      case 'format-text-indent-increase':
        onFormatChange?.('textIndent', 'increase');
        break;
      case 'format-text-indent-decrease':
        onFormatChange?.('textIndent', 'decrease');
        break;
      case 'format-text-indent-none':
        onFormatChange?.('textIndent', 'none');
        break;
      case 'format-chars-per-line-auto':
        onFormatChange?.('charsPerLine', 'auto');
        break;
      case 'format-chars-per-line-increase':
        onFormatChange?.('charsPerLine', 'increase');
        break;
      case 'format-chars-per-line-decrease':
        onFormatChange?.('charsPerLine', 'decrease');
        break;
      case 'format-paragraph-numbers-toggle':
        onFormatChange?.('paragraphNumbers', 'toggle');
        break;

      case 'show-in-file-manager':
        // No-op in web
        break;

      // Help menu
      case 'open-website':
        window.open('https://www.illusions.app/', '_blank');
        break;
      case 'report-ai-inappropriate':
        window.open('https://github.com/Iktahana/illusions/issues/new', '_blank');
        break;

      default:
        if (action.startsWith('open-recent-project:')) {
          const projectId = action.slice('open-recent-project:'.length);
          onOpenRecentProject?.(projectId);
          break;
        }
        console.warn('[Web Menu] Unknown action:', action);
    }
  }, [onNew, onOpen, onSave, onSaveAs, onOpenProject, onOpenRecentProject, onCloseWindow, onToggleCompactMode, onExport, editorView, fontScale, onFontScaleChange, isEditorTabActive, onFormatChange, onThemeChange, onNewTab, onCloseTab]);
  
  return { handleMenuAction };
}
