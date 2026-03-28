import { useEffect } from "react";

import type { CommandId } from "./command-ids";
import type { EffectiveBindings } from "@/contexts/KeymapContext";
import type { ShortcutScope } from "./keymap-types";
import { matchesEvent } from "./keymap-utils";
import { SHORTCUT_REGISTRY } from "./shortcut-registry";
import { isElectronRenderer } from "@/lib/utils/runtime-env";

/**
 * Checks whether a command should fire in the current runtime environment
 * based on its registered scope.
 */
function isScopeActive(scope: ShortcutScope): boolean {
  const isElectron = isElectronRenderer();
  if (scope === "all") return true;
  if (scope === "electron-only") return isElectron;
  if (scope === "web-only") return !isElectron;
  return true;
}

/**
 * Listens for keyboard events and dispatches to command handlers.
 * Replaces the manual if-chain in use-keyboard-shortcuts.ts.
 *
 * Respects the `scope` field in the shortcut registry: commands scoped
 * to "electron-only" or "web-only" are skipped in the wrong environment.
 *
 * @param handlers - Map of CommandId to handler function
 * @param effectiveBindings - Merged bindings from KeymapContext (defaults + user overrides)
 */
export function useKeymapListener(
  handlers: Partial<Record<CommandId, () => void>>,
  effectiveBindings: EffectiveBindings,
): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      for (const [commandId, handler] of Object.entries(handlers) as Array<[CommandId, (() => void) | undefined]>) {
        if (!handler) continue;

        const entry = SHORTCUT_REGISTRY[commandId];
        if (entry && !isScopeActive(entry.scope)) continue;

        const binding = effectiveBindings[commandId];
        if (matchesEvent(binding, event)) {
          event.preventDefault();
          handler();
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlers, effectiveBindings]);
}
