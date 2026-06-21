/**
 * Tests for the external ruleset loading path.
 *
 * These tests exercise the registry + context wiring WITHOUT a real Web Worker.
 * They verify:
 *   1. A real external ruleset (gendai-kanazukai) can be registered, rules built,
 *      and the gk-yotsugana rule fires on a negative example.
 *   2. A module with wrong engineApi is quarantined and does not throw.
 */

import { describe, it, expect } from "vitest";
import type { GenjiHealth } from "@/lib/dict/dict-access";
import { RulesetRegistry } from "@/lib/linting/registry/ruleset-registry";
import { createRulesetContext } from "@/lib/linting/registry/ruleset-context-factory";
import type { RulesetModule } from "@/lib/linting/sdk/ruleset-types";
import type { LintRuleConfig } from "@/lib/linting/types";

// -------------------------------------------------------------------------
// Shared test helpers
// -------------------------------------------------------------------------

const NOT_READY_HEALTH: GenjiHealth = { state: "not-installed" };

const NO_OP_DICT = {
  async lookupBatch(_terms: string[]): Promise<Map<string, never>> {
    return new Map<string, never>();
  },
  async has(_term: string): Promise<boolean> {
    return false;
  },
};

function makeNotReadyCtx() {
  return createRulesetContext({
    dictHealth: NOT_READY_HEALTH,
    dict: NO_OP_DICT,
    requirements: new Map([["dict:genji", false]]),
  });
}

// -------------------------------------------------------------------------
// gendai-kanazukai-shaped module (inline, CI-safe)
//
// Mirrors the real com.illusions-lab.gendai-kanazukai module's structure and
// gk-yotsugana behavior WITHOUT importing the external repo (which is not on
// disk in CI). This proves the same registry + ctx wiring an actual downloaded
// module exercises. The real blob: import is verified manually in Electron.
// -------------------------------------------------------------------------

/** Build a RulesetModule equivalent to gendai-kanazukai's gk-yotsugana. */
function makeYotsuganaModule(): RulesetModule {
  const YOTSU_PAIRS: ReadonlyArray<{ pattern: RegExp; correct: string }> = [
    { pattern: /ちじ(?=み|む|ま[るりれ]|め|こま|れ)/, correct: "ちぢ" },
    { pattern: /つず(?=み|ら|く|け|る|り|め)/, correct: "つづ" },
    { pattern: /はなじ(?!ろ)/, correct: "はなぢ" },
  ];
  const manifest: RulesetModule["manifest"] = {
    id: "com.illusions-lab.gendai-kanazukai",
    name: "Gendai Kanazukai (1986)",
    nameJa: "現代仮名遣い（内閣告示 1986）",
    version: "0.1.0",
    engineApi: 1,
    license: "MIT",
    maintainerEmail: "rulesets@illusions.app",
    rulesetPrefix: "gk-",
    guidelines: [],
    rules: [
      {
        ruleId: "gk-yotsugana",
        nameJa: "四つ仮名（ぢ・づ）の使い分け",
        descriptionJa: "「ぢ」「づ」を用いる語が「じ」「ず」と誤記されていないか検出します。",
        level: "L1",
        defaultConfig: { enabled: true, severity: "warning" },
        applicableModes: ["novel", "official", "blog", "academic", "sns"],
        docs: {
          positiveExample: "シャツがちぢむ。",
          negativeExample: "シャツがちじむ。",
          sourceReference: "現代仮名遣い（昭和61年内閣告示第1号）本文 第2の5(1)",
        },
      },
    ],
  };
  return {
    manifest,
    createRules(ctx) {
      const rule = manifest.rules[0];
      class Yotsugana extends ctx.bases.AbstractL1Rule {
        lint(text: string, config: LintRuleConfig) {
          if (!config.enabled) return [];
          const out = YOTSU_PAIRS.flatMap(({ pattern, correct }) =>
            ctx.toolkit.regexReplace({
              text,
              pattern,
              ruleId: this.id,
              severity: config.severity,
              message: `Use ぢ/づ here: "${correct}"`,
              messageJa: `現代仮名遣いに基づき、ここは「${correct}」と表記します。`,
              replacement: () => correct,
            }),
          );
          return ctx.toolkit.dedupe(out).sort((a, b) => a.from - b.from);
        }
      }
      return [
        new Yotsugana(ctx.toolkit.toJsonRuleMeta(rule, manifest), {
          id: rule.ruleId,
          name: rule.nameJa,
          nameJa: rule.nameJa,
          description: rule.descriptionJa,
          descriptionJa: rule.descriptionJa,
          defaultConfig: rule.defaultConfig,
        }),
      ];
    },
  };
}

