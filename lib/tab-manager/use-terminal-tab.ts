"use client";

import { useCallback, useRef, useState } from "react";
import type { TabId, TerminalTabState, TerminalTabStatus } from "./tab-types";
import { generateTabId } from "./types";

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseTerminalTabReturn {
  /** All open terminal tabs. */
  terminalTabs: TerminalTabState[];
  /** Create a new terminal tab and spawn a PTY. On spawn failure the tab
   *  transitions to `"error"` status with an error message instead of
   *  remaining stuck in `"connecting"`. */
  createTerminal: () => Promise<void>;
  /** Close a terminal tab and kill its PTY (if any). */
  closeTerminal: (tabId: TabId) => void;
  /** Retry spawning a PTY for a tab that is in `"error"` status. */
  retryTerminal: (tabId: TabId) => Promise<void>;
  /** Update the status of a terminal tab (used by PTY event listeners). */
  updateTerminalStatus: (
    ptyId: string,
    status: TerminalTabStatus,
    extra?: Partial<TerminalTabState>,
  ) => void;
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

/**
 * Manages terminal tab lifecycle with robust PTY spawn error handling.
 *
 * **Key design decision (addresses the original bug):**
 * The tab is created in `"connecting"` state *before* attempting the PTY
 * spawn so that the user sees immediate feedback. If the spawn fails the tab
 * is transitioned to `"error"` (not left as `"connecting"`), giving the user
 * the option to retry or close the tab.
 */
export function useTerminalTab(): UseTerminalTabReturn {
  const [terminalTabs, setTerminalTabs] = useState<TerminalTabState[]>([]);
  const tabsRef = useRef(terminalTabs);
  tabsRef.current = terminalTabs;

  // -----------------------------------------------------------------------
  // Internal: attempt PTY spawn and update tab state accordingly
  // -----------------------------------------------------------------------
  const spawnForTab = useCallback(async (tabId: TabId) => {
    const api = typeof window !== "undefined" ? window.electronAPI?.terminal : undefined;

    if (!api) {
      // Not running in Electron or terminal API unavailable
      setTerminalTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? { ...t, status: "error" as const, errorMessage: "ターミナル機能は Electron 環境でのみ使用できます" }
            : t,
        ),
      );
      return;
    }

    try {
      const result = await api.spawn({});

      if (result.success) {
        setTerminalTabs((prev) =>
          prev.map((t) =>
            t.id === tabId
              ? { ...t, status: "running" as const, ptyId: result.ptyId, pid: result.pid }
              : t,
          ),
        );
      } else {
        // PTY spawn failed — transition to error (the core fix)
        setTerminalTabs((prev) =>
          prev.map((t) =>
            t.id === tabId
              ? { ...t, status: "error" as const, errorMessage: result.error }
              : t,
          ),
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "不明なエラー";
      setTerminalTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? { ...t, status: "error" as const, errorMessage: message }
            : t,
        ),
      );
    }
  }, []);

  // -----------------------------------------------------------------------
  // Public: create terminal
  // -----------------------------------------------------------------------
  const createTerminal = useCallback(async () => {
    const tabId = generateTabId();
    const tab: TerminalTabState = {
      id: tabId,
      title: "ターミナル",
      status: "connecting",
      ptyId: null,
      pid: null,
    };

    // Add tab immediately (user sees "connecting" feedback)
    setTerminalTabs((prev) => [...prev, tab]);

    // Attempt PTY spawn — on failure the tab moves to "error", never stays "connecting"
    await spawnForTab(tabId);
  }, [spawnForTab]);

  // -----------------------------------------------------------------------
  // Public: close terminal
  // -----------------------------------------------------------------------
  const closeTerminal = useCallback((tabId: TabId) => {
    const tab = tabsRef.current.find((t) => t.id === tabId);
    if (tab?.ptyId) {
      window.electronAPI?.terminal?.kill(tab.ptyId).catch((err) => {
        console.warn("[terminal] Failed to kill PTY on tab close:", err);
      });
    }
    setTerminalTabs((prev) => prev.filter((t) => t.id !== tabId));
  }, []);

  // -----------------------------------------------------------------------
  // Public: retry spawn for an errored tab
  // -----------------------------------------------------------------------
  const retryTerminal = useCallback(
    async (tabId: TabId) => {
      setTerminalTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? { ...t, status: "connecting" as const, errorMessage: undefined }
            : t,
        ),
      );
      await spawnForTab(tabId);
    },
    [spawnForTab],
  );

  // -----------------------------------------------------------------------
  // Public: update status from PTY events (data/exit)
  // -----------------------------------------------------------------------
  const updateTerminalStatus = useCallback(
    (ptyId: string, status: TerminalTabStatus, extra?: Partial<TerminalTabState>) => {
      setTerminalTabs((prev) =>
        prev.map((t) =>
          t.ptyId === ptyId ? { ...t, status, ...extra } : t,
        ),
      );
    },
    [],
  );

  return {
    terminalTabs,
    createTerminal,
    closeTerminal,
    retryTerminal,
    updateTerminalStatus,
  };
}
