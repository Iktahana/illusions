import { describe, it, expect } from "vitest";

import { buildModeRuleConfigs, LINT_RULES_META, LINT_PRESETS } from "../lint-presets";
import { CORRECTION_MODE_IDS, MODE_TO_PRESET } from "../correction-modes";

describe("buildModeRuleConfigs — applicableModes wiring (校正モード自動有効化)", () => {
  it("enables exactly the rules whose applicableModes include the mode (strict membership)", () => {
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

  it("takes severity from the mode's preset, not from applicableModes", () => {
    // strict mode (official) maxes JTF severities to "error"
    const official = buildModeRuleConfigs("official");
    expect(official["jtf-1-2-1"]).toMatchObject({ enabled: true, severity: "error" });
    // novel downgrades jtf-3-1-1 to info but keeps it enabled
    const novel = buildModeRuleConfigs("novel");
    expect(novel["jtf-3-1-1"]).toMatchObject({ enabled: true, severity: "info" });
  });

  it("disables a rule in every mode that is not in its applicableModes", () => {
    // Pick any rule and verify it is OFF in modes it does not opt into.
    const meta = LINT_RULES_META[0];
    expect(meta).toBeDefined();
    const inactiveModes = CORRECTION_MODE_IDS.filter(
      (mode) => !meta.applicableModes.includes(mode),
    );
    for (const mode of inactiveModes) {
      expect(buildModeRuleConfigs(mode)[meta.id].enabled).toBe(false);
    }
  });

  it("only ever lists valid mode ids in applicableModes", () => {
    const valid = new Set<string>(CORRECTION_MODE_IDS);
    for (const meta of LINT_RULES_META) {
      for (const mode of meta.applicableModes) expect(valid.has(mode)).toBe(true);
    }
  });
});

describe("buildModeRuleConfigs — regression vs legacy presets", () => {
  // The applicableModes values were derived from the existing presets, so the
  // new mechanism must reproduce the exact enabled-set each mode had before.
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
