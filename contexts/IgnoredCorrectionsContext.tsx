"use client";

import React, { createContext, useContext } from "react";

import type { IgnoredCorrection } from "@/lib/project/project-types";

/**
 * Exposes the "ignored corrections" memory to the editor tree (the linting
 * settings tab and the corrections inspector) without prop-drilling. The
 * underlying state lives in `useIgnoredCorrections` in page.tsx; this context
 * surfaces the current list and the mutating actions.
 */
export interface IgnoredCorrectionsContextValue {
  /** Ignored corrections for the currently open file/project. */
  items: IgnoredCorrection[];
  /**
   * Clear ALL ignored corrections for the current editor mode.
   * Project mode → the current project; standalone mode → every file.
   */
  clear: () => Promise<void>;
  /** Remove a single ignored correction so the issue surfaces again. */
  unignore: (ruleId: string, text: string, context?: string) => void;
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
