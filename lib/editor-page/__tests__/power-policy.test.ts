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
  it("follows the user setting when power-save mode is off", () => {
    expect(shouldEnablePosHighlight({ posHighlightEnabled: true, powerSaveMode: false })).toBe(
      true,
    );
    expect(shouldEnablePosHighlight({ posHighlightEnabled: false, powerSaveMode: false })).toBe(
      false,
    );
  });

  it("disables highlighting in power-save mode", () => {
    expect(shouldEnablePosHighlight({ posHighlightEnabled: true, powerSaveMode: true })).toBe(
      false,
    );
  });
});
