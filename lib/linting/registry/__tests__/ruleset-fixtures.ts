/**
 * Test-only ruleset fixtures. NOT a product ruleset — used to exercise the
 * registry's registration, isolation, and metadata-generation behavior.
 */
import type { GenjiHealth, GenjiHealthState } from "@/lib/dict/dict-access";

import { ENGINE_API_VERSION } from "../../sdk/ruleset-types";
import type {
  RulesetManifest,
  RulesetModule,
  RulesetRequirement,
  RulesetRuleMeta,
} from "../../sdk/ruleset-types";
import type { RulesetContext } from "../../sdk/ruleset-context";
import { createRulesetContext } from "../ruleset-context-factory";

/** A dictionary stub that records calls; used to assert fail-safe behavior. */
export const fakeDict = {
  calls: 0,
  async lookupBatch(terms: string[]) {
    this.calls += 1;
    return new Map(terms.map((t) => [t, { found: true }]));
  },
  async has() {
    this.calls += 1;
    return true;
  },
};

export function makeContext(state: GenjiHealthState = "ready"): RulesetContext {
  const dictHealth: GenjiHealth = { state };
  return createRulesetContext({ dictHealth, dict: fakeDict });
}

interface MakeModuleOptions {
  id: string;
  ruleIds?: string[];
  engineApi?: number;
  guidelineId?: string;
  /** rule ids that should declare a dict:genji requirement */
  dictRuleIds?: string[];
  /** make createRules throw */
  createThrows?: boolean;
}

function ruleMeta(
  ruleId: string,
  guidelineId: string | undefined,
  requires: RulesetRequirement[] | undefined,
): RulesetRuleMeta {
  return {
    ruleId,
    nameJa: ruleId,
    descriptionJa: ruleId,
    level: "L1",
    guidelineId,
    defaultConfig: { enabled: true, severity: "warning" },
    docs: { positiveExample: "正しい例", negativeExample: "誤った例！", sourceReference: "test" },
    ...(requires ? { requires } : {}),
  };
}

export function makeModule(opts: MakeModuleOptions): RulesetModule {
  const ruleIds = opts.ruleIds ?? ["r1"];
  const rules: RulesetRuleMeta[] = ruleIds.map((id) =>
    ruleMeta(
      id,
      opts.guidelineId,
      opts.dictRuleIds?.includes(id) ? [{ kind: "dict", dictId: "genji" }] : undefined,
    ),
  );

  const manifest: RulesetManifest = {
    id: opts.id,
    name: opts.id,
    nameJa: opts.id,
    version: "1.0.0",
    engineApi: opts.engineApi ?? ENGINE_API_VERSION,
    license: "MIT",
    guidelines: opts.guidelineId
      ? [
          {
            id: opts.guidelineId,
            nameJa: opts.guidelineId,
            publisherJa: "-",
            year: null,
            license: "Public",
            descriptionJa: "-",
          },
        ]
      : [],
    rules,
  };

  return {
    manifest,
    createRules(ctx: RulesetContext) {
      if (opts.createThrows) throw new Error("boom");
      const { AbstractL1Rule } = ctx.bases;
      return rules.map((rm) => {
        const meta = ctx.toolkit.toJsonRuleMeta(rm, manifest);
        class FixtureRule extends AbstractL1Rule {
          lint(text: string, config: { enabled: boolean; severity: "error" | "warning" | "info" }) {
            if (!config.enabled) return [];
            return ctx.toolkit.regexReplace({
              text,
              pattern: /！/,
              ruleId: this.id,
              severity: config.severity,
              message: "full-width exclamation",
              messageJa: "全角！",
              replacement: () => "!",
            });
          }
        }
        return new FixtureRule(meta, {
          id: rm.ruleId,
          name: rm.nameJa,
          nameJa: rm.nameJa,
          description: rm.descriptionJa,
          descriptionJa: rm.descriptionJa,
          defaultConfig: rm.defaultConfig,
        });
      });
    },
  };
}
