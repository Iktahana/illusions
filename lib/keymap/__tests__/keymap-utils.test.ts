/**
 * Tests for keymap utility functions.
 *
 * Covers:
 *   - isReservedBinding: browser/OS reserved key detection
 *   - matchesEvent: binding-to-event matching
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import type { KeyBinding } from "@/lib/keymap/keymap-types";
import { isReservedBinding, matchesEvent } from "@/lib/keymap/keymap-utils";

// Mock isMacOS for deterministic tests
vi.mock("@/lib/utils/runtime-env", () => ({
  isMacOS: () => false,
  isBrowser: () => true,
  isElectronRenderer: () => false,
  detectOSPlatform: () => "linux",
  getRuntimeEnvironment: () => "browser",
}));

// ---------------------------------------------------------------------------
// isReservedBinding
// ---------------------------------------------------------------------------

describe("isReservedBinding", () => {
  it("rejects Ctrl+R (browser reload)", () => {
    const binding: KeyBinding = { modifiers: ["CmdOrCtrl"], key: "r" };
    expect(isReservedBinding(binding)).toBe(true);
  });

  it("rejects Ctrl+Shift+R (hard reload)", () => {
    const binding: KeyBinding = { modifiers: ["CmdOrCtrl", "Shift"], key: "r" };
    expect(isReservedBinding(binding)).toBe(true);
  });

  it("rejects Ctrl+L (address bar)", () => {
    const binding: KeyBinding = { modifiers: ["CmdOrCtrl"], key: "l" };
    expect(isReservedBinding(binding)).toBe(true);
  });

  it("rejects Ctrl+D (bookmark)", () => {
    const binding: KeyBinding = { modifiers: ["CmdOrCtrl"], key: "d" };
    expect(isReservedBinding(binding)).toBe(true);
  });

  it("rejects Ctrl+Shift+I (DevTools)", () => {
    const binding: KeyBinding = { modifiers: ["CmdOrCtrl", "Shift"], key: "i" };
    expect(isReservedBinding(binding)).toBe(true);
  });

  it("rejects Ctrl+P (print)", () => {
    const binding: KeyBinding = { modifiers: ["CmdOrCtrl"], key: "p" };
    expect(isReservedBinding(binding)).toBe(true);
  });

  it("rejects F5 (reload)", () => {
    const binding: KeyBinding = { modifiers: [], key: "F5" };
    expect(isReservedBinding(binding)).toBe(true);
  });

  it("rejects F12 (DevTools)", () => {
    const binding: KeyBinding = { modifiers: [], key: "F12" };
    expect(isReservedBinding(binding)).toBe(true);
  });

  it("rejects F11 (fullscreen)", () => {
    const binding: KeyBinding = { modifiers: [], key: "F11" };
    expect(isReservedBinding(binding)).toBe(true);
  });

  it("allows Ctrl+S (not reserved)", () => {
    const binding: KeyBinding = { modifiers: ["CmdOrCtrl"], key: "s" };
    expect(isReservedBinding(binding)).toBe(false);
  });

  it("allows Ctrl+Shift+V (not reserved)", () => {
    const binding: KeyBinding = { modifiers: ["CmdOrCtrl", "Shift"], key: "v" };
    expect(isReservedBinding(binding)).toBe(false);
  });

  it("allows Ctrl+F (not reserved)", () => {
    const binding: KeyBinding = { modifiers: ["CmdOrCtrl"], key: "f" };
    expect(isReservedBinding(binding)).toBe(false);
  });

  it("allows plain F2 (not reserved)", () => {
    const binding: KeyBinding = { modifiers: [], key: "F2" };
    expect(isReservedBinding(binding)).toBe(false);
  });

  it("is case-insensitive for key comparison", () => {
    const binding: KeyBinding = { modifiers: ["CmdOrCtrl"], key: "R" };
    expect(isReservedBinding(binding)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// matchesEvent (basic smoke tests)
// ---------------------------------------------------------------------------

describe("matchesEvent", () => {
  function makeKeyboardEvent(opts: {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  }): KeyboardEvent {
    return new KeyboardEvent("keydown", {
      key: opts.key,
      ctrlKey: opts.ctrlKey ?? false,
      metaKey: opts.metaKey ?? false,
      shiftKey: opts.shiftKey ?? false,
      altKey: opts.altKey ?? false,
    });
  }

  it("matches CmdOrCtrl+S with Ctrl+S on non-Mac", () => {
    const binding: KeyBinding = { modifiers: ["CmdOrCtrl"], key: "s" };
    const event = makeKeyboardEvent({ key: "s", ctrlKey: true });
    expect(matchesEvent(binding, event)).toBe(true);
  });

  it("does not match when extra modifier is pressed", () => {
    const binding: KeyBinding = { modifiers: ["CmdOrCtrl"], key: "s" };
    const event = makeKeyboardEvent({ key: "s", ctrlKey: true, shiftKey: true });
    expect(matchesEvent(binding, event)).toBe(false);
  });

  it("returns false for null binding", () => {
    const event = makeKeyboardEvent({ key: "s", ctrlKey: true });
    expect(matchesEvent(null, event)).toBe(false);
  });
});
