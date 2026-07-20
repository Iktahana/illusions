import { describe, it, expect } from "vitest";

import { buildModeRuleConfigsFromRules, type ModeRuleMetaInput } from "../mode-rule-configs";
import { CORRECTION_MODE_IDS } from "../correction-modes";
import type { CorrectionModeId } from "../correction-config";

/**
 * Regression guard for the #1809/#1810 mode-switch wiring.
 *
 * The legacy `buildModeRuleConfigs(modeId)` iterates `LINT_RULES_META`, which is
 * now empty (all rules moved to external rulesets), so its tests pass vacuously
 * and cannot detect that mode switching toggles nothing at runtime. This suite
 * exercises `buildModeRuleConfigsFromRules` with representative *runtime* rule
 * metadata — the only source that actually exists in production today.
 */

// Representative metadata mirroring what useRulesetStatus() supplies per rule.
const RULES: ModeRuleMetaInput[] = [
  {
    // novel-only rule
    ruleId: "me2-17-repetition-symbols",
    applicableModes: ["novel"],
    defaultConfig: { enabled: true, severity: "info" },
  },
  {
    // shared across official + academic (the two "strict" modes)
    ruleId: "jtf-1-2-1",
    applicableModes: ["official", "academic"],
    defaultConfig: { enabled: true, severity: "error" },
  },
  {
    // universal-ish rule present in several modes
    ruleId: "nh-6-ji-zu-di-du-exceptions",
    applicableModes: ["novel", "official", "blog", "academic", "sns"],
    defaultConfig: { enabled: true, severity: "error" },
  },
  {
    // opted into NO mode — manual toggle only, must always be disabled by a mode
    ruleId: "me2-11-vertical-numbers",
    applicableModes: [],
    defaultConfig: { enabled: false, severity: "warning" },
  },
];

