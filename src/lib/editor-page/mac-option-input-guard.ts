import { Plugin } from "@milkdown/prose/state";

import { isMacOS } from "@/lib/utils/runtime-env";

type OptionKeyEvent = Pick<KeyboardEvent, "altKey" | "key" | "preventDefault">;

/**
 * macOS turns many Option combinations into text before the editor receives
 * input (for example, Option+V produces `√`). Keep non-text Option shortcuts
 * such as Option+Arrow available to the browser/editor.
 */
export function shouldSuppressMacOptionTextInput(
  event: Pick<OptionKeyEvent, "altKey" | "key">,
  isMac = isMacOS(),
): boolean {
  if (!isMac || !event.altKey || event.key === "Alt") return false;

  // Dead keys must also be consumed: they produce text only after the next
  // keystroke, so waiting for a printable key would be too late.
  return event.key === "Dead" || event.key.length === 1;
}

/** Prevents macOS Option-generated text while allowing the event to bubble to global shortcuts. */
export function suppressMacOptionTextInput(event: OptionKeyEvent, isMac = isMacOS()): boolean {
  if (!shouldSuppressMacOptionTextInput(event, isMac)) return false;
  event.preventDefault();
  return true;
}

/** ProseMirror integration for the editor's editable DOM only. */
export function createMacOptionInputGuardPlugin(
  isOptionCharacterInputAllowed: () => boolean = () => false,
): Plugin {
  return new Plugin({
    props: {
      handleDOMEvents: {
        keydown: (_view, event) => {
          if (isOptionCharacterInputAllowed()) return false;
          return suppressMacOptionTextInput(event);
        },
      },
    },
  });
}
