import type { KeyBinding } from "./keymap-types";
import { isMacOS } from "@/lib/utils/runtime-env";

/**
 * Returns the platform-specific display string for a key binding.
 * e.g. { modifiers: ["CmdOrCtrl", "Shift"], key: "s" } -> "Cmd+Shift+S" (macOS) / "Ctrl+Shift+S" (Win/Linux)
 */
export function formatBinding(binding: KeyBinding | null): string {
  if (!binding) return "未設定";

  const isMac = isMacOS();
  const parts: string[] = [];

  for (const mod of binding.modifiers) {
    if (mod === "CmdOrCtrl") {
      parts.push(isMac ? "\u2318" : "Ctrl");
    } else if (mod === "Shift") {
      parts.push(isMac ? "\u21E7" : "Shift");
    } else if (mod === "Alt") {
      parts.push(isMac ? "\u2325" : "Alt");
    } else if (mod === "Ctrl") {
      parts.push(isMac ? "\u2303" : "Ctrl");
    }
  }

  const keyDisplay = formatKey(binding.key, isMac);
  if (isMac) {
    return parts.join("") + keyDisplay;
  }
  return [...parts, keyDisplay].join("+");
}

/**
 * Formats a key name for display.
 */
function formatKey(key: string, isMac: boolean): string {
  const keyMap: Record<string, string> = {
    Tab: "Tab",
    Escape: "Esc",
    Backspace: isMac ? "\u232B" : "Backspace",
    Delete: isMac ? "\u2326" : "Delete",
    Enter: isMac ? "\u21A9" : "Enter",
    ArrowUp: "\u2191",
    ArrowDown: "\u2193",
    ArrowLeft: "\u2190",
    ArrowRight: "\u2192",
    "\\": "\\",
  };
  return keyMap[key] ?? key.toUpperCase();
}

/**
 * Checks whether a keyboard event matches the given binding.
 * Handles CmdOrCtrl as either Cmd (macOS) or Ctrl (Win/Linux).
 */
export function matchesEvent(binding: KeyBinding | null, event: KeyboardEvent): boolean {
  if (!binding) return false;

  const isMac = isMacOS();

  for (const mod of binding.modifiers) {
    if (mod === "CmdOrCtrl") {
      const required = isMac ? event.metaKey : event.ctrlKey;
      if (!required) return false;
    } else if (mod === "Shift") {
      if (!event.shiftKey) return false;
    } else if (mod === "Alt") {
      if (!event.altKey) return false;
    } else if (mod === "Ctrl") {
      if (!event.ctrlKey) return false;
    }
  }

  // Ensure modifiers NOT in binding are not pressed
  const hasCmdOrCtrl = binding.modifiers.includes("CmdOrCtrl");
  const hasCtrl = binding.modifiers.includes("Ctrl");

  if (!hasCmdOrCtrl && !hasCtrl) {
    // Neither CmdOrCtrl nor Ctrl required: both must be absent
    if (event.ctrlKey || event.metaKey) return false;
  } else if (hasCmdOrCtrl && !hasCtrl) {
    // CmdOrCtrl is required; the opposite platform modifier must be absent
    if (isMac && event.ctrlKey) return false;
    if (!isMac && event.metaKey) return false;
  }

  if (!binding.modifiers.includes("Shift") && event.shiftKey) return false;
  if (!binding.modifiers.includes("Alt") && event.altKey) return false;

  // Normalize the event key for comparison
  const eventKey = event.key.toLowerCase();
  const bindingKey = binding.key.toLowerCase();

  return eventKey === bindingKey;
}

/**
 * Converts a KeyBinding to an Electron menu accelerator string.
 * e.g. { modifiers: ["CmdOrCtrl", "Shift"], key: "s" } -> "CmdOrCtrl+Shift+S"
 */
export function toElectronAccelerator(binding: KeyBinding | null): string | undefined {
  if (!binding) return undefined;

  const parts: string[] = [...binding.modifiers];

  const keyMap: Record<string, string> = {
    Tab: "Tab",
    Escape: "Escape",
    Backspace: "Backspace",
    Delete: "Delete",
    Enter: "Return",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    "+": "Plus",
    "=": "=",
    "-": "-",
    "\\": "\\",
    ",": ",",
    ".": ".",
    "/": "/",
    "[": "[",
    "]": "]",
  };

  const key = keyMap[binding.key] ?? binding.key.toUpperCase();
  return [...parts, key].join("+");
}

