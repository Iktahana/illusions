/// <reference lib="webworker" />

/**
 * Lint Web Worker entry point.
 *
 * Hosts only non-morphological rules (the JSON L1 set). Morphological
 * rules stay on the main thread because their dependencies
 * (`window.electronAPI.dict.*` via `genjiVocab`) are unreachable here.
 *
 * External rulesets (downloaded from the marketplace) are loaded here
 * alongside legacy rules via LOAD_RULESET / UNLOAD_RULESET messages.
 *
 * See plan: docs/superpowers/plans/2026-05-05-lint-worker-parallelization.md
 */

import { RuleRunner } from "@/lib/linting/rule-runner";
import { createJsonDrivenRules } from "@/lib/linting/rule-registry";
import { RULE_GUIDELINE_MAP } from "@/lib/linting/lint-presets";
import type { LintIssue, LintRuleConfig } from "@/lib/linting/types";
import { isMorphologicalDocumentLintRule, isMorphologicalLintRule } from "@/lib/linting/types";
import { RulesetRegistry } from "@/lib/linting/registry/ruleset-registry";
import type { RulesetModule } from "@/lib/linting/sdk/ruleset-types";
import { createSnapshotDictToolkit } from "@/lib/linting/toolkit";
import {
  anyRulesetRequiresDict,
  buildRulesetRunner,
  createIsolatedRulesetContext,
  importRulesetModule,
} from "./build-ruleset-runner";
import type {
  RulesetLoadWarning,
  SerializedIssueMap,
  WorkerEvent,
  WorkerRequest,
} from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

// -------------------------------------------------------------------------
// Legacy rules (JSON-driven, always present)
// -------------------------------------------------------------------------

/** Build the set of non-morphological legacy rules. */
function buildLegacyRules() {
  return createJsonDrivenRules().filter(
    (rule) => !isMorphologicalLintRule(rule) && !isMorphologicalDocumentLintRule(rule),
  );
}

const legacyRules = buildLegacyRules();

// -------------------------------------------------------------------------
// External ruleset state
// -------------------------------------------------------------------------

/** Map from ruleset id → loaded module (only successfully-loaded modules). */
const loadedExternals = new Map<string, RulesetModule>();

/** Last-known config snapshot, replayed onto rebuilt runners. */
const lastConfigs = new Map<string, LintRuleConfig>();
/** Last-known active guidelines, replayed onto rebuilt runners. */
let lastGuidelines: string[] | null = null;
/** Last-known guideline map (legacy part), replayed onto rebuilt runners. */
let lastGuidelineMapEntries: Array<[string, string | undefined]> = Array.from(
  RULE_GUIDELINE_MAP.entries(),
);

// -------------------------------------------------------------------------
// Active runner (swapped on successful rebuild)
// -------------------------------------------------------------------------

/**
 * Persistent snapshot-backed dictionary toolkit. Survives runner rebuilds so the
 * per-batch prewarm installed on RUN_BATCH stays valid for the rules that closed
 * over it. Built once; the renderer fills it via `setSnapshot`.
 */
const workerDict = createSnapshotDictToolkit();

/** Build a fresh RuleRunner = legacy ∪ all currently-loaded external rules. */
function buildRunner(): { runner: RuleRunner; ruleGuidelineMap: Map<string, string | undefined> } {
  return buildRulesetRunner({
    legacyRules,
    externals: loadedExternals.values(),
    ctx: createIsolatedRulesetContext(workerDict),
    baseGuidelineMapEntries: lastGuidelineMapEntries,
    configs: lastConfigs,
    activeGuidelines: lastGuidelines,
  });
}

/** Whether any loaded ruleset requires the Genji dictionary. */
function hasDictRules(): boolean {
  return anyRulesetRequiresDict(loadedExternals.values());
}

// Initial runner (no externals yet).
let { runner } = buildRunner();

