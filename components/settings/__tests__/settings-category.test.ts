/**
 * Contract tests for the settings category resolver.
 */

import { describe, it, expect } from "vitest";

import { resolveLegacyCategory } from "../settings-category";
import type { SettingsCategory } from "../settings-category";

describe("resolveLegacyCategory", () => {
  it("defaults to typography when undefined", () => {
    expect(resolveLegacyCategory(undefined)).toBe("typography");
  });

  it("passes current names through unchanged", () => {
    const current: SettingsCategory[] = [
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
    ];
    for (const c of current) {
      expect(resolveLegacyCategory(c)).toBe(c);
    }
  });

  it("keeps terminal/power on Electron", () => {
    expect(resolveLegacyCategory("terminal", { isElectron: true })).toBe("terminal");
    expect(resolveLegacyCategory("power", { isElectron: true })).toBe("power");
  });

  it("falls back to account when Electron-only tab requested on Web", () => {
    expect(resolveLegacyCategory("terminal", { isElectron: false })).toBe("account");
    expect(resolveLegacyCategory("power", { isElectron: false })).toBe("account");
  });

  it("does not affect non-electron-only tabs on Web", () => {
    expect(resolveLegacyCategory("linting", { isElectron: false })).toBe("linting");
  });
});
