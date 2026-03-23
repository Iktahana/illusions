import type { KeyBinding } from "./keymap-types";

/**
 * Detects if the current platform is macOS.
 */
function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  if (nav.userAgentData?.platform) {
    return nav.userAgentData.platform === "macOS";
  }
  return /mac/i.test(navigator.userAgent);
}

/**
 * Returns the platform-specific display string for a key binding.
 * e.g. { modifiers: ["CmdOrCtrl", "Shift"], key: "s" } → "⌘⇧S" (macOS) / "Ctrl+Shift+S" (Win/Linux)
 */
export function formatBinding(binding: KeyBinding | null): string {
  if (!binding) return "未設定";

  const isMac = isMacPlatform();
  const parts: string[] = [];

  for (const mod of binding.modifiers) {
    if (mod === "CmdOrCtrl") {
      parts.push(isMac ? "⌘" : "Ctrl");
    } else if (mod === "Shift") {
      parts.push(isMac ? "⇧" : "Shift");
    } else if (mod === "Alt") {
      parts.push(isMac ? "⌥" : "Alt");
    } else if (mod === "Ctrl") {
      parts.push(isMac ? "⌃" : "Ctrl");
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
    Backspace: isMac ? "⌫" : "Backspace",
    Delete: isMac ? "⌦" : "Delete",
    Enter: isMac ? "↩" : "Enter",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
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

  const isMac = isMacPlatform();

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
 * e.g. { modifiers: ["CmdOrCtrl", "Shift"], key: "s" } → "CmdOrCtrl+Shift+S"
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
 * Builds a KeyBinding from a keyboard event.
 * Used by the KeybindingInput recording component.
 */
export function buildBindingFromEvent(event: KeyboardEvent): KeyBinding | null {
  const modifierKeys = new Set(["Control", "Meta", "Shift", "Alt"]);
  if (modifierKeys.has(event.key)) return null;

  const isMac = isMacPlatform();
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
