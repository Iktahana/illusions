"use client";

import { useCallback, useRef, type MutableRefObject } from "react";
import type { UseTabManagerReturn } from "./types";
import { useTabState } from "./use-tab-state";
import { useFileIO } from "./use-file-io";
import { useAutoSave } from "./use-auto-save";
import { useElectronMenuBindings } from "./use-electron-menu-bindings";
import { useTabPersistence } from "./use-tab-persistence";
import { useCloseDialog } from "./use-close-dialog";
import { useFileWatchIntegration } from "./use-file-watch-integration";

// Re-export the return type so consumers can import from this module
export type { UseTabManagerReturn } from "./types";

// ---------------------------------------------------------------------------
// Composed hook
// ---------------------------------------------------------------------------

/**
 * Main tab manager hook that composes all sub-hooks.
 * Returns the exact same interface as the original monolithic useTabManager.
 */
export function useTabManager(options?: {
  skipAutoRestore?: boolean;
  autoSave?: boolean;
  /**
   * Power-save mode; throttles the auto-save interval while the window is
   * backgrounded (#1466). Defaults to false (no throttling).
   */
  powerSaveMode?: boolean;
  vfsReadyPromise?: Promise<void>;
  /** External flush callback for dockview layout persistence. */
  flushLayoutState?: () => Promise<void>;
  /**
   * Stable per-window key (e.g. project root path) used to scope tab and layout
   * state so multiple windows with different projects do not overwrite each other.
   */
  windowKey?: string | null;
  /** Callback to trigger editor remount when external file changes are detected. */
  onEditorRemountNeeded?: () => void;
  /**
   * Ref holding the active editor's on-demand live-content flush (#1840).
   * Save flows call it before persisting to avoid writing debounce-lagged
   * content. Populated by the mounted MilkdownEditor via `registerFlush`.
   */
  flushActiveEditorRef?: MutableRefObject<(() => string | null) | null>;
}): UseTabManagerReturn {
  const skipAutoRestore = options?.skipAutoRestore ?? false;
  const autoSaveEnabled = options?.autoSave ?? true;

  // --- Core tab state -----------------------------------------------------

  const tabState = useTabState();

  // --- File I/O -----------------------------------------------------------

  const fileIO = useFileIO({
    tabs: tabState.tabs,
    setTabs: tabState.setTabs,
    activeTabId: tabState.activeTabId,
    setActiveTabId: tabState.setActiveTabId,
    tabsRef: tabState.tabsRef,
    activeTabIdRef: tabState.activeTabIdRef,
    isProjectRef: tabState.isProjectRef,
    isElectron: tabState.isElectron,
    updateTab: tabState.updateTab,
    findTabByPath: tabState.findTabByPath,
    forceCloseTab: tabState.forceCloseTab,
    closeTab: tabState.closeTab,
    flushActiveEditorRef: options?.flushActiveEditorRef,
  });

  // --- Close dialog (depends on file I/O for save-then-close) -------------

  const closeDialog = useCloseDialog({
    tabs: tabState.tabs,
    setTabs: tabState.setTabs,
    activeTabId: tabState.activeTabId,
    setActiveTabId: tabState.setActiveTabId,
    tabsRef: tabState.tabsRef,
    activeTabIdRef: tabState.activeTabIdRef,
    isProjectRef: tabState.isProjectRef,
    isElectron: tabState.isElectron,
    pendingCloseTabId: tabState.pendingCloseTabId,
    setPendingCloseTabId: tabState.setPendingCloseTabId,
    forceCloseTab: tabState.forceCloseTab,
    flushActiveEditorRef: options?.flushActiveEditorRef,
    tryCreateSnapshot: fileIO.tryCreateSnapshot,
  });

  // --- Auto-save ----------------------------------------------------------

  useAutoSave({
    tabs: tabState.tabs,
    setTabs: tabState.setTabs,
    activeTabId: tabState.activeTabId,
    setActiveTabId: tabState.setActiveTabId,
    tabsRef: tabState.tabsRef,
    activeTabIdRef: tabState.activeTabIdRef,
    isProjectRef: tabState.isProjectRef,
    isElectron: tabState.isElectron,
    autoSaveEnabled,
    powerSaveMode: options?.powerSaveMode ?? false,
    saveFileRef: fileIO.saveFileRef,
    tryCreateSnapshot: fileIO.tryCreateSnapshot,
  });

  // --- Electron IPC bindings & browser event listeners --------------------

  const systemFileOpenHandlerRef = useRef<((path: string, content: string) => void) | null>(null);

  // flushTabState is provided by useTabPersistence below; use a ref so the
  // menu bindings can call it in the async onSaveBeforeClose handler.
  const flushTabStateRef = useRef<(() => Promise<void>) | undefined>(undefined);

  useElectronMenuBindings({
    tabs: tabState.tabs,
    setTabs: tabState.setTabs,
    activeTabId: tabState.activeTabId,
    setActiveTabId: tabState.setActiveTabId,
    tabsRef: tabState.tabsRef,
    activeTabIdRef: tabState.activeTabIdRef,
    isProjectRef: tabState.isProjectRef,
    isElectron: tabState.isElectron,
    saveFileRef: fileIO.saveFileRef,
    saveAsFileRef: fileIO.saveAsFileRef,
    closeTab: tabState.closeTab,
    newTab: tabState.newTab,
    loadSystemFile: fileIO.loadSystemFile,
    updateTab: tabState.updateTab,
    systemFileOpenHandlerRef,
    flushActiveEditorRef: options?.flushActiveEditorRef,
    flushTabState: flushTabStateRef.current,
    flushLayoutState: options?.flushLayoutState,
    tryCreateSnapshot: fileIO.tryCreateSnapshot,
  });

  // --- File watch integration (external change detection) -----------------

  useFileWatchIntegration({
    tabs: tabState.tabs,
    setTabs: tabState.setTabs,
    activeTabId: tabState.activeTabId,
    setActiveTabId: tabState.setActiveTabId,
    tabsRef: tabState.tabsRef,
    activeTabIdRef: tabState.activeTabIdRef,
    isProjectRef: tabState.isProjectRef,
    isElectron: tabState.isElectron,
    openDiffTab: tabState.openDiffTab,
    onEditorRemountNeeded: options?.onEditorRemountNeeded,
    tryCreateSnapshot: fileIO.tryCreateSnapshot,
  });

  // --- Tab persistence (save/restore to AppState) -------------------------

  const {
    wasAutoRecovered,
    flushTabState: _flushTabState,
    restoreProjectTabs,
  } = useTabPersistence({
    tabs: tabState.tabs,
    setTabs: tabState.setTabs,
    activeTabId: tabState.activeTabId,
    setActiveTabId: tabState.setActiveTabId,
    tabsRef: tabState.tabsRef,
    activeTabIdRef: tabState.activeTabIdRef,
    isProjectRef: tabState.isProjectRef,
    isElectron: tabState.isElectron,
    skipAutoRestore,
    vfsReadyPromise: options?.vfsReadyPromise,
    windowKey: options?.windowKey,
  });

  // Update the ref so useElectronMenuBindings can access flushTabState
  flushTabStateRef.current = _flushTabState;

  // --- Backward compat alias: newFile === newTab --------------------------
  const newFile = tabState.newTab;

  // Register system file open callback
  const onSystemFileOpen = useCallback((handler: (path: string, content: string) => void) => {
    systemFileOpenHandlerRef.current = handler;
  }, []);

  // -----------------------------------------------------------------------
  // Return the exact same interface as the original hook
  // -----------------------------------------------------------------------

  return {
    // Backward-compatible surface
    currentFile: tabState.currentFile,
    content: tabState.content,
    setContent: tabState.setContent,
    isDirty: tabState.isDirty,
    isSaving: tabState.isSaving,
    lastSavedTime: tabState.lastSavedTime,
    lastSaveWasAuto: tabState.lastSaveWasAuto,
    openFile: fileIO.openFile,
    saveFile: fileIO.saveFile,
    saveAllDirtyTabs: fileIO.saveAllDirtyTabs,
    saveAsFile: fileIO.saveAsFile,
    newFile,
    updateFileName: tabState.updateFileName,
    wasAutoRecovered,
    onSystemFileOpen,
    _loadSystemFile: fileIO.loadSystemFile,

    // Tab management
    tabs: tabState.tabs,
    activeTabId: tabState.activeTabId,
    newTab: tabState.newTab,
    cloneTab: tabState.cloneTab,
    closeTab: tabState.closeTab,
    switchTab: tabState.switchTab,
    nextTab: tabState.nextTab,
    prevTab: tabState.prevTab,
    switchToIndex: tabState.switchToIndex,
    openProjectFile: fileIO.openProjectFile,
    pinTab: tabState.pinTab,
    newTerminalTab: tabState.newTerminalTab,
    updateTerminalTab: tabState.updateTerminalTab,
    openDiffTab: tabState.openDiffTab,
    forceCloseTab: tabState.forceCloseTab,
    updateTab: tabState.updateTab,
    setTabContent: tabState.setTabContent,

    // Close-tab dialog
    pendingCloseTabId: tabState.pendingCloseTabId,
    pendingCloseFileName: tabState.pendingCloseFileName,
    handleCloseTabSave: closeDialog.handleCloseTabSave,
    handleCloseTabDiscard: closeDialog.handleCloseTabDiscard,
    handleCloseTabCancel: tabState.handleCloseTabCancel,

    // Persistence flush
    flushTabState: _flushTabState,

    // Project tab restore
    restoreProjectTabs,
  };
}
