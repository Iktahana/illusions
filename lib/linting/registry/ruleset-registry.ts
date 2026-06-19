/**
 * RulesetRegistry — registration, fail-safe quarantine, and derived metadata.
 *
 * Replaces (in a later phase) the hand-written `createJsonDrivenRules()` /
 * `getAllRules()` and the multiply-hardcoded GUIDELINES / RULE_GUIDELINE_MAP /
 * LINT_RULES_META by GENERATING them from each ruleset's manifest.
 *
 * Fail-safe philosophy (mirrors lib/services/startup-checks/dict-corrupt-check):
 * a single broken ruleset (wrong engineApi, id collision, invalid manifest, or a
 * throwing factory) is QUARANTINED with a Japanese warning — every other ruleset
 * keeps working. Duplicate ruleIds are dropped (first wins) to honor the audit's
 * "do not register duplicate rules" (Tier E).
 */
import type { LintRule } from "../types";
import {
  ENGINE_API_VERSION,
  requirementKey,
  type RulesetGuidelineMeta,
  type RulesetManifest,
  type RulesetModule,
  type RulesetRequirement,
  type RulesetRuleMeta,
} from "../sdk/ruleset-types";
import type { RulesetContext } from "../sdk/ruleset-context";
import type { RulesetSourceKind } from "./ruleset-source";

/** Reserved id namespace for rulesets shipped inside illusions. */
export const BUILTIN_NAMESPACE = "builtin.";

export type RulesetWarningCode =
  | "engine-api"
  | "id-collision"
  | "reserved-namespace"
  | "invalid-manifest"
  | "create-failed"
  | "duplicate-rule-id"
  | "requirement-unmet";

export interface RulesetWarning {
  rulesetId: string;
  code: RulesetWarningCode;
  messageJa: string;
  detail?: string;
}

export interface LoadedRulesetEntry {
  manifest: RulesetManifest;
  source: RulesetSourceKind;
  status: "ok" | "quarantined";
  reason?: string;
  module?: RulesetModule;
}

export interface RequirementGate {
  /** Rule ids that must be force-disabled because a requirement is unmet. */
  disabledRuleIds: Set<string>;
  warnings: RulesetWarning[];
}

/** Validate a manifest's shape. Returns a reason string when invalid, else null. */
export function validateManifest(manifest: unknown): string | null {
  if (typeof manifest !== "object" || manifest === null) return "manifest is not an object";
  const m = manifest as Partial<RulesetManifest>;
  if (typeof m.id !== "string" || m.id.length === 0) return "missing id";
  if (typeof m.name !== "string") return "missing name";
  if (typeof m.nameJa !== "string") return "missing nameJa";
  if (typeof m.version !== "string") return "missing version";
  if (typeof m.engineApi !== "number") return "missing engineApi";
  if (!Array.isArray(m.guidelines)) return "guidelines must be an array";
  if (!Array.isArray(m.rules)) return "rules must be an array";
  for (const r of m.rules) {
    if (typeof r?.ruleId !== "string" || r.ruleId.length === 0) return "rule missing ruleId";
    if (r.level !== "L1" && r.level !== "L2" && r.level !== "L3")
      return `rule ${r.ruleId} has invalid level`;
    if (typeof r.defaultConfig !== "object" || r.defaultConfig === null) {
      return `rule ${r.ruleId} missing defaultConfig`;
    }
  }
  return null;
}

export class RulesetRegistry {
  private readonly entries = new Map<string, LoadedRulesetEntry>();
  private readonly warnings: RulesetWarning[] = [];

  /** Register a built-in (statically imported) ruleset. */
  registerBuiltin(mod: RulesetModule): void {
    this.register(mod, "builtin");
  }

  /** Register an external ruleset whose module was already imported by a loader. */
  registerExternal(mod: RulesetModule, source: RulesetSourceKind = "folder"): void {
    this.register(mod, source);
  }

  private register(mod: RulesetModule, source: RulesetSourceKind): void {
    const manifest = mod?.manifest as RulesetManifest | undefined;

    const shapeError = validateManifest(manifest);
    if (shapeError || !manifest) {
      const id = manifest?.id ?? "<unknown>";
      this.quarantine(
        id,
        source,
        manifest,
        "invalid-manifest",
        `不正なマニフェスト: ${shapeError}`,
        shapeError ?? undefined,
      );
      return;
    }

    // Reserved namespace: only built-in registration may use `builtin.`.
    if (source !== "builtin" && manifest.id.startsWith(BUILTIN_NAMESPACE)) {
      this.quarantine(
        manifest.id,
        source,
        manifest,
        "reserved-namespace",
        `ルールセット「${manifest.nameJa}」は予約済み接頭辞 "${BUILTIN_NAMESPACE}" を使用できません。`,
      );
      return;
    }

    // engineApi compatibility.
    if (manifest.engineApi !== ENGINE_API_VERSION) {
      this.quarantine(
        manifest.id,
        source,
        manifest,
        "engine-api",
        `ルールセット「${manifest.nameJa}」は非対応のエンジンAPI(${manifest.engineApi})です。対応版は${ENGINE_API_VERSION}です。`,
        `engineApi=${manifest.engineApi}`,
      );
      return;
    }

    // id collision: keep the first registrant, quarantine the newcomer.
    if (this.entries.has(manifest.id)) {
      this.quarantine(
        manifest.id,
        source,
        manifest,
        "id-collision",
        `ルールセットID「${manifest.id}」が重複しています。後から読み込まれた方を無効化しました。`,
      );
      return;
    }

    this.entries.set(manifest.id, { manifest, source, status: "ok", module: mod });
  }

