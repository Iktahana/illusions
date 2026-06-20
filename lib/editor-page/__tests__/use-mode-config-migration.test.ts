/**
 * Tests for the one-time mode-config migration decision + derivation.
 *
 * The migration recovers installs whose persisted `lintingRuleConfigs` predates
 * mode-aware derivation — notably existing users left with a COMPLETE
 * all-enabled map (the #1809/#1810 regression + "すべて有効"), which the
 * empty-config seed could not fix because no key was missing.
 */

import { describe, it, expect } from "vitest";

import {
  MODE_CONFIG_MIGRATION_VERSION,
  shouldRunModeConfigMigration,
} from "../use-mode-config-migration";
import { buildModeRuleConfigsFromRules } from "@/lib/linting/mode-rule-configs";
import type { ModeRuleMetaInput } from "@/lib/linting/mode-rule-configs";

describe("shouldRunModeConfigMigration", () => {
  it("does not run before settings are hydrated", () => {
    expect(shouldRunModeConfigMigration(false, 10, 0)).toBe(false);
    expect(shouldRunModeConfigMigration(false, 10, undefined)).toBe(false);
  });

  it("does not run before any rules are loaded (Web / pre-load)", () => {
    expect(shouldRunModeConfigMigration(true, 0, 0)).toBe(false);
    expect(shouldRunModeConfigMigration(true, 0, undefined)).toBe(false);
  });

  it("runs when hydrated, rules loaded, and version is behind (0 / undefined)", () => {
    expect(shouldRunModeConfigMigration(true, 1, 0)).toBe(true);
    expect(shouldRunModeConfigMigration(true, 5, undefined)).toBe(true);
  });

  it("does not run again once the stored version has caught up", () => {
    expect(shouldRunModeConfigMigration(true, 5, MODE_CONFIG_MIGRATION_VERSION)).toBe(false);
    expect(shouldRunModeConfigMigration(true, 5, MODE_CONFIG_MIGRATION_VERSION + 1)).toBe(false);
  });
});

describe("migration derivation (what the hook applies on run)", () => {
  // A COMPLETE all-enabled map across two rulesets, mirroring the real-world
  // regression artifact the migration must repair.
  const rules: ModeRuleMetaInput[] = [
    { ruleId: "gk-yotsugana", applicableModes: ["novel", "official", "blog", "academic", "sns"] },
    { ruleId: "geh-katakana-trailing-choon", applicableModes: ["official", "blog", "academic"] },
    { ruleId: "geh-gaisuu-arabic", applicableModes: ["official", "blog", "academic"] },
  ];

  it("re-derives a complete map that actually filters by the current mode", () => {
    // Pretend the stored state was every rule enabled (regression artifact).
    const novel = buildModeRuleConfigsFromRules("novel", rules);
    // Full coverage: no rule dropped, so the replace contract holds.
    expect(Object.keys(novel).sort()).toEqual([
      "geh-gaisuu-arabic",
      "geh-katakana-trailing-choon",
      "gk-yotsugana",
    ]);
    // Novel keeps the correctness rule, disables the style-only rules.
    expect(novel["gk-yotsugana"].enabled).toBe(true);
    expect(novel["geh-katakana-trailing-choon"].enabled).toBe(false);
    expect(novel["geh-gaisuu-arabic"].enabled).toBe(false);
  });

  it("derives a different result for a different mode (official enables style rules)", () => {
    const official = buildModeRuleConfigsFromRules("official", rules);
    expect(official["gk-yotsugana"].enabled).toBe(true);
    expect(official["geh-katakana-trailing-choon"].enabled).toBe(true);
    expect(official["geh-gaisuu-arabic"].enabled).toBe(true);
  });
});
