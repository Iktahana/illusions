import type { KeyBinding } from "./keymap-types";
import { isMacOS, isElectronRenderer } from "@/lib/utils/runtime-env";

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
  const mods = binding.modifiers.map((m) => (m === "CmdOrCtrl" ? "Ctrl" : m));
  const key = binding.key === "+" ? "+" : binding.key.toUpperCase();
  return [...mods, key].join("+");
}

/**
 * Compares two KeyBindings for equality (normalized modifiers + lowercase key).
 */
export function bindingsMatch(a: KeyBinding | null, b: KeyBinding | null): boolean {
  if (!a || !b) return false;
  if (a.key.toLowerCase() !== b.key.toLowerCase()) return false;
  const aMods = [...a.modifiers].sort();
  const bMods = [...b.modifiers].sort();
  if (aMods.length !== bMods.length) return false;
  return aMods.every((m, i) => m === bMods[i]);
}

/**
 * Browser/OS reserved key combinations that should not be overridden.
 */
const RESERVED_BINDINGS: Array<{ modifiers: KeyBinding["modifiers"]; key: string }> = [
  { modifiers: ["CmdOrCtrl"], key: "r" },
  { modifiers: ["CmdOrCtrl", "Shift"], key: "r" },
  { modifiers: ["CmdOrCtrl"], key: "l" },
  { modifiers: ["CmdOrCtrl"], key: "d" },
  { modifiers: ["CmdOrCtrl"], key: "q" },
  { modifiers: ["CmdOrCtrl", "Shift"], key: "i" },
  { modifiers: ["CmdOrCtrl", "Shift"], key: "j" },
  { modifiers: [], key: "F5" },
  { modifiers: [], key: "F11" },
  { modifiers: [], key: "F12" },
  { modifiers: ["CmdOrCtrl"], key: "g" },
  { modifiers: ["CmdOrCtrl"], key: "f" },
];

/**
 * Returns true if the binding conflicts with a browser/OS reserved shortcut.
 */
export function isReservedBinding(binding: KeyBinding): boolean {
  return RESERVED_BINDINGS.some((reserved) =>
    bindingsMatch(binding, { modifiers: reserved.modifiers, key: reserved.key }),
  );
}

/**
 * Returns true if the given scope is active in the current environment.
 */
export function isScopeActive(scope: "all" | "electron-only" | "web-only" | undefined): boolean {
  if (!scope || scope === "all") return true;
  const isElectron = isElectronRenderer();
  if (scope === "electron-only") return isElectron;
  if (scope === "web-only") return !isElectron;
  return true;
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
