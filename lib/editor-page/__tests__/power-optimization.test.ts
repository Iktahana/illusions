import { describe, expect, it } from "vitest";

import {
  getAutoSaveIntervalMs,
  isBackgroundWindow,
  shouldEnablePosHighlight,
  shouldPauseFileWatchers,
  shouldRunReadabilityMorphology,
  shouldSuspendNonCriticalProcessing,
  THROTTLED_AUTO_SAVE_INTERVAL_MS,
  type RuntimeActivityState,
} from "../power-optimization";

function makeState(overrides?: Partial<RuntimeActivityState>): RuntimeActivityState {
  return {
    powerSaveMode: false,
    isDocumentVisible: true,
    isWindowFocused: true,
    ...overrides,
  };
}

describe("power optimization policy", () => {
  it("treats hidden windows as backgrounded", () => {
    expect(isBackgroundWindow(makeState({ isDocumentVisible: false }))).toBe(true);
  });

  it("treats unfocused windows as backgrounded", () => {
    expect(isBackgroundWindow(makeState({ isWindowFocused: false }))).toBe(true);
  });

  it("suspends non-critical processing in power-save mode", () => {
    expect(shouldSuspendNonCriticalProcessing(makeState({ powerSaveMode: true }))).toBe(true);
  });

  it("keeps non-critical processing active for focused visible windows on AC-like state", () => {
    expect(shouldSuspendNonCriticalProcessing(makeState())).toBe(false);
  });

  it("disables readability morphology while backgrounded", () => {
    expect(shouldRunReadabilityMorphology(makeState({ isWindowFocused: false }))).toBe(false);
  });

  it("disables POS highlighting when power saving is active", () => {
    expect(shouldEnablePosHighlight(true, makeState({ powerSaveMode: true }))).toBe(false);
  });

  it("preserves a user's POS highlight opt-out", () => {
    expect(shouldEnablePosHighlight(false, makeState())).toBe(false);
  });

  it("pauses file watchers only for backgrounded windows", () => {
    expect(shouldPauseFileWatchers(makeState())).toBe(false);
    expect(shouldPauseFileWatchers(makeState({ isDocumentVisible: false }))).toBe(true);
  });

  it("keeps the normal auto-save interval while fully active", () => {
    expect(getAutoSaveIntervalMs(makeState(), 5_000)).toBe(5_000);
  });

  it("throttles auto-save while backgrounded", () => {
    expect(getAutoSaveIntervalMs(makeState({ isWindowFocused: false }), 5_000)).toBe(
      THROTTLED_AUTO_SAVE_INTERVAL_MS,
    );
  });

  it("never shortens a caller-provided auto-save interval", () => {
    expect(getAutoSaveIntervalMs(makeState({ powerSaveMode: true }), 30_000)).toBe(30_000);
  });
});
