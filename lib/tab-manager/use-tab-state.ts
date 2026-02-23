"use client";

import { useCallback, useRef, useState } from "react";
import type { MdiFileDescriptor } from "../mdi-file";
import type { SupportedFileExtension } from "../project-types";
import type { TabId, TabState } from "../tab-types";
import { createNewTab } from "./types";
import type { TabManagerCore } from "./types";
import { useEditorMode } from "@/contexts/EditorModeContext";
import { isElectronRenderer } from "../runtime-env";

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseTabStateReturn extends TabManagerCore {
  /** Derived: active tab object (falls back to tabs[0]). */
  activeTab: TabState;
  /** Derived: file descriptor of the active tab. */
  currentFile: MdiFileDescriptor | null;
  /** Derived: content string of the active tab. */
  content: string;
  /** Ref tracking the latest content value. */
  contentRef: React.MutableRefObject<string>;
  /** Derived: whether the active tab has unsaved changes. */
  isDirty: boolean;
  /** Derived: whether the active tab is currently saving. */
  isSaving: boolean;
  /** Derived: timestamp of the last save on the active tab. */
  lastSavedTime: number | null;
  /** Derived: whether the most recent save on the active tab was an auto-save. */
  lastSaveWasAuto: boolean;
  /** Update a single tab by id. */
  updateTab: (tabId: TabId, updates: Partial<TabState>) => void;
  /** Find a tab by its file path. */
  findTabByPath: (path: string) => TabState | undefined;

  // Tab CRUD operations
  /** Create a new empty tab. */
  newTab: (fileType?: SupportedFileExtension) => void;
  /** Switch to an existing tab by id. */
  switchTab: (tabId: TabId) => void;
  /** Switch to the next tab. */
  nextTab: () => void;
  /** Switch to the previous tab. */
  prevTab: () => void;
  /** Switch to a tab by its index (0-based). */
  switchToIndex: (index: number) => void;
  /** Force-close a tab without dirty check. */
  forceCloseTab: (tabId: TabId) => void;
  /** Close a tab with dirty check (may trigger unsaved-changes dialog). */
  closeTab: (tabId: TabId) => void;
  /** Pin (promote) a preview tab to a fixed tab. */
  pinTab: (tabId: TabId) => void;
  /** Set content on the active tab. */
  setContent: (content: string) => void;
  /** Update the file name of the active tab. */
  updateFileName: (newName: string) => void;

  // Close-tab unsaved warning dialog state
  pendingCloseTabId: TabId | null;
  pendingCloseFileName: string;
  setPendingCloseTabId: React.Dispatch<React.SetStateAction<TabId | null>>;
  handleCloseTabCancel: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTabState(): UseTabStateReturn {
  const isElectron =
    typeof window !== "undefined" && isElectronRenderer();
  const { isProject } = useEditorMode();

  // --- Core state ---------------------------------------------------------

  const [initialTab] = useState(() => createNewTab());
  const [tabs, setTabs] = useState<TabState[]>([initialTab]);
  const [activeTabId, setActiveTabId] = useState<TabId>(initialTab.id);
  const [pendingCloseTabId, setPendingCloseTabId] = useState<TabId | null>(
    null,
  );

  // --- Refs ---------------------------------------------------------------

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  const isProjectRef = useRef(isProject);
  isProjectRef.current = isProject;

  // --- Derived state from active tab --------------------------------------

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const currentFile = activeTab?.file ?? null;
  const content = activeTab?.content ?? "";
  const isDirty = activeTab?.isDirty ?? false;
  const isSaving = activeTab?.isSaving ?? false;
  const lastSavedTime = activeTab?.lastSavedTime ?? null;
  const lastSaveWasAuto = activeTab?.lastSaveWasAuto ?? false;

  const contentRef = useRef(content);
  contentRef.current = content;

  // --- Helpers ------------------------------------------------------------

  const updateTab = useCallback(
    (tabId: TabId, updates: Partial<TabState>) => {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === tabId ? { ...tab, ...updates } : tab,
        ),
      );
    },
    [],
  );

  const findTabByPath = useCallback(
    (path: string): TabState | undefined =>
      tabsRef.current.find((t) => t.file?.path === path),
    [],
  );

  // --- Tab CRUD -----------------------------------------------------------

  const newTab = useCallback((fileType?: SupportedFileExtension) => {
    const tab = createNewTab(undefined, fileType);
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  }, []);

  const switchTab = useCallback((tabId: TabId) => {
    if (tabsRef.current.some((t) => t.id === tabId)) {
      setActiveTabId(tabId);
    }
  }, []);

  const nextTabFn = useCallback(() => {
    const idx = tabsRef.current.findIndex(
      (t) => t.id === activeTabIdRef.current,
    );
    if (idx === -1) return;
    const next = (idx + 1) % tabsRef.current.length;
    setActiveTabId(tabsRef.current[next].id);
  }, []);

  const prevTabFn = useCallback(() => {
    const idx = tabsRef.current.findIndex(
      (t) => t.id === activeTabIdRef.current,
    );
    if (idx === -1) return;
    const prev =
      (idx - 1 + tabsRef.current.length) % tabsRef.current.length;
    setActiveTabId(tabsRef.current[prev].id);
  }, []);

  const switchToIndex = useCallback((index: number) => {
    const cur = tabsRef.current;
    if (cur.length === 0) return;
    // Cmd+9 → last tab
    const target = index >= cur.length ? cur.length - 1 : Math.max(0, index);
    setActiveTabId(cur[target].id);
  }, []);

  const forceCloseTab = useCallback((tabId: TabId) => {
    const current = tabsRef.current;
    const index = current.findIndex((t) => t.id === tabId);
    if (index === -1) return;

    const remaining = current.filter((t) => t.id !== tabId);
    if (remaining.length === 0) {
      const emptyTab = createNewTab(undefined, ".mdi");
      setTabs([emptyTab]);
      setActiveTabId(emptyTab.id);
      return;
    }

    setTabs(remaining);
    if (tabId === activeTabIdRef.current) {
      const newIndex = Math.min(index, remaining.length - 1);
      setActiveTabId(remaining[newIndex].id);
    }
  }, []);

  const closeTab = useCallback(
    (tabId: TabId) => {
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (!tab) return;
      if (tab.isDirty) {
        setPendingCloseTabId(tabId);
        return;
      }
      forceCloseTab(tabId);
    },
    [forceCloseTab],
  );

  const pinTab = useCallback(
    (tabId: TabId) => {
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (tab?.isPreview) {
        updateTab(tabId, { isPreview: false });
      }
    },
    [updateTab],
  );

  // --- Content management -------------------------------------------------

  const setContent = useCallback((newContent: string) => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== activeTabIdRef.current) return tab;
        const dirty = newContent !== tab.lastSavedContent;
        return {
          ...tab,
          content: newContent,
          isDirty: dirty,
          // Promote preview tab to fixed when edited
          isPreview: dirty ? false : tab.isPreview,
        };
      }),
    );
  }, []);

  const updateFileName = useCallback((newName: string) => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== activeTabIdRef.current) return tab;
        const file: MdiFileDescriptor = tab.file
          ? { ...tab.file, name: newName }
          : { path: null, handle: null, name: newName };
        return { ...tab, file };
      }),
    );
  }, []);

  // --- Pending close-tab dialog -------------------------------------------

  const pendingCloseTab = pendingCloseTabId
    ? tabs.find((t) => t.id === pendingCloseTabId)
    : null;
  const pendingCloseFileName =
    pendingCloseTab?.file?.name ?? `新規ファイル${pendingCloseTab?.fileType ?? ".mdi"}`;

  const handleCloseTabCancel = useCallback(() => {
    setPendingCloseTabId(null);
  }, []);

  // -----------------------------------------------------------------------

  return {
    // TabManagerCore
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    tabsRef,
    activeTabIdRef,
    isProjectRef,
    isElectron,

    // Derived
    activeTab,
    currentFile,
    content,
    contentRef,
    isDirty,
    isSaving,
    lastSavedTime,
    lastSaveWasAuto,

    // Helpers
    updateTab,
    findTabByPath,

    // Tab CRUD
    newTab,
    switchTab,
    nextTab: nextTabFn,
    prevTab: prevTabFn,
    switchToIndex,
    forceCloseTab,
    closeTab,
    pinTab,

    // Content
    setContent,
    updateFileName,

    // Close dialog
    pendingCloseTabId,
    pendingCloseFileName,
    setPendingCloseTabId,
    handleCloseTabCancel,
  };
}
