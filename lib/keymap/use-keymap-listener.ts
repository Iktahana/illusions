import { useEffect } from "react";

import type { CommandId } from "./command-ids";
import { ALL_COMMAND_IDS } from "./command-ids";
import type { EffectiveBindings } from "@/contexts/KeymapContext";
import { matchesEvent } from "./keymap-utils";

/**
 * Listens for keyboard events and dispatches to command handlers.
 * Replaces the manual if-chain in use-keyboard-shortcuts.ts.
 *
 * Iterates over ALL_COMMAND_IDS (fixed order) rather than object keys
 * so that dispatch priority is deterministic and explicit.
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
      for (const commandId of ALL_COMMAND_IDS) {
        const handler = handlers[commandId];
        if (!handler) continue;

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