describe("buildModeRuleConfigsFromRules — runtime applicableModes wiring", () => {
  it("enables exactly the rules whose applicableModes include the selected mode", () => {
    for (const mode of CORRECTION_MODE_IDS) {
      const configs = buildModeRuleConfigsFromRules(mode, RULES);
      for (const rule of RULES) {
        const expected = (rule.applicableModes ?? []).includes(mode);
        expect(configs[rule.ruleId].enabled).toBe(expected);
      }
    }
  });

  it("switching novel -> official flips the membership of the affected rules", () => {
    const novel = buildModeRuleConfigsFromRules("novel", RULES);
    const official = buildModeRuleConfigsFromRules("official", RULES);

    // novel-only rule: on in novel, off in official
    expect(novel["me2-17-repetition-symbols"].enabled).toBe(true);
    expect(official["me2-17-repetition-symbols"].enabled).toBe(false);

    // official/academic rule: off in novel, on in official
    expect(novel["jtf-1-2-1"].enabled).toBe(false);
    expect(official["jtf-1-2-1"].enabled).toBe(true);
  });

  it("a rule with empty applicableModes is disabled under every mode", () => {
    for (const mode of CORRECTION_MODE_IDS) {
      const configs = buildModeRuleConfigsFromRules(mode, RULES);
      expect(configs["me2-11-vertical-numbers"].enabled).toBe(false);
    }
  });

  it("returns a COMPLETE map covering every supplied rule (replace-safe)", () => {
    for (const mode of CORRECTION_MODE_IDS) {
      const configs = buildModeRuleConfigsFromRules(mode, RULES);
      expect(Object.keys(configs).sort()).toEqual(RULES.map((r) => r.ruleId).sort());
    }
  });

  it("carries the rule's default severity (falling back to warning)", () => {
    const configs = buildModeRuleConfigsFromRules("official", RULES);
    expect(configs["jtf-1-2-1"].severity).toBe("error");
    expect(configs["me2-17-repetition-symbols"].severity).toBe("info");

    // Missing/invalid severity falls back to "warning".
    const fallback = buildModeRuleConfigsFromRules("novel", [
      { ruleId: "x-no-default", applicableModes: ["novel"] },
      {
        ruleId: "x-bad-sev",
        applicableModes: ["novel"],
        defaultConfig: { enabled: true, severity: "critical" },
      },
    ]);
    expect(fallback["x-no-default"].severity).toBe("warning");
    expect(fallback["x-bad-sev"].severity).toBe("warning");
  });

  it("preserves skipDialogue from defaultConfig when present", () => {
    const configs = buildModeRuleConfigsFromRules("novel", [
      {
        ruleId: "x-skip",
        applicableModes: ["novel"],
        defaultConfig: { enabled: true, severity: "warning", skipDialogue: true },
      },
    ]);
    expect(configs["x-skip"].skipDialogue).toBe(true);
  });

  it("carries manifest defaultConfig.options into the mode config (#1975 non-regression)", () => {
    const configs = buildModeRuleConfigsFromRules("novel", [
      {
        ruleId: "genji-out-of-dict",
        applicableModes: ["novel"],
        defaultConfig: {
          enabled: true,
          severity: "info",
          options: { includeVerbsAdjectives: false },
        },
      },
    ]);
    expect(configs["genji-out-of-dict"].options).toEqual({ includeVerbsAdjectives: false });
  });

  it("merges user option overrides from prevConfigs over manifest defaults (#2048)", () => {
    const rules: ModeRuleMetaInput[] = [
      {
        ruleId: "genji-out-of-dict",
        applicableModes: ["novel"],
        defaultConfig: {
          enabled: true,
          severity: "info",
          options: { includeVerbsAdjectives: false, minLength: 2 },
        },
      },
    ];
    const prev = {
      "genji-out-of-dict": {
        enabled: true,
        severity: "info",
        options: { includeVerbsAdjectives: true },
      },
    };
    const configs = buildModeRuleConfigsFromRules("novel", rules, prev);
    // User's true wins over the manifest false; untouched keys keep defaults.
    expect(configs["genji-out-of-dict"].options).toEqual({
      includeVerbsAdjectives: true,
      minLength: 2,
    });
  });

  it("user option overrides survive a mode switch even for rules leaving the mode (#2048)", () => {
    const rules: ModeRuleMetaInput[] = [
      {
        ruleId: "genji-out-of-dict",
        applicableModes: ["novel"],
        defaultConfig: {
          enabled: true,
          severity: "info",
          options: { includeVerbsAdjectives: false },
        },
      },
    ];
    const prev = {
      "genji-out-of-dict": {
        enabled: true,
        severity: "info" as const,
        options: { includeVerbsAdjectives: true },
      },
    };
    // Switch to a mode the rule does NOT opt into: enabled flips off (strict
    // membership), but the user's option override must be retained so it is
    // still there when the user switches back.
    const official = buildModeRuleConfigsFromRules("official", rules, prev);
    expect(official["genji-out-of-dict"].enabled).toBe(false);
    expect(official["genji-out-of-dict"].options).toEqual({ includeVerbsAdjectives: true });
  });

  it("emits no options key when neither manifest nor prevConfigs define one", () => {
    const configs = buildModeRuleConfigsFromRules(
      "novel",
      [{ ruleId: "plain", applicableModes: ["novel"], defaultConfig: { severity: "warning" } }],
      { plain: { options: undefined } },
    );
    expect("options" in configs["plain"]).toBe(false);
  });

  it("an empty rule list yields an empty map (Web has no rulesets)", () => {
    for (const mode of CORRECTION_MODE_IDS) {
      expect(buildModeRuleConfigsFromRules(mode, [])).toEqual({});
    }
  });

  it("ignores invalid / unknown mode ids in applicableModes (strict membership)", () => {
    const configs = buildModeRuleConfigsFromRules("novel", [
      {
        ruleId: "x-bogus-mode",
        applicableModes: ["definitely-not-a-mode" as CorrectionModeId, "official"],
        defaultConfig: { enabled: true, severity: "warning" },
      },
    ]);
    // novel is not listed -> disabled
    expect(configs["x-bogus-mode"].enabled).toBe(false);
  });

  it("keeps the first entry on duplicate ruleIds", () => {
    const configs = buildModeRuleConfigsFromRules("novel", [
      { ruleId: "dup", applicableModes: ["novel"], defaultConfig: { severity: "error" } },
      { ruleId: "dup", applicableModes: [], defaultConfig: { severity: "info" } },
    ]);
    expect(configs["dup"].enabled).toBe(true);
    expect(configs["dup"].severity).toBe("error");
  });
});
