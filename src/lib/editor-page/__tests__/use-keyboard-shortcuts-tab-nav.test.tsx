/**
 * Regression tests for #1878 — "タブを切り替えるたびに Undo/Redo 履歴が失われる".
 *
 * Root cause: every tab-navigation command (⌘1..9 / 次タブ / 前タブ / 新規タブ)
 * called incrementEditorKey(), which bumps the editor remount key shared by every
 * editor panel. Bumping the key forces React to unmount + remount the
 * Milkdown/ProseMirror editor, discarding the history plugin state — so after a
 * single tab round-trip, ⌘Z could no longer undo.
 *
 * The fix removes incrementEditorKey() from all tab-navigation handlers. Tab
 * navigation must change only the active tab; it must never remount the editor.
 *
 * These tests dispatch real keydown events through useKeymapListener (the same
 * path the running app uses) and assert that:
 *   - the navigation action IS invoked, and
 *   - incrementEditorKey() is NEVER invoked by tab navigation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// KeymapProvider loads overrides from Dexie/IndexedDB on mount, which is
// unavailable in jsdom. Stub the storage so the provider resolves to defaults
// (no user overrides) without touching IndexedDB.
vi.mock("@/lib/keymap/keymap-storage", () => ({
  loadKeymapOverrides: () => Promise.resolve({}),
  saveKeymapOverrides: () => Promise.resolve(),
}));

import { KeymapProvider } from "@/contexts/KeymapContext";
import { isMacOS } from "@/lib/utils/runtime-env";
import { useKeyboardShortcuts } from "../use-keyboard-shortcuts";
import type { TabState } from "@/lib/tab-manager/tab-types";

// ---------------------------------------------------------------------------
// Spies shared across a single test
// ---------------------------------------------------------------------------

interface Spies {
  incrementEditorKey: ReturnType<typeof vi.fn<() => void>>;
  nextTab: ReturnType<typeof vi.fn<() => void>>;
  prevTab: ReturnType<typeof vi.fn<() => void>>;
  newTab: ReturnType<typeof vi.fn<() => void>>;
  switchToIndex: ReturnType<typeof vi.fn<(index: number) => void>>;
  openSearchFromShortcut: ReturnType<typeof vi.fn<() => void>>;
}

function makeSpies(): Spies {
  return {
    incrementEditorKey: vi.fn<() => void>(),
    nextTab: vi.fn<() => void>(),
    prevTab: vi.fn<() => void>(),
    newTab: vi.fn<() => void>(),
    switchToIndex: vi.fn<(index: number) => void>(),
    openSearchFromShortcut: vi.fn<() => void>(),
  };
}

const editorTab: TabState = {
  id: "tab-1",
  tabKind: "editor",
  fileType: ".mdi",
  file: null,
  content: "",
  lastSavedContent: "",
  isDirty: false,
  isPreview: false,
  pendingExternalContent: null,
} as unknown as TabState;

function HookHost({ spies, isElectron }: { spies: Spies; isElectron: boolean }): null {
  useKeyboardShortcuts({
    isElectron,
    saveFile: async () => {},
    handlePasteAsPlaintext: async () => {},
    handleToggleCompactMode: () => {},
    handleToggleWritingMode: () => {},
    handleOpenRubyDialog: () => {},
    handleToggleTcy: () => {},
    setShowSettingsModal: () => {},
    setSearchOpenTrigger: () => {},
    openSearchFromShortcut: spies.openSearchFromShortcut,
    incrementEditorKey: spies.incrementEditorKey,
    nextTab: spies.nextTab,
    prevTab: spies.prevTab,
    newTab: spies.newTab,
    closeTab: () => {},
    switchToIndex: spies.switchToIndex,
    tabs: [editorTab],
    activeTabId: "tab-1",
    isEditorTabActive: true,
  });
  return null;
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(spies: Spies, isElectron = false): void {
  act(() => {
    root.render(
      <KeymapProvider>
        <HookHost spies={spies} isElectron={isElectron} />
      </KeymapProvider>,
    );
  });
}

/** Builds a keydown event with the platform-correct CmdOrCtrl modifier. */
function dispatchCmdOrCtrl(key: string, extra: Partial<KeyboardEventInit> = {}): void {
  const mac = isMacOS();
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        metaKey: mac,
        ctrlKey: !mac,
        bubbles: true,
        cancelable: true,
        ...extra,
      }),
    );
  });
}

