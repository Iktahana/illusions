"use client";

import React, { createContext, useContext } from "react";

/**
 * Exposes a way to clear the "ignored corrections" memory from anywhere in the
 * editor tree (e.g. the linting settings tab) without prop-drilling through
 * the settings modal. The underlying state lives in `useIgnoredCorrections`
 * in page.tsx; this context only surfaces the clear action.
 */
export interface IgnoredCorrectionsContextValue {
  /**
   * Clear ALL ignored corrections for the current editor mode.
   * Project mode → the current project; standalone mode → every file.
   */
  clear: () => Promise<void>;
}

const IgnoredCorrectionsContext = createContext<IgnoredCorrectionsContextValue | null>(null);

interface IgnoredCorrectionsProviderProps {
  children: React.ReactNode;
  value: IgnoredCorrectionsContextValue;
}

export function IgnoredCorrectionsProvider({
  children,
  value,
}: IgnoredCorrectionsProviderProps): React.JSX.Element {
  return (
    <IgnoredCorrectionsContext.Provider value={value}>
      {children}
    </IgnoredCorrectionsContext.Provider>
  );
}

/**
 * Consume the ignored-corrections clear action.
 * Returns `null` when used outside a provider (e.g. the popout editor window),
 * so consumers can render nothing rather than crash.
 */
export function useIgnoredCorrectionsContext(): IgnoredCorrectionsContextValue | null {
  return useContext(IgnoredCorrectionsContext);
}