  private quarantine(
    id: string,
    source: RulesetSourceKind,
    manifest: RulesetManifest | undefined,
    code: RulesetWarningCode,
    messageJa: string,
    detail?: string,
  ): void {
    // Store under a unique key so a quarantined entry never shadows a valid one.
    const key = this.entries.has(id) ? `${id}#quarantined-${this.warnings.length}` : id;
    if (manifest) {
      this.entries.set(key, { manifest, source, status: "quarantined", reason: messageJa });
    }
    this.warnings.push({ rulesetId: id, code, messageJa, detail });
  }

  /** All entries (ok + quarantined). */
  getEntries(): LoadedRulesetEntry[] {
    return [...this.entries.values()];
  }

  /** Manifests of healthy rulesets only. */
  getManifests(): RulesetManifest[] {
    return this.okEntries().map((e) => e.manifest);
  }

  /** Registration + build warnings accumulated so far. */
  getWarnings(): RulesetWarning[] {
    return [...this.warnings];
  }

  private okEntries(): LoadedRulesetEntry[] {
    return [...this.entries.values()].filter((e) => e.status === "ok" && e.module);
  }

  /**
   * Build all lint rules. Each ruleset's factory runs in isolation: a throwing
   * factory quarantines only that ruleset. Duplicate ruleIds are dropped.
   */
  buildRules(ctx: RulesetContext): LintRule[] {
    const out: LintRule[] = [];
    const seenRuleIds = new Set<string>();

    for (const entry of this.okEntries()) {
      let rules: LintRule[];
      try {
        rules = entry.module!.createRules(ctx);
      } catch (err) {
        entry.status = "quarantined";
        entry.reason = "createRules() が例外を投げました。";
        this.warnings.push({
          rulesetId: entry.manifest.id,
          code: "create-failed",
          messageJa: `ルールセット「${entry.manifest.nameJa}」の初期化に失敗しました。`,
          detail: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      for (const rule of rules) {
        if (seenRuleIds.has(rule.id)) {
          this.warnings.push({
            rulesetId: entry.manifest.id,
            code: "duplicate-rule-id",
            messageJa: `ルールID「${rule.id}」が重複しているため、後発の定義を無視しました。`,
            detail: rule.id,
          });
          continue;
        }
        seenRuleIds.add(rule.id);
        out.push(rule);
      }
    }

    return out;
  }

  /** Merge guideline metadata from all healthy rulesets (by id, first wins). */
  buildGuidelines(): Map<string, RulesetGuidelineMeta> {
    const map = new Map<string, RulesetGuidelineMeta>();
    for (const entry of this.okEntries()) {
      for (const g of entry.manifest.guidelines) {
        if (!map.has(g.id)) map.set(g.id, g);
      }
    }
    return map;
  }

  /** ruleId → guidelineId map (first wins on duplicate ruleId). */
  buildRuleGuidelineMap(): Map<string, string | undefined> {
    const map = new Map<string, string | undefined>();
    for (const meta of this.buildRulesMeta()) {
      map.set(meta.ruleId, meta.guidelineId);
    }
    return map;
  }

  /** Flatten rule metadata from all healthy rulesets (dedup by ruleId, first wins). */
  buildRulesMeta(): RulesetRuleMeta[] {
    const seen = new Set<string>();
    const out: RulesetRuleMeta[] = [];
    for (const entry of this.okEntries()) {
      for (const r of entry.manifest.rules) {
        if (seen.has(r.ruleId)) continue;
        seen.add(r.ruleId);
        out.push(r);
      }
    }
    return out;
  }

  /**
   * Determine which rules must be disabled because a declared requirement
   * (e.g. dict:genji) is unmet, with one Japanese warning per affected rule.
   */
  buildRequirementGate(ctx: RulesetContext): RequirementGate {
    const disabledRuleIds = new Set<string>();
    const warnings: RulesetWarning[] = [];

    for (const entry of this.okEntries()) {
      const manifestReqs = entry.manifest.requires ?? [];
      for (const rule of entry.manifest.rules) {
        const reqs: RulesetRequirement[] = [...manifestReqs, ...(rule.requires ?? [])];
        const unmet = reqs.find((req) => ctx.deps.requirements.get(requirementKey(req)) !== true);
        if (unmet) {
          disabledRuleIds.add(rule.ruleId);
          warnings.push({
            rulesetId: entry.manifest.id,
            code: "requirement-unmet",
            messageJa:
              unmet.kind === "dict"
                ? `ルール「${rule.nameJa}」は幻辞辞典が必要です。設定からダウンロードしてください。`
                : `ルール「${rule.nameJa}」は依存関係(${requirementKey(unmet)})を満たしていないため無効です。`,
            detail: requirementKey(unmet),
          });
        }
      }
    }

    return { disabledRuleIds, warnings };
  }
}
