/// <reference lib="webworker" />

/**
 * Lint Web Worker entry point.
 *
 * Hosts only non-morphological rules (the JSON L1 set). Morphological
 * rules stay on the main thread because their dependencies
 * (`window.electronAPI.dict.*` via `genjiVocab`) are unreachable here.
 *
 * See plan: docs/superpowers/plans/2026-05-05-lint-worker-parallelization.md
 */

import { RuleRunner } from "@/lib/linting/rule-runner";
import { createJsonDrivenRules } from "@/lib/linting/rule-registry";
import { RULE_GUIDELINE_MAP } from "@/lib/linting/lint-presets";
import type { LintIssue } from "@/lib/linting/types";
import { isMorphologicalDocumentLintRule, isMorphologicalLintRule } from "@/lib/linting/types";

import type { SerializedIssueMap, WorkerEvent, WorkerRequest } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

// Module scope acts as the worker singleton — Workers never re-instantiate.
const runner = new RuleRunner();

for (const rule of createJsonDrivenRules()) {
  if (isMorphologicalLintRule(rule) || isMorphologicalDocumentLintRule(rule)) {
    // Defensive: morph rules have IPC-only dependencies, skip if any sneak in.
    continue;
  }
  runner.registerRule(rule);
}

runner.setGuidelineMap(RULE_GUIDELINE_MAP);

function post(msg: WorkerEvent): void {
  self.postMessage(msg);
}

function serialize(map: Map<number, LintIssue[]>): SerializedIssueMap {
  const entries: SerializedIssueMap = [];
  map.forEach((issues, idx) => {
    entries.push([idx, issues]);
  });
  return entries;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    switch (msg.type) {
      case "SET_CONFIG":
        runner.setConfig(msg.ruleId, msg.config);
        return;
      case "SET_ACTIVE_GUIDELINES":
        runner.setActiveGuidelines(msg.guidelines);
        return;
      case "SET_GUIDELINE_MAP":
        runner.setGuidelineMap(new Map(msg.entries));
        return;
      case "RUN_BATCH": {
        const { correlationId, version, paragraphs, mode } = msg;
        const perParagraph = new Map<number, LintIssue[]>();
        const runPer = mode === "per-paragraph" || mode === "both";
        const runDoc = mode === "document" || mode === "both";

        if (runPer) {
          for (const p of paragraphs) {
            perParagraph.set(p.index, runner.runAll(p.text));
          }
        }
        const documentMap: Map<number, LintIssue[]> =
          runDoc && runner.hasDocumentRules()
            ? runner.runDocument(paragraphs.map((p) => ({ text: p.text, index: p.index })))
            : new Map();

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
