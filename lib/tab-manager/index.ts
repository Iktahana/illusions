"use client";

import { useCallback, useRef } from "react";
import type { UseTabManagerReturn } from "./types";
import { useTabState } from "./use-tab-state";
import { useFileIO } from "./use-file-io";
import { useAutoSave } from "./use-auto-save";
import { useElectronMenuBindings } from "./use-electron-menu-bindings";
import { useTabPersistence } from "./use-tab-persistence";
import { useCloseDialog } from "./use-close-dialog";

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
  vfsReadyPromise?: Promise<void>;
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
    updateTab: tabState.updateTab,
    forceCloseTab: tabState.forceCloseTab,
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
    saveFileRef: fileIO.saveFileRef,
  });

  // --- Electron IPC bindings & browser event listeners --------------------

  const systemFileOpenHandlerRef = useRef<
    ((path: string, content: string) => void) | null
  >(null);

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
  });

  // --- Tab persistence (save/restore to AppState) -------------------------

  const { wasAutoRecovered } = useTabPersistence({
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
  });

  // --- Backward compat alias: newFile === newTab --------------------------
  const newFile = tabState.newTab;

  // Register system file open callback
  const onSystemFileOpen = useCallback(
    (handler: (path: string, content: string) => void) => {
      systemFileOpenHandlerRef.current = handler;
    },
    [],
  );

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
    closeTab: tabState.closeTab,
    switchTab: tabState.switchTab,
    nextTab: tabState.nextTab,
    prevTab: tabState.prevTab,
    switchToIndex: tabState.switchToIndex,
    openProjectFile: fileIO.openProjectFile,
    pinTab: tabState.pinTab,

    // Close-tab dialog
    pendingCloseTabId: tabState.pendingCloseTabId,
    pendingCloseFileName: tabState.pendingCloseFileName,
    handleCloseTabSave: closeDialog.handleCloseTabSave,
    handleCloseTabDiscard: closeDialog.handleCloseTabDiscard,
    handleCloseTabCancel: tabState.handleCloseTabCancel,
  };
}
