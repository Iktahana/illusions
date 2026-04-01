"use client";

import { useCallback, useEffect, useRef } from "react";

import type { DiffTabContextValue } from "@/contexts/DiffTabContext";
import type { EditorTabState } from "@/lib/tab-manager/tab-types";
import {
  isDiffTab,
  isEditorTab,
  isTerminalTab,
  type DiffTabState,
  type TabState,
} from "@/lib/tab-manager/tab-types";

interface UseDiffTabsParams {
  tabs: TabState[];
  updateTab: (tabId: string, updates: Partial<EditorTabState>) => void;
  forceCloseTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
}

interface UseDiffTabsResult {
  diffTabContextValue: DiffTabContextValue;
  handleCloseTabWithPtyCleanup: (tabId: string) => void;
}

export function useDiffTabs({
  tabs,
  updateTab,
  forceCloseTab,
  closeTab,
}: UseDiffTabsParams): UseDiffTabsResult {
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const prevTabIdsRef = useRef<Set<string>>(new Set());

  const handleCloseTabWithPtyCleanup = useCallback(
    (tabId: string) => {
      const tab = tabsRef.current.find((candidate) => candidate.id === tabId);
      if (tab && isTerminalTab(tab) && tab.sessionId) {
        void window.electronAPI?.pty?.kill(tab.sessionId);
      }
      closeTab(tabId);
    },
    [closeTab],
  );

  const getDiffTabById = useCallback(
    (tabId: string) =>
      tabsRef.current.find((tab): tab is DiffTabState => isDiffTab(tab) && tab.id === tabId),
    [],
  );

  const getDiffTabBySourceTabId = useCallback(
    (sourceTabId: string) =>
      tabsRef.current.find(
        (tab): tab is DiffTabState => isDiffTab(tab) && tab.sourceTabId === sourceTabId,
      ),
    [],
  );

  const acceptDiskContent = useCallback(
    (diffTabId: string) => {
      const diffTab = tabsRef.current.find(
        (tab): tab is DiffTabState => isDiffTab(tab) && tab.id === diffTabId,
      );
      if (!diffTab) return;

      const sourceTab = tabsRef.current.find(
        (tab) => isEditorTab(tab) && tab.id === diffTab.sourceTabId,
      );
      if (sourceTab && isEditorTab(sourceTab)) {
        updateTab(sourceTab.id, {
          content: diffTab.remoteContent,
          lastSavedContent: diffTab.remoteContent,
          isDirty: false,
          fileSyncStatus: "clean",
          conflictDiskContent: null,
          // Set pendingExternalContent so the live editor instance reflects the new content.
          // EditorLayout passes this as externalContent prop to NovelEditor, which applies
          // it via ProseMirror replaceAll and then clears it via onExternalContentApplied.
          pendingExternalContent: diffTab.remoteContent,
        });
      }

      forceCloseTab(diffTabId);
    },
    [updateTab, forceCloseTab],
  );

  const keepEditorContent = useCallback(
    (diffTabId: string) => {
      const diffTab = tabsRef.current.find(
        (tab): tab is DiffTabState => isDiffTab(tab) && tab.id === diffTabId,
      );
      if (!diffTab) return;

      const sourceTab = tabsRef.current.find(
        (tab) => isEditorTab(tab) && tab.id === diffTab.sourceTabId,
      );
      if (sourceTab && isEditorTab(sourceTab)) {
        updateTab(sourceTab.id, {
          fileSyncStatus: "clean",
          conflictDiskContent: null,
        });
      }

      forceCloseTab(diffTabId);
    },
    [updateTab, forceCloseTab],
  );

  const closeDiffTab = useCallback(
    (diffTabId: string) => {
      forceCloseTab(diffTabId);
    },
    [forceCloseTab],
  );

  const diffTabContextValue: DiffTabContextValue = {
    getDiffTabById,
    getDiffTabBySourceTabId,
    acceptDiskContent,
    keepEditorContent,
    closeDiffTab,
  };

  useEffect(() => {
    const currentTabIds = new Set(tabs.map((tab) => tab.id));
    const removedTabIds = new Set(
      [...prevTabIdsRef.current].filter((id) => !currentTabIds.has(id)),
    );

    if (removedTabIds.size > 0) {
      const orphanedDiffTabIds = tabs
        .filter((tab): tab is DiffTabState => isDiffTab(tab) && removedTabIds.has(tab.sourceTabId))
        .map((tab) => tab.id);

      for (const diffTabId of orphanedDiffTabIds) {
        forceCloseTab(diffTabId);
      }
    }

    prevTabIdsRef.current = currentTabIds;
  }, [tabs, forceCloseTab]);

  return {
    diffTabContextValue,
    handleCloseTabWithPtyCleanup,
  };
}
