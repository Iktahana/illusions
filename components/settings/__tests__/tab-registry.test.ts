/**
 * Contract tests for the settings tab registry.
 *
 * We mock the leaf tab modules so that the registry can be loaded without
 * pulling in their dependencies (e.g. generated credits JSON, Milkdown
 * plugins). These tests only verify the shape of the registry.
 */

import { describe, it, expect, vi } from "vitest";

function MockSettingsTab(): null {
  return null;
}

vi.mock("../AboutSection", () => ({ default: MockSettingsTab }));
vi.mock("../AccountSettingsTab", () => ({ default: MockSettingsTab }));
vi.mock("../AiApiSettingsTab", () => ({ default: MockSettingsTab }));
vi.mock("../DictSettingsTab", () => ({ default: MockSettingsTab }));
vi.mock("../KeymapSettingsTab", () => ({ default: MockSettingsTab }));
vi.mock("../LintingSettingsTab", () => ({ default: MockSettingsTab }));
vi.mock("../PosHighlightSettingsTab", () => ({ default: MockSettingsTab }));
vi.mock("../PowerSettingsTab", () => ({ default: MockSettingsTab }));
vi.mock("../PrivacySettingsTab", () => ({ default: MockSettingsTab }));
vi.mock("../SpeechSettingsTab", () => ({ default: MockSettingsTab }));
vi.mock("../TerminalSettingsTab", () => ({ default: MockSettingsTab }));
vi.mock("../TypographySettingsTab", () => ({ default: MockSettingsTab }));
vi.mock("../VerticalSettingsTab", () => ({ default: MockSettingsTab }));

import { buildSettingsTabRegistry } from "../tab-registry";

describe("buildSettingsTabRegistry — platform gating", () => {
  it("includes Electron-only tabs on Electron", () => {
    const registry = buildSettingsTabRegistry({ isElectron: true });
    expect(registry.terminal).toBeDefined();
    expect(registry.power).toBeDefined();
    expect(registry.privacy).toBeDefined();
  });

  it("omits Electron-only tabs on Web", () => {
    const registry = buildSettingsTabRegistry({ isElectron: false });
    expect(registry.terminal).toBeUndefined();
    expect(registry.power).toBeUndefined();
    expect(registry.privacy).toBeUndefined();
  });
});

describe("buildSettingsTabRegistry — entry contract", () => {
  it("global scope excludes document and project scoped tabs", () => {
    const registry = buildSettingsTabRegistry({ isElectron: true, scope: "global" });
    expect(Object.keys(registry).sort()).toEqual(
      [
        "account",
        "ai-connection",
        "typography",
        "scroll",
        "dictionary",
        "keymap",
        "speech",
        "terminal",
        "power",
        "privacy",
        "about",
      ].sort(),
    );
  });

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
