import { describe, it, expect } from "vitest";

import { buildModeRuleConfigs, LINT_RULES_META, LINT_PRESETS } from "../lint-presets";
import { CORRECTION_MODE_IDS, MODE_TO_PRESET } from "../correction-modes";

describe("buildModeRuleConfigs — applicableModes wiring (校正モード自動有効化)", () => {
  it("returns an object (not null/undefined) for every correction mode", () => {
    for (const mode of CORRECTION_MODE_IDS) {
      const configs = buildModeRuleConfigs(mode);
      expect(configs).toBeDefined();
      expect(typeof configs).toBe("object");
    }
  });

  it("enables exactly the rules whose applicableModes include the mode (strict membership)", () => {
    // LINT_RULES_META is currently empty (all rules migrated to external rulesets).
    // This test remains as the generic invariant: for any rule that IS in META,
    // buildModeRuleConfigs must honour its applicableModes.
    for (const mode of CORRECTION_MODE_IDS) {
      const configs = buildModeRuleConfigs(mode);
      for (const meta of LINT_RULES_META) {
        expect(configs[meta.id].enabled).toBe(meta.applicableModes.includes(mode));
      }
    }
  });

  it("covers every rule for every mode (no missing entries)", () => {
    for (const mode of CORRECTION_MODE_IDS) {
      const configs = buildModeRuleConfigs(mode);
      expect(Object.keys(configs).sort()).toEqual(LINT_RULES_META.map((m) => m.id).sort());
    }
  });

  it("only ever lists valid mode ids in applicableModes", () => {
    const valid = new Set<string>(CORRECTION_MODE_IDS);
    for (const meta of LINT_RULES_META) {
      for (const mode of meta.applicableModes) expect(valid.has(mode)).toBe(true);
    }
  });

  it("LINT_PRESETS has entries for all expected preset keys", () => {
    // Structural smoke-test: preset keys must survive even when configs are empty.
    for (const mode of CORRECTION_MODE_IDS) {
      const presetKey = MODE_TO_PRESET[mode];
      expect(LINT_PRESETS[presetKey]).toBeDefined();
      expect(typeof LINT_PRESETS[presetKey].nameJa).toBe("string");
      expect(typeof LINT_PRESETS[presetKey].configs).toBe("object");
    }
  });
});

describe("buildModeRuleConfigs — regression vs legacy presets", () => {
  // The applicableModes values were derived from the existing presets, so the
  // new mechanism must reproduce the exact enabled-set each mode had before.
  // With LINT_RULES_META empty (all rules migrated to external rulesets), this
  // test confirms the invariant holds generically for whatever rules remain.
  it("matches the legacy preset enabled-set for every mode and rule", () => {
    for (const mode of CORRECTION_MODE_IDS) {
      const configs = buildModeRuleConfigs(mode);
      const legacy = LINT_PRESETS[MODE_TO_PRESET[mode]].configs;
      for (const meta of LINT_RULES_META) {
        expect(configs[meta.id].enabled).toBe(legacy[meta.id].enabled);
      }
    }
  });
});
