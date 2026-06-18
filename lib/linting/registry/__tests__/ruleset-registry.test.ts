import { describe, it, expect } from "vitest";

import { RulesetRegistry, validateManifest } from "../ruleset-registry";
import { ENGINE_API_VERSION } from "../../sdk/ruleset-types";
import { makeContext, makeModule } from "./ruleset-fixtures";

describe("validateManifest", () => {
  it("accepts a well-formed manifest", () => {
    const mod = makeModule({ id: "x.ok" });
    expect(validateManifest(mod.manifest)).toBeNull();
  });

  it("rejects non-objects and missing fields", () => {
    expect(validateManifest(null)).toBeTruthy();
    expect(validateManifest({})).toBe("missing id");
    expect(
      validateManifest({
        id: "a",
        name: "a",
        nameJa: "a",
        version: "1",
        engineApi: 1,
        guidelines: [],
        rules: [{ ruleId: "" }],
      }),
    ).toBe("rule missing ruleId");
  });
});

describe("RulesetRegistry — registration & isolation", () => {
  it("registers a healthy ruleset and builds its rules", () => {
    const reg = new RulesetRegistry();
    reg.registerBuiltin(makeModule({ id: "builtin.a", ruleIds: ["a1", "a2"] }));

    const rules = reg.buildRules(makeContext());
    expect(rules.map((r) => r.id)).toEqual(["a1", "a2"]);
    expect(reg.getWarnings()).toHaveLength(0);
    // rule actually works via the toolkit
    expect(rules[0].lint("すごい！", { enabled: true, severity: "warning" })).toHaveLength(1);
  });

  it("quarantines an engineApi mismatch but keeps others alive", () => {
    const reg = new RulesetRegistry();
    reg.registerBuiltin(makeModule({ id: "builtin.good", ruleIds: ["g1"] }));
    reg.registerExternal(
      makeModule({ id: "ext.bad", ruleIds: ["b1"], engineApi: ENGINE_API_VERSION + 1 }),
    );

    const rules = reg.buildRules(makeContext());
    expect(rules.map((r) => r.id)).toEqual(["g1"]);
    const w = reg.getWarnings();
    expect(w).toHaveLength(1);
    expect(w[0].code).toBe("engine-api");
    expect(w[0].rulesetId).toBe("ext.bad");
  });

  it("quarantines a reserved-namespace id from external sources", () => {
    const reg = new RulesetRegistry();
    reg.registerExternal(makeModule({ id: "builtin.sneaky" }));
    expect(reg.getManifests()).toHaveLength(0);
    expect(reg.getWarnings()[0].code).toBe("reserved-namespace");
  });

  it("keeps the first on id collision, quarantines the newcomer", () => {
    const reg = new RulesetRegistry();
    reg.registerBuiltin(makeModule({ id: "builtin.dup", ruleIds: ["first"] }));
    reg.registerExternal(makeModule({ id: "builtin.dup", ruleIds: ["second"] }));
    // reserved namespace check fires first for the external "builtin." id
    expect(reg.getWarnings()[0].code).toBe("reserved-namespace");

    const reg2 = new RulesetRegistry();
    reg2.registerExternal(makeModule({ id: "ext.dup", ruleIds: ["first"] }));
    reg2.registerExternal(makeModule({ id: "ext.dup", ruleIds: ["second"] }));
    const rules = reg2.buildRules(makeContext());
    expect(rules.map((r) => r.id)).toEqual(["first"]);
    expect(reg2.getWarnings()[0].code).toBe("id-collision");
  });

  it("quarantines a throwing factory, others still build", () => {
    const reg = new RulesetRegistry();
    reg.registerBuiltin(makeModule({ id: "builtin.boom", ruleIds: ["x"], createThrows: true }));
    reg.registerBuiltin(makeModule({ id: "builtin.fine", ruleIds: ["y"] }));

    const rules = reg.buildRules(makeContext());
    expect(rules.map((r) => r.id)).toEqual(["y"]);
    expect(reg.getWarnings().some((w) => w.code === "create-failed")).toBe(true);
  });

  it("drops duplicate ruleIds across rulesets (first wins, Tier E)", () => {
    const reg = new RulesetRegistry();
    reg.registerBuiltin(makeModule({ id: "builtin.one", ruleIds: ["shared"] }));
    reg.registerBuiltin(makeModule({ id: "builtin.two", ruleIds: ["shared", "unique"] }));

    const rules = reg.buildRules(makeContext());
    expect(rules.map((r) => r.id)).toEqual(["shared", "unique"]);
    expect(reg.getWarnings().some((w) => w.code === "duplicate-rule-id")).toBe(true);
  });

  it("rejects an invalid manifest shape", () => {
    const reg = new RulesetRegistry();
    const broken = makeModule({ id: "ext.broken" });
    // @ts-expect-error intentionally corrupt the manifest for the test
    broken.manifest.rules = "nope";
    reg.registerExternal(broken);
    expect(reg.getManifests()).toHaveLength(0);
    expect(reg.getWarnings()[0].code).toBe("invalid-manifest");
  });
});

describe("RulesetRegistry — derived metadata", () => {
  it("merges guidelines and builds the rule→guideline map", () => {
    const reg = new RulesetRegistry();
    reg.registerBuiltin(
      makeModule({ id: "builtin.g", ruleIds: ["r1", "r2"], guidelineId: "gl-1" }),
    );

    expect([...reg.buildGuidelines().keys()]).toEqual(["gl-1"]);
    expect(reg.buildRuleGuidelineMap().get("r1")).toBe("gl-1");
    expect(reg.buildRulesMeta().map((m) => m.ruleId)).toEqual(["r1", "r2"]);
  });
});

describe("RulesetRegistry — requirement gating (dict)", () => {
  it("disables dict rules with a warning when the dictionary is not ready", () => {
    const reg = new RulesetRegistry();
    reg.registerBuiltin(
      makeModule({
        id: "builtin.dict",
        ruleIds: ["needs-dict", "plain"],
        dictRuleIds: ["needs-dict"],
      }),
    );

    const gate = reg.buildRequirementGate(makeContext("not-installed"));
    expect(gate.disabledRuleIds.has("needs-dict")).toBe(true);
    expect(gate.disabledRuleIds.has("plain")).toBe(false);
    expect(gate.warnings[0].code).toBe("requirement-unmet");
    expect(gate.warnings[0].messageJa).toContain("幻辞辞典");
  });

  it("enables dict rules when the dictionary is ready", () => {
    const reg = new RulesetRegistry();
    reg.registerBuiltin(
      makeModule({ id: "builtin.dict2", ruleIds: ["needs-dict"], dictRuleIds: ["needs-dict"] }),
    );

    const gate = reg.buildRequirementGate(makeContext("ready"));
    expect(gate.disabledRuleIds.size).toBe(0);
    expect(gate.warnings).toHaveLength(0);
  });
});
