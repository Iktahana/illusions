/**
 * Tests for the window activity signal source (#1448).
 *
 * Verifies:
 * - lazy DOM-listener attach on first subscribe / detach on last unsubscribe
 *   (no listener leaks),
 * - focus / blur / visibilitychange events update the state and notify,
 * - no duplicate notifications when the state did not change,
 * - idempotent unsubscribe,
 * - snapshot reads the live DOM when nobody is subscribed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getWindowActivitySnapshot, subscribeWindowActivity } from "../window-activity";
import type { WindowActivityState } from "../window-activity";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const activeUnsubscribers: Array<() => void> = [];

function subscribe(listener: (state: WindowActivityState) => void): () => void {
  const unsubscribe = subscribeWindowActivity(listener);
  activeUnsubscribers.push(unsubscribe);
  return unsubscribe;
}

function setVisibilityState(value: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => value,
  });
}

beforeEach(() => {
  // jsdom's document.hasFocus() is unreliable (returns false in headless
  // runs); pin the initial attach state to "focused" for determinism.
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});

afterEach(() => {
  // Always detach so module-level singleton state never leaks across tests
  for (const unsubscribe of activeUnsubscribers) unsubscribe();
  activeUnsubscribers.length = 0;
  setVisibilityState("visible");
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("window-activity: subscribe/unsubscribe lifecycle", () => {
  it("attaches DOM listeners on first subscribe and detaches on last unsubscribe (no leak)", () => {
    const windowAdd = vi.spyOn(window, "addEventListener");
    const windowRemove = vi.spyOn(window, "removeEventListener");
    const documentAdd = vi.spyOn(document, "addEventListener");
    const documentRemove = vi.spyOn(document, "removeEventListener");

    const unsubscribeA = subscribe(vi.fn());
    const unsubscribeB = subscribe(vi.fn());

    // Listeners attached exactly once (focus + blur on window, visibilitychange on document)
    expect(windowAdd.mock.calls.filter(([type]) => String(type) === "focus")).toHaveLength(1);
    expect(windowAdd.mock.calls.filter(([type]) => String(type) === "blur")).toHaveLength(1);
    expect(
      documentAdd.mock.calls.filter(([type]) => String(type) === "visibilitychange"),
    ).toHaveLength(1);

    unsubscribeA();
    // Still one subscriber left — nothing removed yet
    expect(windowRemove.mock.calls.filter(([type]) => String(type) === "blur")).toHaveLength(0);

    unsubscribeB();
    // Last subscriber gone — everything removed
    expect(windowRemove.mock.calls.filter(([type]) => String(type) === "focus")).toHaveLength(1);
    expect(windowRemove.mock.calls.filter(([type]) => String(type) === "blur")).toHaveLength(1);
    expect(
      documentRemove.mock.calls.filter(([type]) => String(type) === "visibilitychange"),
    ).toHaveLength(1);
  });

  it("unsubscribe is idempotent and does not detach other subscribers", () => {
    const listenerB = vi.fn();
    const unsubscribeA = subscribe(vi.fn());
    subscribe(listenerB);

    unsubscribeA();
    unsubscribeA(); // second call must be a no-op

    // listenerB still receives notifications
    window.dispatchEvent(new Event("blur"));
    expect(listenerB).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenLastCalledWith(expect.objectContaining({ isWindowFocused: false }));
    window.dispatchEvent(new Event("focus"));
  });
});

describe("window-activity: signal updates", () => {
  it("notifies on blur and focus with the updated state", () => {
    const listener = vi.fn();
    subscribe(listener);

    window.dispatchEvent(new Event("blur"));
    expect(listener).toHaveBeenLastCalledWith({
      isWindowFocused: false,
      isDocumentVisible: true,
    });

    window.dispatchEvent(new Event("focus"));
    expect(listener).toHaveBeenLastCalledWith({
      isWindowFocused: true,
      isDocumentVisible: true,
    });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("notifies on visibilitychange", () => {
    const listener = vi.fn();
    subscribe(listener);

    setVisibilityState("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(listener).toHaveBeenLastCalledWith({
      isWindowFocused: true,
      isDocumentVisible: false,
    });

    setVisibilityState("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(listener).toHaveBeenLastCalledWith({
      isWindowFocused: true,
      isDocumentVisible: true,
    });
  });

  it("does NOT notify when the state did not change (duplicate events)", () => {
    const listener = vi.fn();
    subscribe(listener);

    // Window is already focused in jsdom — a redundant focus event is a no-op
    window.dispatchEvent(new Event("focus"));
    expect(listener).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("blur"));
    expect(listener).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("focus"));
  });
});

describe("window-activity: snapshot", () => {
  it("reads the live DOM when no subscribers are attached", () => {
    setVisibilityState("hidden");
    expect(getWindowActivitySnapshot().isDocumentVisible).toBe(false);
    setVisibilityState("visible");
    expect(getWindowActivitySnapshot().isDocumentVisible).toBe(true);
  });

  it("reflects event-driven state while subscribed", () => {
    subscribe(vi.fn());
    window.dispatchEvent(new Event("blur"));
    expect(getWindowActivitySnapshot().isWindowFocused).toBe(false);
    window.dispatchEvent(new Event("focus"));
    expect(getWindowActivitySnapshot().isWindowFocused).toBe(true);
  });
});
