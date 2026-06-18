/**
 * Tests for the pure power optimization policy (#1448).
 *
 * The policy maps window-activity signals + settings to decisions and has
 * no side effects, so these tests are plain input → output checks.
 */

import { describe, it, expect } from "vitest";
import { AUTO_SAVE_INTERVAL } from "../../tab-manager/types";
import {
  shouldPauseFileWatchers,
  getAutoSaveIntervalMs,
  shouldEnablePosHighlight,
  BACKGROUND_AUTO_SAVE_INTERVAL_MS,
} from "../power-policy";
import type { WindowActivityState } from "../window-activity";

const foreground: WindowActivityState = { isWindowFocused: true, isDocumentVisible: true };
const blurred: WindowActivityState = { isWindowFocused: false, isDocumentVisible: true };
const hidden: WindowActivityState = { isWindowFocused: true, isDocumentVisible: false };
const background: WindowActivityState = { isWindowFocused: false, isDocumentVisible: false };

describe("shouldPauseFileWatchers", () => {
  it("does not pause while the window is focused and visible", () => {
    expect(shouldPauseFileWatchers(foreground)).toBe(false);
  });

  it("pauses when the window loses focus", () => {
    expect(shouldPauseFileWatchers(blurred)).toBe(true);
  });

  it("pauses when the document becomes hidden", () => {
    expect(shouldPauseFileWatchers(hidden)).toBe(true);
    expect(shouldPauseFileWatchers(background)).toBe(true);
  });
});

describe("getAutoSaveIntervalMs", () => {
  it("uses the normal interval in the foreground regardless of power-save mode", () => {
    expect(getAutoSaveIntervalMs(foreground, { powerSaveMode: false })).toBe(AUTO_SAVE_INTERVAL);
    expect(getAutoSaveIntervalMs(foreground, { powerSaveMode: true })).toBe(AUTO_SAVE_INTERVAL);
  });

  it("throttles only when backgrounded AND power-save mode is enabled", () => {
    expect(getAutoSaveIntervalMs(background, { powerSaveMode: true })).toBe(
      BACKGROUND_AUTO_SAVE_INTERVAL_MS,
    );
    expect(getAutoSaveIntervalMs(blurred, { powerSaveMode: true })).toBe(
      BACKGROUND_AUTO_SAVE_INTERVAL_MS,
    );
    expect(getAutoSaveIntervalMs(background, { powerSaveMode: false })).toBe(AUTO_SAVE_INTERVAL);
  });
});

describe("shouldEnablePosHighlight", () => {
  it("follows the user setting in the foreground when power-save mode is off", () => {
    expect(
      shouldEnablePosHighlight(foreground, { posHighlightEnabled: true, powerSaveMode: false }),
    ).toBe(true);
    expect(
      shouldEnablePosHighlight(foreground, { posHighlightEnabled: false, powerSaveMode: false }),
    ).toBe(false);
  });

  it("keeps highlighting in power-save mode while in the foreground (power-save no longer gates POS)", () => {
    // The morphology already runs for the vocabulary panel; gating POS off in
    // power-save only produced a toggle that read ON while nothing was colored.
    expect(
      shouldEnablePosHighlight(foreground, { posHighlightEnabled: true, powerSaveMode: true }),
    ).toBe(true);
    // The user's own toggle is still respected.
    expect(
      shouldEnablePosHighlight(foreground, { posHighlightEnabled: false, powerSaveMode: true }),
    ).toBe(false);
  });

  it("still suspends highlighting while backgrounded even in power-save mode", () => {
    expect(
      shouldEnablePosHighlight(background, { posHighlightEnabled: true, powerSaveMode: true }),
    ).toBe(false);
  });

  it("disables highlighting while backgrounded even when the user setting is true (#1466)", () => {
    expect(
      shouldEnablePosHighlight(blurred, { posHighlightEnabled: true, powerSaveMode: false }),
    ).toBe(false);
    expect(
      shouldEnablePosHighlight(hidden, { posHighlightEnabled: true, powerSaveMode: false }),
    ).toBe(false);
    expect(
      shouldEnablePosHighlight(background, { posHighlightEnabled: true, powerSaveMode: false }),
    ).toBe(false);
  });

  it("restores exactly the user's setting on focus (no mutation of the setting)", () => {
    const settings = { posHighlightEnabled: true, powerSaveMode: false };
    expect(shouldEnablePosHighlight(blurred, settings)).toBe(false);
    // The settings object is untouched; the foreground decision returns to it.
    expect(settings.posHighlightEnabled).toBe(true);
    expect(shouldEnablePosHighlight(foreground, settings)).toBe(true);
  });
});
