"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { TerminalTabContextValue } from "@/contexts/TerminalTabContext";
import type { EditorSettings } from "@/lib/editor-page/use-editor-settings";
import { isProjectMode, type EditorMode } from "@/lib/project/project-types";
import { isTerminalTab, type TabState, type TerminalTabState } from "@/lib/tab-manager/tab-types";

interface UseTerminalTabsParams {
  tabs: TabState[];
  newTerminalTab: (pendingId?: string) => void;
  updateTerminalTab: (
    tabId: string,
    updates: Partial<
      Pick<
        TerminalTabState,
        "sessionId" | "status" | "exitCode" | "label" | "cwd" | "shell" | "pendingId"
      >
    >,
  ) => void;
  forceCloseTab: (tabId: string) => void;
  editorMode: EditorMode;
  settings: EditorSettings;
  isElectron: boolean;
}

interface UseTerminalTabsResult {
  handleNewTerminalTab: () => void;
  terminalTabContextValue: TerminalTabContextValue;
  showDesktopOnlyDialog: boolean;
  setShowDesktopOnlyDialog: Dispatch<SetStateAction<boolean>>;
}

export function useTerminalTabs({
  tabs,
  newTerminalTab,
  updateTerminalTab,
  forceCloseTab,
  editorMode,
  settings,
  isElectron,
}: UseTerminalTabsParams): UseTerminalTabsResult {
  const [showDesktopOnlyDialog, setShowDesktopOnlyDialog] = useState(false);

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const updateTerminalTabRef = useRef(updateTerminalTab);
  updateTerminalTabRef.current = updateTerminalTab;

  const handleNewTerminalTab = useCallback(() => {
    if (isElectron) {
      const ptyApi = window.electronAPI?.pty;
      if (!ptyApi) return;

      // Assign a unique pendingId before spawn so parallel spawns can be correlated correctly.
      const pendingId = crypto.randomUUID();
      newTerminalTab(pendingId);

      void (async () => {
        const cwd = isProjectMode(editorMode) ? editorMode.rootPath : undefined;
        const shell = settings.terminalDefaultShell || undefined;
        const result = await ptyApi.spawn({ cwd, shell });
        if ("error" in result) {
          console.error("[Terminal] PTY spawn failed:", result.error);
          // PTY spawn failed — remove the specific placeholder tab identified by pendingId.
          const stuckTab = tabsRef.current.find(
            (tab) => isTerminalTab(tab) && tab.pendingId === pendingId,
          );
          if (stuckTab) {
            forceCloseTab(stuckTab.id);
          }
          return;
        }

        const { sessionId } = result;
        // Find the specific placeholder tab by pendingId instead of searching for the last empty sessionId.
        const targetTab = tabsRef.current.find(
          (tab) => isTerminalTab(tab) && tab.pendingId === pendingId,
        );

        if (targetTab) {
          updateTerminalTabRef.current(targetTab.id, {
            sessionId,
            pendingId: null,
            status: "running",
          });
        }
      })();
    } else {
      setShowDesktopOnlyDialog(true);
    }
  }, [newTerminalTab, editorMode, settings.terminalDefaultShell, isElectron]);

  useEffect(() => {
    if (!isElectron) return;

    const ptyApi = window.electronAPI?.pty;
    if (!ptyApi) return;

    const unsubExit = ptyApi.onExit(({ sessionId, exitCode }) => {
      const tab = tabsRef.current.find(
        (candidate) => isTerminalTab(candidate) && candidate.sessionId === sessionId,
      );

      if (tab) {
        updateTerminalTabRef.current(tab.id, { status: "exited", exitCode });
      }
    });

    return unsubExit;
  }, [isElectron]);

  const getTerminalTabBySessionId = useCallback(
    (sessionId: string) =>
      tabsRef.current.find(
        (tab): tab is TerminalTabState => isTerminalTab(tab) && tab.sessionId === sessionId,
      ),
    [],
  );

  const setTerminalTabExited = useCallback((sessionId: string, exitCode: number) => {
    const tab = tabsRef.current.find(
      (candidate): candidate is TerminalTabState =>
        isTerminalTab(candidate) && candidate.sessionId === sessionId,
    );

    if (tab) {
      updateTerminalTabRef.current(tab.id, { status: "exited", exitCode });
    }
  }, []);

  const killTerminalSession = useCallback((sessionId: string) => {
    void window.electronAPI?.pty?.kill(sessionId);
  }, []);

  const terminalTabContextValue: TerminalTabContextValue = {
    getTerminalTabBySessionId,
    setTerminalTabExited,
    killTerminalSession,
  };

  return {
    handleNewTerminalTab,
    terminalTabContextValue,
    showDesktopOnlyDialog,
    setShowDesktopOnlyDialog,
  };
}
