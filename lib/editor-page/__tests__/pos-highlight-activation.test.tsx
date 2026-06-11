/**
 * Regression tests for the window-activity → POS-highlight wiring
 * (#1466, guarding against a #1445 recurrence).
 *
 * The hook derives an EFFECTIVE enabled flag (`shouldEnablePosHighlight`)
 * and applies it via `updatePosHighlightSettings` — a meta-only transaction
 * that toggles decorations and never touches the document. These tests
 * drive the REAL hook (createRoot + act, repo pattern) with the plugin
 * module mocked, and verify:
 *
 * 1. the effective enabled is FALSE while blurred even when the user
 *    setting is true, and returns to the user setting on focus,
 * 2. the user's setting object is never mutated by a focus round-trip,
 * 3. a user setting of false stays false in the foreground (no surprise
 *    enabling on focus),
 * 4. only the settings-update entry point is called — nothing that could
 *    reload content or move the cursor.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Mocks (must precede importing the module under test)
// ---------------------------------------------------------------------------

const updatePosHighlightSettings = vi.fn();
vi.mock("@/packages/milkdown-plugin-japanese-novel/pos-highlight", () => ({
  updatePosHighlightSettings: (...args: unknown[]) => updatePosHighlightSettings(...args),
}));

import { usePosHighlightActivation } from "../use-pos-highlight-activation";
import type { UsePosHighlightActivationParams } from "../use-pos-highlight-activation";
import type { EditorView } from "@milkdown/prose/view";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const fakeView = {} as EditorView;

function makeParams(
  overrides: Partial<UsePosHighlightActivationParams> = {},
): UsePosHighlightActivationParams {
  return {
    view: fakeView,
    posHighlightEnabled: true,
    powerSaveMode: false,
    posHighlightColors: { 名詞: "#ff0000" },
    posHighlightDisabledTypes: ["助詞"],
    ...overrides,
  };
}

function HookHost({ params }: { params: UsePosHighlightActivationParams }): null {
  usePosHighlightActivation(params);
  return null;
}

let root: Root;
let container: HTMLDivElement;

async function mountHook(params: UsePosHighlightActivationParams): Promise<void> {
  await act(async () => {
    root.render(<HookHost params={params} />);
  });
  // Let the hook's dynamic import of the plugin module resolve
  await act(async () => {
    await Promise.resolve();
  });
}

async function dispatchActivity(type: "blur" | "focus"): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new Event(type));
  });
  await act(async () => {
    await Promise.resolve();
  });
}

/** The `enabled` flag of the most recent settings application. */
function lastAppliedEnabled(): boolean {
  const calls = updatePosHighlightSettings.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const [, settings] = calls[calls.length - 1] as [EditorView, { enabled: boolean }];
  return settings.enabled;
}

beforeEach(() => {
  // jsdom's document.hasFocus() is unreliable in headless runs; pin the
  // initial activity state to "focused", as in the real app.
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  updatePosHighlightSettings.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("#1466 — effective POS highlight follows window activity", () => {
  it("is false while blurred even when the user setting is true, and returns on focus", async () => {
    const params = makeParams({ posHighlightEnabled: true });
    await mountHook(params);

    // Foreground: the user's setting applies
    expect(lastAppliedEnabled()).toBe(true);

    // Blur: highlighting is suspended (effective value only)
    await dispatchActivity("blur");
    expect(lastAppliedEnabled()).toBe(false);

    // Focus: restored to exactly the user's setting — which was never mutated
    await dispatchActivity("focus");
    expect(lastAppliedEnabled()).toBe(true);
    expect(params.posHighlightEnabled).toBe(true);
  });

  it("stays false on focus when the user setting is false (no surprise enabling)", async () => {
    await mountHook(makeParams({ posHighlightEnabled: false }));
    expect(lastAppliedEnabled()).toBe(false);

    await dispatchActivity("blur");
    await dispatchActivity("focus");
    expect(lastAppliedEnabled()).toBe(false);
  });

  it("stays false in power-save mode even in the foreground", async () => {
    await mountHook(makeParams({ powerSaveMode: true }));
    expect(lastAppliedEnabled()).toBe(false);

    await dispatchActivity("blur");
    await dispatchActivity("focus");
    expect(lastAppliedEnabled()).toBe(false);
  });

  it("passes colors/disabledTypes through and applies to the given view only", async () => {
    await mountHook(makeParams());
    const [view, settings] = updatePosHighlightSettings.mock.calls[0] as [
      EditorView,
      { enabled: boolean; colors: Record<string, string>; disabledTypes: string[] },
    ];
    // Only the decoration-settings entry point is used; the call targets the
    // editor view and contains nothing that could replace content.
    expect(view).toBe(fakeView);
    expect(settings.colors).toEqual({ 名詞: "#ff0000" });
    expect(settings.disabledTypes).toEqual(["助詞"]);
  });

  it("does nothing while the view is not ready", async () => {
    await mountHook(makeParams({ view: null }));
    expect(updatePosHighlightSettings).not.toHaveBeenCalled();
  });
});
