/**
 * Contract tests for the settings tab registry.
 *
 * We mock the leaf tab modules so that the registry can be loaded without
 * pulling in their dependencies (e.g. generated credits JSON, Milkdown
 * plugins). These tests only verify the shape of the registry.
 */

import { describe, it, expect } from "vitest";

import { buildSettingsTabRegistry } from "../tab-registry";

describe("buildSettingsTabRegistry — platform gating", () => {
  it("includes terminal and power on Electron", () => {
    const registry = buildSettingsTabRegistry({ isElectron: true });
    expect(registry.terminal).toBeDefined();
    expect(registry.power).toBeDefined();
  });

  it("omits terminal and power on Web", () => {
    const registry = buildSettingsTabRegistry({ isElectron: false });
    expect(registry.terminal).toBeUndefined();
    expect(registry.power).toBeUndefined();
  });
});

describe("buildSettingsTabRegistry — entry contract", () => {
  it("always provides an entry for every non-platform-gated category", () => {
    const registry = buildSettingsTabRegistry({ isElectron: false });
    const expected = [
      "account",
      "ai-connection",
      "typography",
      "scroll",
      "pos-highlight",
      "linting",
      "speech",
      "keymap",
      "dictionary",
      "about",
    ] as const;
    for (const key of expected) {
      const entry = registry[key];
      expect(entry, `missing registry entry for ${key}`).toBeDefined();
      expect(typeof entry?.component).toBe("function");
    }
  });

  it("marks pos-highlight as wide", () => {
    const registry = buildSettingsTabRegistry({ isElectron: true });
    expect(registry["pos-highlight"]?.wide).toBe(true);
  });

  it("does not mark other tabs as wide by default", () => {
    const registry = buildSettingsTabRegistry({ isElectron: true });
    expect(registry.typography?.wide).toBeFalsy();
    expect(registry.account?.wide).toBeFalsy();
    expect(registry.terminal?.wide).toBeFalsy();
  });
});