describe("external ruleset — gendai-kanazukai shape", () => {
  it("registers, builds rules, and gk-yotsugana fires on a negative example", () => {
    const registry = new RulesetRegistry();
    registry.registerExternal(makeYotsuganaModule(), "folder");

    // No engine-api quarantine expected.
    expect(registry.getWarnings().filter((w) => w.code === "engine-api")).toHaveLength(0);

    const rules = registry.buildRules(makeNotReadyCtx());
    const yotsu = rules.find((r) => r.id === "gk-yotsugana");
    expect(yotsu).toBeDefined();

    // Negative example: シャツがちじむ — should flag (ちじ → ちぢ).
    const issues = yotsu!.lint("シャツがちじむ。", { enabled: true, severity: "warning" });
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].ruleId).toBe("gk-yotsugana");
  });

  it("positive example シャツがちぢむ produces no issues", () => {
    const registry = new RulesetRegistry();
    registry.registerExternal(makeYotsuganaModule(), "folder");
    const rules = registry.buildRules(makeNotReadyCtx());
    const yotsu = rules.find((r) => r.id === "gk-yotsugana");
    expect(yotsu).toBeDefined();
    const issues = yotsu!.lint("シャツがちぢむ。", { enabled: true, severity: "warning" });
    expect(issues).toHaveLength(0);
  });
});

// -------------------------------------------------------------------------
// Quarantine: wrong engineApi
// -------------------------------------------------------------------------

describe("external ruleset — engineApi mismatch quarantine", () => {
  it("quarantines a module with engineApi=2 and does NOT throw", () => {
    const badModule: RulesetModule = {
      manifest: {
        id: "test.bad-api",
        name: "Bad API Module",
        nameJa: "テスト：不正APIバージョン",
        version: "0.0.1",
        engineApi: 2, // wrong — current is 1
        license: "MIT",
        maintainerEmail: "test@example.com",
        rulesetPrefix: "bad-",
        guidelines: [],
        rules: [],
      },
      createRules(_ctx) {
        // Should never be called for a quarantined module.
        throw new Error("createRules should not be called for quarantined module");
      },
    };

    const registry = new RulesetRegistry();
    // Must not throw.
    expect(() => registry.registerExternal(badModule, "folder")).not.toThrow();

    const warnings = registry.getWarnings();
    const engineWarn = warnings.find(
      (w) => w.rulesetId === "test.bad-api" && w.code === "engine-api",
    );
    expect(engineWarn).toBeDefined();

    // buildRules must not throw and must return no rules from this module.
    const ctx = makeNotReadyCtx();
    let rules: ReturnType<RulesetRegistry["buildRules"]> = [];
    expect(() => {
      rules = registry.buildRules(ctx);
    }).not.toThrow();
    expect(rules.find((r) => r.id.startsWith("bad-"))).toBeUndefined();
  });
});

// -------------------------------------------------------------------------
// Inline fixture: minimal L1 ruleset
// -------------------------------------------------------------------------

describe("external ruleset — inline fixture", () => {
  it("registers and runs a minimal inline L1 ruleset", () => {
    const ctx = makeNotReadyCtx();
    const { AbstractL1Rule } = ctx.bases;

    // Build a minimal ruleset module inline (simulates what a downloaded module does).
    const inlineModule: RulesetModule = {
      manifest: {
        id: "test.inline-fixture",
        name: "Inline Test Fixture",
        nameJa: "インラインテスト",
        version: "0.0.1",
        engineApi: 1,
        license: "MIT",
        maintainerEmail: "test@example.com",
        rulesetPrefix: "test-",
        guidelines: [],
        rules: [
          {
            ruleId: "test-inline-rule",
            nameJa: "テストルール",
            descriptionJa: "テスト用インラインルール",
            level: "L1",
            defaultConfig: { enabled: true, severity: "warning" },
            applicableModes: [],
            docs: {
              positiveExample: "正しい文",
              negativeExample: "NGの文",
              sourceReference: "テスト",
            },
          },
        ],
      },
      createRules(ruleCtx) {
        class TestRule extends ruleCtx.bases.AbstractL1Rule {
          lint(text: string, config: LintRuleConfig) {
            if (!config.enabled) return [];
            return ruleCtx.toolkit.regexReplace({
              text,
              pattern: /NG/g,
              ruleId: this.id,
              severity: config.severity,
              message: "NG found",
              messageJa: "NGが見つかりました",
              replacement: () => "OK",
            });
          }
        }
        return [
          new TestRule(
            ruleCtx.toolkit.toJsonRuleMeta(inlineModule.manifest.rules[0], inlineModule.manifest),
            {
              id: "test-inline-rule",
              name: "Test Rule",
              nameJa: "テストルール",
              description: "Test",
              descriptionJa: "テスト",
              defaultConfig: { enabled: true, severity: "warning" },
            },
          ),
        ];
      },
    };

    const registry = new RulesetRegistry();
    registry.registerExternal(inlineModule, "folder");
    expect(registry.getWarnings()).toHaveLength(0);

    const rules = registry.buildRules(ctx);
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe("test-inline-rule");

    const issues = rules[0].lint("これはNGの文です。", { enabled: true, severity: "warning" });
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].ruleId).toBe("test-inline-rule");
  });

  it("suppresses AbstractL1Rule usage in test (no-op, just type check)", () => {
    // Ensure `AbstractL1Rule` is accessible from context (it's needed by external modules).
    const ctx = makeNotReadyCtx();
    expect(typeof ctx.bases.AbstractL1Rule).toBe("function");
    expect(typeof ctx.toolkit.regexReplace).toBe("function");
    expect(typeof ctx.toolkit.nfkc).toBe("function");
    // dict is not-ready in worker-local context.
    expect(ctx.toolkit.dict.ready).toBe(false);
    expect(ctx.deps.requirements.get("dict:genji")).toBe(false);
  });
});