/**
 * Whether the runner hosts at least one *registered* morphological rule,
 * ignoring enabled state. Reported in RULESET_LOADED so the proxy starts
 * forwarding tokens before SET_CONFIG enables the new rules.
 */
function runnerHasRegisteredMorphRules(r: RuleRunner): boolean {
  return r
    .getRegisteredRules()
    .some((rule) => isMorphologicalLintRule(rule) || isMorphologicalDocumentLintRule(rule));
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function post(msg: WorkerEvent): void {
  self.postMessage(msg);
}

function serialize(map: Map<number, LintIssue[]>): SerializedIssueMap {
  // Drop empty entries — the main thread treats missing keys as "no
  // issues", and skipping them keeps the structured-clone payload small
  // for long documents.
  const entries: SerializedIssueMap = [];
  map.forEach((issues, idx) => {
    if (issues.length > 0) entries.push([idx, issues]);
  });
  return entries;
}

// -------------------------------------------------------------------------
// Message handler
// -------------------------------------------------------------------------

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;

  // LOAD_RULESET and UNLOAD_RULESET are async; handle them separately.
  if (msg.type === "LOAD_RULESET") {
    handleLoadRuleset(msg.correlationId, msg.id, msg.code).catch((err) => {
      // Should not reach here since handleLoadRuleset catches internally,
      // but guard just in case.
      post({
        type: "ERROR",
        correlationId: msg.correlationId,
        error: {
          name: err instanceof Error ? err.name : "Error",
          message: err instanceof Error ? err.message : String(err),
        },
      });
    });
    return;
  }

  if (msg.type === "UNLOAD_RULESET") {
    handleUnloadRuleset(msg.correlationId, msg.id);
    return;
  }

  try {
    switch (msg.type) {
      case "SET_CONFIG":
        lastConfigs.set(msg.ruleId, msg.config);
        runner.setConfig(msg.ruleId, msg.config);
        return;
      case "SET_ACTIVE_GUIDELINES":
        lastGuidelines = msg.guidelines;
        runner.setActiveGuidelines(msg.guidelines);
        return;
      case "SET_GUIDELINE_MAP":
        lastGuidelineMapEntries = msg.entries;
        runner.setGuidelineMap(new Map(msg.entries));
        return;
      case "RUN_BATCH": {
        const { correlationId, version, paragraphs, mode, dict } = msg;
        // Install the prewarmed dictionary snapshot for this batch (or clear it
        // when absent) so `dict:genji` rules read fresh per-batch membership and
        // never a stale snapshot from a previous run.
        if (dict) {
          workerDict.setSnapshot(dict.entries, dict.ready);
        } else {
          workerDict.clearSnapshot();
        }
        const perParagraph = new Map<number, LintIssue[]>();
        const runPer = mode === "per-paragraph" || mode === "both";
        const runDoc = mode === "document" || mode === "both";

        if (runPer) {
          for (const p of paragraphs) {
            // `runAllWithTokens` runs L1 rules via lint() AND enabled L2 rules
            // via lintWithTokens(), so it fully replaces runAll() when tokens
            // are present (no double execution). Tokens arrive only when an
            // external morphological ruleset is loaded; otherwise L1-only.
            const issues = p.tokens
              ? runner.runAllWithTokens(p.text, p.tokens)
              : runner.runAll(p.text);
            if (issues.length > 0) perParagraph.set(p.index, issues);
          }
        }
        const documentMap: Map<number, LintIssue[]> =
          runDoc && runner.hasDocumentRules() ? runner.runDocument(paragraphs) : new Map();

        post({
          type: "RESPONSE",
          correlationId,
          version,
          perParagraph: serialize(perParagraph),
          document: serialize(documentMap),
        });
        return;
      }
      default: {
        const _exhaustive: never = msg;
        void _exhaustive;
      }
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    post({
      type: "ERROR",
      correlationId: "correlationId" in msg ? msg.correlationId : undefined,
      error: { name: error.name, message: error.message },
    });
  }
};

// -------------------------------------------------------------------------
// LOAD_RULESET handler
// -------------------------------------------------------------------------

async function handleLoadRuleset(correlationId: number, id: string, code: string): Promise<void> {
  try {
    const mod = await importRulesetModule(code);

    // Register into a temporary registry for validation (quarantine check).
    const tempRegistry = new RulesetRegistry();
    tempRegistry.registerExternal(mod, "folder");
    const tempWarnings = tempRegistry.getWarnings();

    if (tempWarnings.some((w) => w.rulesetId === id && w.code === "engine-api")) {
      // Module was quarantined — do NOT store it.
      const warnings: RulesetLoadWarning[] = tempWarnings.map((w) => ({
        code: w.code,
        messageJa: w.messageJa,
        detail: w.detail,
      }));
      post({
        type: "RULESET_LOADED",
        correlationId,
        id,
        ok: false,
        ruleIds: [],
        warnings,
        hasMorphologicalRules: runnerHasRegisteredMorphRules(runner),
        hasDictRules: hasDictRules(),
      });
      return;
    }

    // Store the new module (overwrite if re-loading the same id).
    loadedExternals.set(id, mod);

    // Rebuild runner from legacy ∪ all externals.
    // If buildRunner() throws, the existing runner is left intact (failure isolation).
    const { runner: newRunner } = buildRunner();
    runner = newRunner;

    // Collect ruleIds contributed by this module's manifest.
    const ruleIds = (mod.manifest?.rules ?? []).map((r) => r.ruleId);

    // Gather all warnings from the rebuild registry.
    const allWarnings: RulesetLoadWarning[] = tempWarnings.map((w) => ({
      code: w.code,
      messageJa: w.messageJa,
      detail: w.detail,
    }));

    post({
      type: "RULESET_LOADED",
      correlationId,
      id,
      ok: true,
      ruleIds,
      warnings: allWarnings,
      hasMorphologicalRules: runnerHasRegisteredMorphRules(runner),
      hasDictRules: hasDictRules(),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const warnings: RulesetLoadWarning[] = [
      {
        code: "load-failed",
        messageJa: "ルールセットの読み込みに失敗しました",
        detail,
      },
    ];
    // Leave existing runner intact (failure isolation).
    post({
      type: "RULESET_LOADED",
      correlationId,
      id,
      ok: false,
      ruleIds: [],
      warnings,
      hasMorphologicalRules: runnerHasRegisteredMorphRules(runner),
      hasDictRules: hasDictRules(),
    });
  }
}

// -------------------------------------------------------------------------
// UNLOAD_RULESET handler
// -------------------------------------------------------------------------

function handleUnloadRuleset(correlationId: number, id: string): void {
  loadedExternals.delete(id);
  try {
    const { runner: newRunner } = buildRunner();
    runner = newRunner;
    post({
      type: "RULESET_LOADED",
      correlationId,
      id,
      ok: true,
      ruleIds: [],
      warnings: [],
      hasMorphologicalRules: runnerHasRegisteredMorphRules(runner),
      hasDictRules: hasDictRules(),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    post({
      type: "RULESET_LOADED",
      correlationId,
      id,
      ok: false,
      ruleIds: [],
      warnings: [
        {
          code: "unload-rebuild-failed",
          messageJa: "ルールセットの削除後の再構築に失敗しました",
          detail,
        },
      ],
      hasMorphologicalRules: runnerHasRegisteredMorphRules(runner),
      hasDictRules: hasDictRules(),
    });
  }
}

self.onerror = (e) => {
  // Surface any uncaught script-level error. correlationId omitted because
  // there's no specific request to attribute it to.
  const error = e instanceof ErrorEvent ? e.error : null;
  post({
    type: "ERROR",
    error: error
      ? { name: error.name ?? "Error", message: error.message ?? String(e) }
      : { name: "Error", message: String(e) },
  });
};

// Signal readiness — must happen after the runner is fully wired so that
// any queued main-thread requests find an initialized registry.
post({ type: "READY" });
