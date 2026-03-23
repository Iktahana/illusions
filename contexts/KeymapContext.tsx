"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { CommandId } from "@/lib/keymap/command-ids";
import type { KeyBinding, KeymapOverrides } from "@/lib/keymap/keymap-types";
import { loadKeymapOverrides, saveKeymapOverrides } from "@/lib/keymap/keymap-storage";
import { SHORTCUT_REGISTRY } from "@/lib/keymap/shortcut-registry";

/**
 * The effective binding for a command: either the user override or the default.
 */
export type EffectiveBindings = Record<CommandId, KeyBinding | null>;

export interface KeymapContextValue {
  /** Merged bindings (defaults + user overrides) */
  effectiveBindings: EffectiveBindings;
  /** Raw user overrides (only differences from defaults) */
  overrides: KeymapOverrides;
  /** Set or clear a binding override for a command */
  setOverride: (id: CommandId, binding: KeyBinding | null) => Promise<void>;
  /** Reset a single command back to its default */
  resetOverride: (id: CommandId) => Promise<void>;
  /** Reset all commands to their defaults */
  resetAll: () => Promise<void>;
}

const KeymapContext = createContext<KeymapContextValue | null>(null);

interface KeymapProviderProps {
  children: React.ReactNode;
}

/**
 * Builds the default bindings map from the registry.
 */
function buildDefaultBindings(): EffectiveBindings {
  const result = {} as EffectiveBindings;
  for (const entry of Object.values(SHORTCUT_REGISTRY)) {
    result[entry.id] = entry.defaultBinding;
  }
  return result;
}

/**
 * Merges default bindings with user overrides.
 */
function mergeBindings(defaults: EffectiveBindings, overrides: KeymapOverrides): EffectiveBindings {
  return { ...defaults, ...overrides } as EffectiveBindings;
}

/**
 * Provider that loads keymap overrides from storage and exposes
 * effective (merged) bindings to all child components.
 */
export function KeymapProvider({ children }: KeymapProviderProps): React.JSX.Element {
  const defaultBindings = useMemo(() => buildDefaultBindings(), []);
  const [overrides, setOverrides] = useState<KeymapOverrides>({});

  useEffect(() => {
    void loadKeymapOverrides().then(setOverrides);
  }, []);

  const effectiveBindings = useMemo(
    () => mergeBindings(defaultBindings, overrides),
    [defaultBindings, overrides],
  );

  const setOverride = useCallback(async (id: CommandId, binding: KeyBinding | null) => {
    const next: KeymapOverrides = { ...overrides, [id]: binding };
    setOverrides(next);
    await saveKeymapOverrides(next);
  }, [overrides]);

  const resetOverride = useCallback(async (id: CommandId) => {
    const next = { ...overrides };
    delete next[id];
    setOverrides(next);
    await saveKeymapOverrides(next);
  }, [overrides]);

  const resetAll = useCallback(async () => {
    setOverrides({});
    await saveKeymapOverrides({});
  }, []);

  const value = useMemo<KeymapContextValue>(
    () => ({ effectiveBindings, overrides, setOverride, resetOverride, resetAll }),
    [effectiveBindings, overrides, setOverride, resetOverride, resetAll],
  );

  return (
    <KeymapContext.Provider value={value}>
      {children}
    </KeymapContext.Provider>
  );
}

/**
 * Hook to consume keymap context.
 * Must be called within a KeymapProvider.
 */
export function useKeymap(): KeymapContextValue {
  const ctx = useContext(KeymapContext);
  if (!ctx) {
    throw new Error("useKeymap must be used within a KeymapProvider");
  }
  return ctx;
}
