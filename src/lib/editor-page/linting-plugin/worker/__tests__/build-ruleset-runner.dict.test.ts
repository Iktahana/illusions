/**
 * Integration test for the dict:genji snapshot path.
 *
 * Builds a runner from a fake L2 ruleset that flags out-of-dictionary nouns,
 * exactly as the real `illusions-ruleset-genji-vocab` rule does: it reads
 * `ctx.toolkit.dict.lookupCached` and only flags terms that were prewarmed AND
 * absent. Verifies requirement gating, the per-batch snapshot, and the
 * fail-safe (no flags when the dictionary is not ready / a term was not
 * prewarmed).
 */
import { describe, it, expect } from "vitest";

import {
  anyRulesetRequiresDict,
  buildRulesetRunner,
  createIsolatedRulesetContext,
  rulesetRequiresDict,
} from "../build-ruleset-runner";
import { createSnapshotDictToolkit } from "@/lib/linting/toolkit";
import { ENGINE_API_VERSION } from "@/lib/linting/sdk/ruleset-types";
import type { RulesetContext } from "@/lib/linting/sdk/ruleset-context";
import type { RulesetManifest, RulesetModule } from "@/lib/linting/sdk/ruleset-types";
import type { LintIssue, LintRuleConfig } from "@/lib/linting/types";
import type { Token } from "@/lib/nlp-client/types";

function noun(surface: string, start: number): Token {
  return {
    surface,
    pos: "名詞",
    pos_detail_1: "一般",
    basic_form: surface,
    start,
    end: start + surface.length,
  } as Token;
}

/** A fake L2 ruleset whose rule mirrors the real genji-vocab out-of-dict rule. */
function makeDictL2Module(): RulesetModule {
  const manifest: RulesetManifest = {
    id: "com.test.genji-vocab",
    name: "test",
    nameJa: "幻辞テスト",
    version: "1.0.0",
    engineApi: ENGINE_API_VERSION,
    license: "MIT",
    maintainerEmail: "test@example.com",
    requires: [{ kind: "dict", dictId: "genji" }],
    guidelines: [],
    rules: [
      {
        ruleId: "out-of-dict",
        nameJa: "辞書外語",
        descriptionJa: "辞書外語",
        level: "L2",
        defaultConfig: { enabled: true, severity: "info" },
        applicableModes: [],
        docs: { positiveExample: "a", negativeExample: "b", sourceReference: "c" },
        requires: [{ kind: "dict", dictId: "genji" }],
      },
    ],
  };

  return {
    manifest,
    createRules(ctx: RulesetContext) {
      const { AbstractMorphologicalLintRule } = ctx.bases;
      const { dict } = ctx.toolkit;
      class OutOfDict extends AbstractMorphologicalLintRule {
        readonly id = "out-of-dict";
        readonly name = "out-of-dict";
        readonly nameJa = "辞書外語";
        readonly description = "辞書外語";
        readonly descriptionJa = "辞書外語";
        readonly level = "L2" as const;
        readonly defaultConfig: LintRuleConfig = { enabled: true, severity: "info" };
        lintWithTokens(
          _text: string,
          tokens: ReadonlyArray<Token>,
          config: LintRuleConfig,
        ): LintIssue[] {
          if (!config.enabled || !dict.ready) return [];
          const out: LintIssue[] = [];
          for (const t of tokens) {
            if (t.pos !== "名詞") continue;
            const lk = dict.lookupCached(t.surface);
            if (lk !== undefined && lk.found === false) {
              out.push({
                ruleId: this.id,
                severity: config.severity,
                message: `out-of-dict: ${t.surface}`,
                messageJa: `辞書外語: ${t.surface}`,
                from: t.start,
                to: t.end,
              });
            }
          }
          return out;
        }
      }
      return [new OutOfDict()];
    },
  };
}

function buildRunner(dict = createSnapshotDictToolkit()) {
  const mod = makeDictL2Module();
  const { runner } = buildRulesetRunner({
    legacyRules: [],
    externals: [mod],
    ctx: createIsolatedRulesetContext(dict),
    baseGuidelineMapEntries: [],
    configs: new Map(),
    activeGuidelines: null,
  });
  return { runner, dict };
}

describe("rulesetRequiresDict", () => {
  it("detects a ruleset-level dict requirement", () => {
    expect(rulesetRequiresDict(makeDictL2Module())).toBe(true);
    expect(anyRulesetRequiresDict([makeDictL2Module()])).toBe(true);
  });
});

describe("dict:genji snapshot execution", () => {
  // 「猫」が辞書内、「ニャオ」が辞書外。
  const tokens = [noun("猫", 0), noun("ニャオ", 1)];

  it("registers + enables the dict L2 rule (requirement satisfied via snapshot path)", () => {
    const { runner } = buildRunner();
    expect(runner.getRegisteredRules().some((r) => r.id === "out-of-dict")).toBe(true);
    expect(runner.getEnabledRules().some((r) => r.id === "out-of-dict")).toBe(true);
  });

  it("flags only prewarmed-and-absent headwords when ready", () => {
    const { runner, dict } = buildRunner();
    dict.setSnapshot(
      [
        ["猫", { found: true }],
        ["ニャオ", { found: false }],
      ],
      true,
    );
    const issues = runner.runAllWithTokens("猫ニャオ", tokens);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe("out-of-dict");
    expect(issues[0].messageJa).toBe("辞書外語: ニャオ");
    expect([issues[0].from, issues[0].to]).toEqual([1, 4]);
  });

  it("no-ops when the dictionary is not ready (no false positives)", () => {
    const { runner, dict } = buildRunner();
    // Entries present but ready=false (dict not installed).
    dict.setSnapshot(
      [
        ["猫", { found: true }],
        ["ニャオ", { found: false }],
      ],
      false,
    );
    expect(runner.runAllWithTokens("猫ニャオ", tokens)).toHaveLength(0);
  });

  it("no-ops when no snapshot was installed for the batch", () => {
    const { runner } = buildRunner();
    expect(runner.runAllWithTokens("猫ニャオ", tokens)).toHaveLength(0);
  });

  it("skips terms that were not prewarmed (never flags undeclared words)", () => {
    const { runner, dict } = buildRunner();
    // Only 猫 prewarmed; ニャオ absent from the snapshot entirely.
    dict.setSnapshot([["猫", { found: true }]], true);
    expect(runner.runAllWithTokens("猫ニャオ", tokens)).toHaveLength(0);
  });
});
