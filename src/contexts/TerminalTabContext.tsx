"use client";

/**
 * TerminalTabContext — provides terminal tab state lookup and update
 * to dockview panel components that cannot access the tab manager directly.
 *
 * Populated by app/page.tsx; consumed by lib/dockview/dockview-components.tsx.
 */

import { createContext, useContext } from "react";
import type { TerminalTabState } from "@/lib/tab-manager/tab-types";

// ---------------------------------------------------------------------------
// Context value
// ---------------------------------------------------------------------------

export interface TerminalTabContextValue {
  /** Look up a terminal tab by sessionId */
  getTerminalTabBySessionId: (sessionId: string) => TerminalTabState | undefined;
  /** Update terminal tab status when PTY exits */
  setTerminalTabExited: (sessionId: string, exitCode: number) => void;
  /** Kill PTY session when tab is closed */
  killTerminalSession: (sessionId: string) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const TerminalTabContext = createContext<TerminalTabContextValue | null>(null);

export { TerminalTabContext };

/**
 * Returns the terminal tab context value.
 * Throws if used outside of a TerminalTabContext.Provider.
 */
export function useTerminalTabContext(): TerminalTabContextValue {
  const ctx = useContext(TerminalTabContext);
  if (!ctx) {
    throw new Error("useTerminalTabContext must be used inside TerminalTabContext.Provider");
  }
  return ctx;
}