/** Builds a Ctrl-modified keydown event (used by next/prev tab bindings). */
function dispatchCtrl(key: string, extra: Partial<KeyboardEventInit> = {}): void {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
        ...extra,
      }),
    );
  });
}

describe("useKeyboardShortcuts — tab navigation must not remount the editor (#1878)", () => {
  it("opens search through the selection-aware callback for CmdOrCtrl+F (#2218)", () => {
    const spies = makeSpies();
    mount(spies);

    dispatchCmdOrCtrl("f");

    expect(spies.openSearchFromShortcut).toHaveBeenCalledTimes(1);
  });

  it("⌘1 switches to index 0 without bumping the editor key", () => {
    const spies = makeSpies();
    mount(spies);

    dispatchCmdOrCtrl("1");

    expect(spies.switchToIndex).toHaveBeenCalledWith(0);
    expect(spies.incrementEditorKey).not.toHaveBeenCalled();
  });

  it("⌘2 switches to index 1 without bumping the editor key", () => {
    const spies = makeSpies();
    mount(spies);

    dispatchCmdOrCtrl("2");

    expect(spies.switchToIndex).toHaveBeenCalledWith(1);
    expect(spies.incrementEditorKey).not.toHaveBeenCalled();
  });

  it("⌘9 switches to index 8 without bumping the editor key", () => {
    const spies = makeSpies();
    mount(spies);

    dispatchCmdOrCtrl("9");

    expect(spies.switchToIndex).toHaveBeenCalledWith(8);
    expect(spies.incrementEditorKey).not.toHaveBeenCalled();
  });

  it("Ctrl+Tab (next tab) does not bump the editor key", () => {
    const spies = makeSpies();
    mount(spies);

    dispatchCtrl("Tab");

    expect(spies.nextTab).toHaveBeenCalledTimes(1);
    expect(spies.incrementEditorKey).not.toHaveBeenCalled();
  });

  it("Ctrl+Shift+Tab (prev tab) does not bump the editor key", () => {
    const spies = makeSpies();
    mount(spies);

    dispatchCtrl("Tab", { shiftKey: true });

    expect(spies.prevTab).toHaveBeenCalledTimes(1);
    expect(spies.incrementEditorKey).not.toHaveBeenCalled();
  });

  it("⌘T (web new tab) does not bump the editor key of existing tabs", () => {
    const spies = makeSpies();
    mount(spies, /* isElectron */ false);

    dispatchCmdOrCtrl("t");

    expect(spies.newTab).toHaveBeenCalledTimes(1);
    expect(spies.incrementEditorKey).not.toHaveBeenCalled();
  });

  it("does not bump the editor key across a multi-tab round trip (1 → 2 → 1)", () => {
    const spies = makeSpies();
    mount(spies);

    dispatchCmdOrCtrl("1");
    dispatchCmdOrCtrl("2");
    dispatchCmdOrCtrl("1");

    expect(spies.switchToIndex).toHaveBeenNthCalledWith(1, 0);
    expect(spies.switchToIndex).toHaveBeenNthCalledWith(2, 1);
    expect(spies.switchToIndex).toHaveBeenNthCalledWith(3, 0);
    // The whole point of #1878: no remount happens during navigation, so the
    // editor instance (and its undo/redo history) survives the round trip.
    expect(spies.incrementEditorKey).not.toHaveBeenCalled();
  });
});