/**
 * Converts a KeyBinding to a web menu accelerator string in "Ctrl+Shift+S" format.
 * Uses "Ctrl" (not "CmdOrCtrl") so that formatAccelerator() in menu-definitions can
 * apply the macOS symbol transformation (Ctrl+ -> Cmd).
 */
export function toWebMenuAccelerator(binding: KeyBinding | null): string | undefined {
  if (!binding) return undefined;
  const mods = binding.modifiers.map(m => m === "CmdOrCtrl" ? "Ctrl" : m);
  const key = binding.key === "+" ? "+" : binding.key.toUpperCase();
  return [...mods, key].join("+");
}

/**
 * Normalizes a binding to a canonical string for comparison.
 * Modifiers are sorted to ensure consistent comparison.
 */
function bindingToCanonical(mods: readonly string[], key: string): string {
  return [...mods].sort().join("+") + "_" + key.toLowerCase();
}

/**
 * Browser/OS reserved key combinations that should not be assigned as shortcuts.
 * These are combinations that browsers intercept before the page can handle them,
 * or that conflict with essential OS/browser navigation.
 */
const RESERVED_BINDINGS: ReadonlySet<string> = new Set(
  (
    [
      // Browser tab/window management (not reliably interceptable)
      { modifiers: ["CmdOrCtrl"], key: "l" },         // Address bar focus
      { modifiers: ["CmdOrCtrl"], key: "d" },         // Bookmark
      { modifiers: ["CmdOrCtrl"], key: "r" },         // Reload
      { modifiers: ["CmdOrCtrl", "Shift"], key: "r" }, // Hard reload
      { modifiers: ["CmdOrCtrl", "Shift"], key: "i" }, // DevTools
      { modifiers: ["CmdOrCtrl", "Shift"], key: "j" }, // DevTools console
      { modifiers: ["CmdOrCtrl"], key: "j" },         // Downloads (Chrome)
      { modifiers: ["CmdOrCtrl"], key: "h" },         // History
      { modifiers: ["CmdOrCtrl"], key: "g" },         // Find next (browser)
      { modifiers: ["CmdOrCtrl", "Shift"], key: "g" }, // Find previous (browser)
      { modifiers: ["CmdOrCtrl"], key: "u" },         // View source
      { modifiers: ["CmdOrCtrl"], key: "p" },         // Print
      { modifiers: ["CmdOrCtrl"], key: "q" },         // Quit browser (macOS)
      // F-keys reserved by browsers
      { modifiers: [], key: "F1" },                    // Help
      { modifiers: [], key: "F3" },                    // Find
      { modifiers: [], key: "F5" },                    // Reload
      { modifiers: [], key: "F7" },                    // Caret browsing
      { modifiers: [], key: "F11" },                   // Fullscreen
      { modifiers: [], key: "F12" },                   // DevTools
    ] satisfies Array<{ modifiers: string[]; key: string }>
  ).map(b => bindingToCanonical(b.modifiers, b.key)),
);

/**
 * Checks whether a binding conflicts with browser/OS reserved key combinations.
 * Returns true if the binding should be rejected.
 */
export function isReservedBinding(binding: KeyBinding): boolean {
  return RESERVED_BINDINGS.has(
    bindingToCanonical(binding.modifiers, binding.key),
  );
}

/**
 * Builds a KeyBinding from a keyboard event.
 * Used by the KeybindingInput recording component.
 */
export function buildBindingFromEvent(event: KeyboardEvent): KeyBinding | null {
  const modifierKeys = new Set(["Control", "Meta", "Shift", "Alt"]);
  if (modifierKeys.has(event.key)) return null;

  const isMac = isMacOS();
  const modifiers: KeyBinding["modifiers"] = [];

  if (isMac ? event.metaKey : event.ctrlKey) modifiers.push("CmdOrCtrl");
  if (!isMac && event.metaKey) {
    // Meta on non-Mac is unusual; treat as Ctrl
  }
  if (event.shiftKey) modifiers.push("Shift");
  if (event.altKey) modifiers.push("Alt");
  if (!isMac && event.ctrlKey && !modifiers.includes("CmdOrCtrl")) modifiers.push("Ctrl");

  return { modifiers, key: event.key };
}
